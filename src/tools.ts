import { saveWorkflow, listWorkflows, getWorkflow, deleteWorkflow } from "./workflows"
import { setReminder } from "./reminders"
import { fetchAllEmails, sendEmail, getPrimaryAccount, getAccountByEmail, loadEmailAccounts } from "./email"
import { generateInvoice, generateContract, InvoiceData, ContractData } from "./invoice"
import path from "path"

// Pending documents waiting for user approval: key = approvalId
export const pendingApprovals = new Map<string, {
  type: "invoice" | "contract" | "both"
  files: string[]
  customerEmail: string
  customerName: string
  subject: string
  body: string
  fromEmail?: string
}>()

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

  // Email tools
  {
    name: "fetch_emails",
    description: "Fetch recent unread emails from all configured email accounts. Returns emails sorted by date, newest first.",
    input_schema: {
      type: "object",
      properties: {
        max_per_account: { type: "number", description: "Max emails to fetch per account (default 20)" },
      },
    },
  },
  {
    name: "generate_invoice",
    description: "Generate a PDF invoice from quote/project details. Use when user wants to turn a quote into an invoice.",
    input_schema: {
      type: "object",
      properties: {
        customer_name: { type: "string" },
        customer_email: { type: "string" },
        customer_address: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number" },
              unit_price: { type: "number" },
            },
            required: ["description", "quantity", "unit_price"],
          },
        },
        notes: { type: "string" },
        payment_terms: { type: "string" },
        from_email: { type: "string", description: "Which of your email addresses to send from (optional)" },
      },
      required: ["customer_name", "customer_email", "items"],
    },
  },
  {
    name: "generate_contract",
    description: "Generate a PDF service contract/agreement from project details.",
    input_schema: {
      type: "object",
      properties: {
        customer_name: { type: "string" },
        customer_email: { type: "string" },
        project_description: { type: "string" },
        deliverables: { type: "array", items: { type: "string" } },
        total_amount: { type: "number" },
        payment_schedule: { type: "string" },
        start_date: { type: "string" },
        completion_date: { type: "string" },
        special_terms: { type: "string" },
        from_email: { type: "string" },
      },
      required: ["customer_name", "customer_email", "project_description", "deliverables", "total_amount", "payment_schedule"],
    },
  },
  {
    name: "send_documents",
    description: "Send generated invoice/contract documents to the customer via email after user approves. Use the approval_id returned by generate_invoice or generate_contract.",
    input_schema: {
      type: "object",
      properties: {
        approval_id: { type: "string", description: "The approval ID returned when documents were generated" },
      },
      required: ["approval_id"],
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

      case "fetch_emails": {
        const emails = await fetchAllEmails((input.max_per_account as number) ?? 20)
        if (!emails.length) return "No unread emails found across configured accounts."
        return emails.map(e =>
          `[${e.account}] ${e.date.slice(0, 10)} | From: ${e.from} | Subject: ${e.subject}\n${e.body.slice(0, 300)}`
        ).join("\n\n---\n\n")
      }

      case "generate_invoice": {
        const biz = {
          businessName: process.env.BUSINESS_NAME ?? "Snowskiers Warehouse",
          businessABN: process.env.BUSINESS_ABN ?? "",
          businessAddress: process.env.BUSINESS_ADDRESS ?? "",
          businessEmail: process.env.BUSINESS_EMAIL ?? "",
          businessPhone: process.env.BUSINESS_PHONE ?? "",
        }
        const items = (input.items as Array<{ description: string; quantity: number; unit_price: number }>)
          .map(i => ({ description: i.description, quantity: i.quantity, unitPrice: i.unit_price }))
        const invoiceNum = `INV-${Date.now().toString().slice(-6)}`
        const today = new Date()
        const due = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
        const data: InvoiceData = {
          invoiceNumber: invoiceNum,
          date: today.toLocaleDateString("en-AU"),
          dueDate: due.toLocaleDateString("en-AU"),
          ...biz,
          customerName: input.customer_name as string,
          customerEmail: input.customer_email as string,
          customerAddress: input.customer_address as string | undefined,
          items,
          notes: input.notes as string | undefined,
          paymentTerms: (input.payment_terms as string) ?? "Payment due within 14 days of invoice date. Bank transfer preferred.",
        }
        const filepath = await generateInvoice(data)
        const approvalId = `inv-${Date.now()}`
        pendingApprovals.set(approvalId, {
          type: "invoice",
          files: [filepath],
          customerEmail: input.customer_email as string,
          customerName: input.customer_name as string,
          subject: `Invoice ${invoiceNum} from ${biz.businessName}`,
          body: `Please find attached Invoice ${invoiceNum}.\n\nThank you for your business.\n\n${biz.businessName}`,
          fromEmail: input.from_email as string | undefined,
        })
        return `INVOICE_GENERATED:${approvalId}:${filepath}`
      }

      case "generate_contract": {
        const biz = {
          businessName: process.env.BUSINESS_NAME ?? "Snowskiers Warehouse",
          businessABN: process.env.BUSINESS_ABN ?? "",
        }
        const contractNum = `CON-${Date.now().toString().slice(-6)}`
        const data: ContractData = {
          contractNumber: contractNum,
          date: new Date().toLocaleDateString("en-AU"),
          ...biz,
          customerName: input.customer_name as string,
          customerEmail: input.customer_email as string,
          projectDescription: input.project_description as string,
          deliverables: input.deliverables as string[],
          totalAmount: input.total_amount as number,
          paymentSchedule: input.payment_schedule as string,
          startDate: input.start_date as string | undefined,
          completionDate: input.completion_date as string | undefined,
          specialTerms: input.special_terms as string | undefined,
        }
        const filepath = await generateContract(data)
        const approvalId = `con-${Date.now()}`
        pendingApprovals.set(approvalId, {
          type: "contract",
          files: [filepath],
          customerEmail: input.customer_email as string,
          customerName: input.customer_name as string,
          subject: `Service Agreement ${contractNum} from ${biz.businessName}`,
          body: `Please find attached your Service Agreement.\n\nPlease review, sign, and return a copy at your earliest convenience.\n\n${biz.businessName}`,
          fromEmail: input.from_email as string | undefined,
        })
        return `CONTRACT_GENERATED:${approvalId}:${filepath}`
      }

      case "send_documents": {
        const approvalId = input.approval_id as string
        const pending = pendingApprovals.get(approvalId)
        if (!pending) return `No pending document found with id "${approvalId}". It may have already been sent.`
        const accounts = loadEmailAccounts()
        const fromAccount = (pending.fromEmail ? getAccountByEmail(pending.fromEmail) : null) ?? getPrimaryAccount()
        if (!fromAccount) return "Error: No email account configured. Add EMAIL_ACCOUNTS env var."
        await sendEmail(
          fromAccount,
          pending.customerEmail,
          pending.subject,
          pending.body,
          pending.files.map(f => ({ filename: path.basename(f), path: f }))
        )
        pendingApprovals.delete(approvalId)
        return `Documents sent to ${pending.customerName} (${pending.customerEmail}) from ${fromAccount.email}.`
      }

      default:
        return `Unknown tool: ${name}`
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`
  }
}
