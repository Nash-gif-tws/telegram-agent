import fs from "fs"
import path from "path"

const WORKFLOWS_FILE = path.join(process.cwd(), "data", "workflows.json")

export interface Workflow {
  name: string
  description: string
  steps: string // Natural language instructions Claude will execute
  createdAt: string
  updatedAt: string
}

function ensureDataDir() {
  const dir = path.dirname(WORKFLOWS_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function load(): Record<string, Workflow> {
  ensureDataDir()
  if (!fs.existsSync(WORKFLOWS_FILE)) return {}
  try {
    return JSON.parse(fs.readFileSync(WORKFLOWS_FILE, "utf8"))
  } catch {
    return {}
  }
}

function save(workflows: Record<string, Workflow>) {
  ensureDataDir()
  fs.writeFileSync(WORKFLOWS_FILE, JSON.stringify(workflows, null, 2))
}

export function saveWorkflow(id: string, name: string, description: string, steps: string): string {
  const workflows = load()
  const now = new Date().toISOString()
  const existing = workflows[id]
  workflows[id] = {
    name,
    description,
    steps,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  save(workflows)
  return `Workflow "${name}" saved as "${id}".`
}

export function listWorkflows(): string {
  const workflows = load()
  const keys = Object.keys(workflows)
  if (keys.length === 0) return "No workflows saved yet."
  return keys
    .map((k) => `• **${k}** — ${workflows[k].name}: ${workflows[k].description}`)
    .join("\n")
}

export function getWorkflow(id: string): Workflow | null {
  const workflows = load()
  return workflows[id] ?? null
}

export function deleteWorkflow(id: string): string {
  const workflows = load()
  if (!workflows[id]) return `No workflow found with id "${id}".`
  delete workflows[id]
  save(workflows)
  return `Workflow "${id}" deleted.`
}
