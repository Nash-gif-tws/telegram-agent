import { saveWorkflow, listWorkflows, getWorkflow, deleteWorkflow } from "./workflows"
import { setReminder } from "./reminders"

// ─── Tool Definitions ──────────────────────────────────────────────────────────

export const toolDefinitions = [
  // Built-in Anthropic server-side tools
  { type: "web_search_20260209", name: "web_search" },
  { type: "web_fetch_20260209", name: "web_fetch" },

  // Workflow management
  {
    name: "save_workflow",
    description: "Save a named workflow so it can be triggered by name later. Use this when the user asks to save, create, or update a workflow.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Short unique identifier e.g. 'morning', 'weekly_report'" },
        name: { type: "string", description: "Human-readable name" },
        description: { type: "string", description: "One sentence describing what it does" },
        steps: { type: "string", description: "Full natural language instructions for what to do when this workflow runs" },
      },
      required: ["id", "name", "description", "steps"],
    },
  },
  {
    name: "list_workflows",
    description: "List all saved workflows.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_workflow",
    description: "Get the steps for a specific workflow by id, so you can execute them.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The workflow id" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_workflow",
    description: "Delete a saved workflow.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The workflow id to delete" },
      },
      required: ["id"],
    },
  },

  // HTTP requests — lets Claude call any external API
  {
    name: "http_request",
    description: "Make an HTTP request to any URL. Use this to call APIs (Shopify, Railway, Slack, email services, etc.).",
    input_schema: {
      type: "object",
      properties: {
        method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], description: "HTTP method" },
        url: { type: "string", description: "Full URL to request" },
        headers: { type: "object", description: "Request headers as key-value pairs", additionalProperties: { type: "string" } },
        body: { type: "string", description: "Request body as a JSON string (for POST/PUT/PATCH)" },
      },
      required: ["method", "url"],
    },
  },

  // Reminders
  {
    name: "set_reminder",
    description: "Set a one-time reminder that will message the user after a delay.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The reminder message to send" },
        delay_minutes: { type: "number", description: "How many minutes from now to send the reminder" },
      },
      required: ["message", "delay_minutes"],
    },
  },
]

// ─── Tool Execution ────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (name) {
      case "save_workflow":
        return saveWorkflow(
          input.id as string,
          input.name as string,
          input.description as string,
          input.steps as string
        )

      case "list_workflows":
        return listWorkflows()

      case "get_workflow": {
        const wf = getWorkflow(input.id as string)
        if (!wf) return `No workflow found with id "${input.id}".`
        return `**${wf.name}**\n${wf.description}\n\nSteps:\n${wf.steps}`
      }

      case "delete_workflow":
        return deleteWorkflow(input.id as string)

      case "http_request": {
        const { method, url, headers = {}, body } = input as {
          method: string
          url: string
          headers?: Record<string, string>
          body?: string
        }
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json", ...headers },
          body: body ?? undefined,
        })
        const text = await res.text()
        // Try to parse as JSON for cleaner output
        try {
          return JSON.stringify(JSON.parse(text), null, 2)
        } catch {
          return text
        }
      }

      case "set_reminder":
        return setReminder(input.message as string, input.delay_minutes as number)

      default:
        return `Unknown tool: ${name}`
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}
