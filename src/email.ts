import Imap from "imap"
import { simpleParser } from "mailparser"
import nodemailer from "nodemailer"
import fs from "fs"

export interface EmailAccount {
  name: string       // friendly label e.g. "Main", "Support"
  email: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  user: string
  password: string   // Gmail: use App Password
  tls: boolean
}

export interface EmailMessage {
  account: string
  from: string
  to: string
  subject: string
  date: string
  body: string
  messageId?: string
}

// Load email accounts from env
// Format: EMAIL_ACCOUNTS=JSON array of EmailAccount
export function loadEmailAccounts(): EmailAccount[] {
  const raw = process.env.EMAIL_ACCOUNTS
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    console.error("Invalid EMAIL_ACCOUNTS env var — must be JSON array")
    return []
  }
}

// Fetch recent emails from one account
export async function fetchEmails(
  account: EmailAccount,
  maxEmails = 20,
  sinceDate?: Date
): Promise<EmailMessage[]> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: account.user,
      password: account.password,
      host: account.imapHost,
      port: account.imapPort,
      tls: account.tls,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 10000,
    })

    const messages: EmailMessage[] = []

    imap.once("ready", () => {
      imap.openBox("INBOX", true, (err, box) => {
        if (err) { imap.end(); reject(err); return }

        const since = sinceDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        const searchCriteria = ["UNSEEN", ["SINCE", since.toISOString()]]

        imap.search(searchCriteria, (err, uids) => {
          if (err || !uids.length) { imap.end(); resolve([]); return }

          const fetch = imap.fetch(uids.slice(-maxEmails), { bodies: "" })
          const pending: Promise<void>[] = []

          fetch.on("message", (msg) => {
            const p = new Promise<void>((res) => {
              msg.on("body", (stream) => {
                simpleParser(stream, (err, parsed) => {
                  if (!err) {
                    messages.push({
                      account: account.name,
                      from: Array.isArray(parsed.from) ? parsed.from[0]?.text ?? "" : parsed.from?.text ?? "",
                      to: Array.isArray(parsed.to) ? parsed.to[0]?.text ?? "" : parsed.to?.text ?? "",
                      subject: parsed.subject ?? "(no subject)",
                      date: parsed.date?.toISOString() ?? new Date().toISOString(),
                      body: (parsed.text ?? "").slice(0, 2000), // truncate for context
                      messageId: parsed.messageId,
                    })
                  }
                  res()
                })
              })
            })
            pending.push(p)
          })

          fetch.once("end", async () => {
            await Promise.all(pending)
            imap.end()
            resolve(messages)
          })

          fetch.once("error", (e) => { imap.end(); reject(e) })
        })
      })
    })

    imap.once("error", reject)
    imap.connect()
  })
}

// Fetch from all configured accounts
export async function fetchAllEmails(maxPerAccount = 20): Promise<EmailMessage[]> {
  const accounts = loadEmailAccounts()
  if (!accounts.length) return []

  const results = await Promise.allSettled(
    accounts.map((acc) => fetchEmails(acc, maxPerAccount))
  )

  return results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

// Send an email with optional attachments
export async function sendEmail(
  fromAccount: EmailAccount,
  to: string,
  subject: string,
  body: string,
  attachments?: Array<{ filename: string; path: string }>
): Promise<string> {
  const transporter = nodemailer.createTransport({
    host: fromAccount.smtpHost,
    port: fromAccount.smtpPort,
    secure: fromAccount.smtpPort === 465,
    auth: { user: fromAccount.user, pass: fromAccount.password },
  })

  await transporter.sendMail({
    from: `"${fromAccount.name}" <${fromAccount.email}>`,
    to,
    subject,
    text: body,
    attachments: attachments?.map((a) => ({
      filename: a.filename,
      content: fs.createReadStream(a.path),
    })),
  })

  return `Email sent to ${to} from ${fromAccount.email}`
}

// Get the primary (first) account for sending
export function getPrimaryAccount(): EmailAccount | null {
  const accounts = loadEmailAccounts()
  return accounts[0] ?? null
}

export function getAccountByEmail(email: string): EmailAccount | null {
  return loadEmailAccounts().find((a) => a.email === email) ?? null
}
