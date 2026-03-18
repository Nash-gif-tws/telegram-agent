import Anthropic from "@anthropic-ai/sdk"
import { toolDefinitions } from "./tools"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const conversations = new Map<number, Anthropic.MessageParam[]>()
const MAX_HISTORY = 20

const SYSTEM_PROMPT = `You are a helpful personal AI assistant. You have access to web search and web browsing to find current information.

Be concise and direct. Use markdown formatting when it helps readability. If a task needs web search, just do it without asking.`

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
      // Server-side tools run automatically — just feed back empty results
      const toolResults = response.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
        .map((b) => ({
          type: "tool_result" as const,
          tool_use_id: b.id,
          content: "",
        }))
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
