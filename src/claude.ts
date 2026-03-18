import Anthropic from "@anthropic-ai/sdk"
import { toolDefinitions, executeTool } from "./tools"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Per-user conversation history
const conversations = new Map<number, Anthropic.MessageParam[]>()
const MAX_HISTORY = 20 // keep last 20 messages per user

const SYSTEM_PROMPT = `You are a personal AI assistant for the owner of Snowskiers Warehouse (snowskierswarehouse.com.au) — a snow sports retail and rental shop in Rockdale, Sydney.

You have access to powerful tools:
- **web_search / web_fetch**: search the web and fetch pages
- **run_command**: run shell commands on the server (Railway CLI, git, npm, etc.)
- **query_rental_db**: query the rental management system database
- **shopify_query**: query the Shopify store via GraphQL

You help automate the owner's life: checking business metrics, managing deployments, looking up orders and bookings, researching topics, and running tasks.

Be concise and action-oriented. Use tools proactively — don't ask if you should check something, just do it. Format responses clearly with markdown when helpful. Numbers should be formatted with $ and commas for currency.

Current projects: rental-system (custom rental management replacing Twice), socialflow (social media scheduler), inventory-agent (Shopify inventory intelligence).`

export async function chat(userId: number, message: string): Promise<string> {
  // Get or init conversation
  if (!conversations.has(userId)) {
    conversations.set(userId, [])
  }
  const history = conversations.get(userId)!

  // Add user message
  history.push({ role: "user", content: message })

  // Trim history if too long
  while (history.length > MAX_HISTORY) history.shift()

  // Agentic loop — Claude may use multiple tools
  let iterations = 0
  const MAX_ITERATIONS = 10

  while (iterations < MAX_ITERATIONS) {
    iterations++

    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      thinking: { type: "adaptive" },
      // @ts-ignore — tool type mixing (built-in + custom)
      tools: toolDefinitions,
      messages: history,
    })

    // Add assistant response to history
    history.push({ role: "assistant", content: response.content })

    if (response.stop_reason === "end_turn") {
      // Extract text response
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as Anthropic.TextBlock).text)
        .join("\n")
      return text || "(no response)"
    }

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      )

      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const tool of toolUseBlocks) {
        const result = await executeTool(tool.name, tool.input as Record<string, string>)
        toolResults.push({
          type: "tool_result",
          tool_use_id: tool.id,
          content: result,
        })
      }

      history.push({ role: "user", content: toolResults })
      continue
    }

    // Any other stop reason
    break
  }

  return "I hit my action limit. Try a simpler request."
}

export function clearHistory(userId: number) {
  conversations.delete(userId)
}

export function getHistoryLength(userId: number): number {
  return conversations.get(userId)?.length ?? 0
}
