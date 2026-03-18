import "dotenv/config"
import { Telegraf } from "telegraf"
import { message } from "telegraf/filters"
import { chat, clearHistory, getHistoryLength } from "./claude"
import { initReminders } from "./reminders"
import { pendingApprovals } from "./tools"
import fs from "fs"

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!)

// Whitelist — only you can use this bot
const ALLOWED_USER_IDS = (process.env.ALLOWED_TELEGRAM_IDS || "")
  .split(",")
  .map((id) => parseInt(id.trim()))
  .filter(Boolean)

function isAllowed(userId: number): boolean {
  if (ALLOWED_USER_IDS.length === 0) return true // open if not configured
  return ALLOWED_USER_IDS.includes(userId)
}

// ─── Commands ─────────────────────────────────────────────────────────────────

bot.command("start", (ctx) => {
  const userId = ctx.from.id
  if (ALLOWED_USER_IDS.length > 0) initReminders(bot, userId)
  ctx.reply(
    `Hey! I'm your personal Claude agent.\n\nI can:\n• Search the web & fetch pages\n• Save and run named workflows\n• Call any external API\n• Set reminders\n\n/workflows — list saved workflows\n/clear — reset conversation\n/status — show info`
  )
})

bot.command("workflows", async (ctx) => {
  const response = await chat(ctx.from.id, "list my saved workflows")
  ctx.reply(response, { parse_mode: "Markdown" })
})

bot.command("clear", (ctx) => {
  clearHistory(ctx.from.id)
  ctx.reply("Conversation cleared. Fresh start!")
})

bot.command("status", (ctx) => {
  const len = getHistoryLength(ctx.from.id)
  ctx.reply(`Messages in memory: ${len}\nModel: Claude Opus 4.6`)
})

// ─── Messages ──────────────────────────────────────────────────────────────────

bot.on(message("text"), async (ctx) => {
  const userId = ctx.from.id

  // Init reminders so the bot can message this user back
  initReminders(bot, userId)

  if (!isAllowed(userId)) {
    ctx.reply("Sorry, this bot is private.")
    return
  }

  // Show typing indicator
  await ctx.sendChatAction("typing")

  const userMessage = ctx.message.text

  try {
    // Keep typing indicator going for longer tasks
    const typingInterval = setInterval(() => {
      ctx.sendChatAction("typing").catch(() => {})
    }, 4000)

    const response = await chat(userId, userMessage)
    clearInterval(typingInterval)

    // Check if Claude generated documents — send them as PDFs
    const docMatches = [...response.matchAll(/(INVOICE|CONTRACT)_GENERATED:([^:]+):(.+?)(?=\n|$)/g)]
    for (const match of docMatches) {
      const [, docType, approvalId, filepath] = match
      const pending = pendingApprovals.get(approvalId)
      if (pending && fs.existsSync(filepath)) {
        await ctx.replyWithDocument(
          { source: filepath, filename: filepath.split(/[\\/]/).pop()! },
          { caption: `📄 ${docType === "INVOICE" ? "Invoice" : "Contract"} for ${pending.customerName}\n\nReply with "send ${approvalId}" to email this to ${pending.customerEmail}, or "discard ${approvalId}" to cancel.` }
        )
      }
    }

    // Strip internal tokens from the text response
    const cleanResponse = response
      .replace(/(INVOICE|CONTRACT)_GENERATED:[^\n]+/g, "")
      .trim()

    if (!cleanResponse) return

    // Telegram has 4096 char limit — split if needed
    if (cleanResponse.length <= 4096) {
      await ctx.reply(cleanResponse, { parse_mode: "Markdown" })
    } else {
      // Split on double newlines
      const chunks: string[] = []
      let current = ""
      for (const line of response.split("\n")) {
        if ((current + line).length > 3800) {
          chunks.push(current.trim())
          current = line + "\n"
        } else {
          current += line + "\n"
        }
      }
      if (current.trim()) chunks.push(current.trim())
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "Markdown" })
      }
    }

    // Handle quick "send <id>" / "discard <id>" shortcuts
    const sendMatch = userMessage.match(/^send\s+((?:inv|con)-\d+)/i)
    const discardMatch = userMessage.match(/^discard\s+((?:inv|con)-\d+)/i)
    if (sendMatch) {
      const result = await chat(userId, `Use the send_documents tool with approval_id "${sendMatch[1]}"`)
      await ctx.reply(result, { parse_mode: "Markdown" })
    } else if (discardMatch) {
      pendingApprovals.delete(discardMatch[1])
      await ctx.reply(`Discarded. Document not sent.`)
    }
  } catch (err) {
    console.error("Error:", err)
    ctx.reply(`Error: ${err instanceof Error ? err.message : "Something went wrong"}`)
  }
})

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || "3000")
const WEBHOOK_URL = process.env.WEBHOOK_URL

if (WEBHOOK_URL) {
  // Production: use webhook
  bot.launch({
    webhook: {
      domain: WEBHOOK_URL,
      port: PORT,
    },
  })
  console.log(`Bot running on webhook: ${WEBHOOK_URL}`)
} else {
  // Development: use polling
  bot.launch()
  console.log("Bot running with polling")
}

process.once("SIGINT", () => bot.stop("SIGINT"))
process.once("SIGTERM", () => bot.stop("SIGTERM"))
