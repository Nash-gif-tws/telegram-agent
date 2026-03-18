import cron from "node-cron"
import { Telegraf } from "telegraf"

let botInstance: Telegraf | null = null
let ownerUserId: number | null = null

export function initReminders(bot: Telegraf, userId: number) {
  botInstance = bot
  ownerUserId = userId
}

// One-time reminders using setTimeout
export function setReminder(message: string, delayMinutes: number): string {
  if (!botInstance || !ownerUserId) return "Reminders not initialised."
  const ms = delayMinutes * 60 * 1000
  setTimeout(() => {
    botInstance!.telegram.sendMessage(ownerUserId!, `⏰ Reminder: ${message}`)
  }, ms)
  return `Reminder set for ${delayMinutes} minute${delayMinutes === 1 ? "" : "s"} from now.`
}

// Recurring scheduled workflows using cron
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const scheduledJobs = new Map<string, any>()

export function scheduleWorkflow(
  id: string,
  cronExpression: string,
  triggerMessage: string,
  sendMessageFn: (userId: number, text: string) => void
): string {
  // Cancel existing if any
  scheduledJobs.get(id)?.stop()

  const task = cron.schedule(cronExpression, () => {
    if (ownerUserId) {
      sendMessageFn(ownerUserId, triggerMessage)
    }
  })
  scheduledJobs.set(id, task)
  return `Scheduled workflow "${id}" with cron: ${cronExpression}`
}

export function cancelSchedule(id: string): string {
  const task = scheduledJobs.get(id)
  if (!task) return `No active schedule for "${id}".`
  task.stop()
  scheduledJobs.delete(id)
  return `Schedule for "${id}" cancelled.`
}
