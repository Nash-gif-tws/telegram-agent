import Anthropic from "@anthropic-ai/sdk"
import { toolDefinitions, executeTool } from "./tools"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const conversations = new Map<number, Anthropic.MessageParam[]>()
const MAX_HISTORY = 20

const SYSTEM_PROMPT = `You are a helpful personal AI assistant with tools to search the web, call APIs, manage workflows, and set reminders.

**Workflows:** You can save, list, and run named workflows. When the user asks to "run X" or "do X", check if a workflow exists for it using get_workflow, then execute its steps. When saving a workflow, write detailed steps so you can execute them autonomously later.

**HTTP requests:** Use http_request to call any external API — Shopify, Railway, Slack, email services, webhooks, etc.

**Reminders:** Use set_reminder for one-time future messages.

Be concise and action-oriented. Execute tasks directly without asking for confirmation unless something is genuinely ambiguous. Use markdown formatting when it helps.`

export async function chat(userId: number, message: string): Promise<string> {
  if (!conversations.has(userId)) conversations.set(userId, [])
  const history = conversations.get(userId)!

  history.push({ role: "user", content: message })
  while (history.length > MAX_HISTORY) history.shift()

  let iterations = 0

  while (iterations++ < 10) {
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      // @ts-ignore
      tools: toolDefinitions,
      messages: history,
    })

    history.push({ role: "assistant", content: response.content })

    if (response.stop_reason === "end_turn") {
      return response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n") || "(no response)"
    }

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      )
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of toolUseBlocks) {
        // Server-side tools (web_search, web_fetch) run automatically — empty result
        // Custom tools need to be executed here
        const isServerSide = ["web_search", "web_fetch"].includes(block.name)
        const result = isServerSide
          ? ""
          : await executeTool(block.name, block.input as Record<string, unknown>)
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result })
      }
      history.push({ role: "user", content: toolResults })
    }
  }

  return "Hit action limit — try a simpler request."
}

export function clearHistory(userId: number) {
  conversations.delete(userId)
}

export function getHistoryLength(userId: number): number {
  return conversations.get(userId)?.length ?? 0
}
