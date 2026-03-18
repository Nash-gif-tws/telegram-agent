import "dotenv/config"
import { Telegraf } from "telegraf"
import { message } from "telegraf/filters"
import { chat, clearHistory, getHistoryLength } from "./claude"

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
  ctx.reply(
    `Hey! I'm your personal Claude agent.\n\nI can:\n• Search the web\n• Check your rental system & Shopify\n• Run server commands\n• Help with anything\n\n/clear — reset conversation\n/status — show conversation info`
  )
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

    // Telegram has 4096 char limit — split if needed
    if (response.length <= 4096) {
      await ctx.reply(response, { parse_mode: "Markdown" })
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
