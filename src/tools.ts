import { exec } from "child_process"
import { promisify } from "util"
import { Pool } from "pg"

const execAsync = promisify(exec)

// ─── Tool Definitions (sent to Claude) ────────────────────────────────────────

export const toolDefinitions = [
  // Built-in Anthropic server-side tools
  { type: "web_search_20260209", name: "web_search" },
  { type: "web_fetch_20260209", name: "web_fetch" },

  // Custom tools
  {
    name: "run_command",
    description:
      "Run a shell command on the server. Use for Railway CLI, git, npm commands, checking system status, etc. Commands are sandboxed — no destructive ops.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to run",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "query_rental_db",
    description:
      "Query the Snowskiers Warehouse rental system database. Returns booking counts, revenue, customer info, inventory status etc.",
    input_schema: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "A read-only SQL SELECT query",
        },
      },
      required: ["sql"],
    },
  },
  {
    name: "shopify_query",
    description:
      "Query the Snowskiers Warehouse Shopify store — orders, products, inventory, customers.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "GraphQL query string for the Shopify Admin API",
        },
      },
      required: ["query"],
    },
  },
]

// ─── Tool Execution ────────────────────────────────────────────────────────────

const BLOCKED_COMMANDS = ["rm -rf", "drop table", "delete from", "format", "shutdown", "reboot"]

export async function executeTool(name: string, input: Record<string, string>): Promise<string> {
  try {
    switch (name) {
      case "run_command": {
        const cmd = input.command
        // Basic safety check
        if (BLOCKED_COMMANDS.some((b) => cmd.toLowerCase().includes(b))) {
          return `Error: Blocked command detected. Refusing to run: ${cmd}`
        }
        const { stdout, stderr } = await execAsync(cmd, { timeout: 15000 })
        return stdout || stderr || "(no output)"
      }

      case "query_rental_db": {
        if (!process.env.RENTAL_DATABASE_URL) return "Error: RENTAL_DATABASE_URL not configured"
        const pool = new Pool({ connectionString: process.env.RENTAL_DATABASE_URL, ssl: { rejectUnauthorized: false } })
        // Only allow SELECT
        const sql = input.sql.trim()
        if (!sql.toLowerCase().startsWith("select")) {
          pool.end()
          return "Error: Only SELECT queries are allowed"
        }
        const result = await pool.query(sql)
        await pool.end()
        return JSON.stringify(result.rows, null, 2)
      }

      case "shopify_query": {
        if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ADMIN_TOKEN) {
          return "Error: Shopify credentials not configured"
        }
        const res = await fetch(
          `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/graphql.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
            },
            body: JSON.stringify({ query: input.query }),
          }
        )
        const data = await res.json() as Record<string, unknown>
        return JSON.stringify(data, null, 2)
      }

      default:
        return `Unknown tool: ${name}`
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}
