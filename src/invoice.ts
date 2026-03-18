import PDFDocument from "pdfkit"
import fs from "fs"
import path from "path"

export interface LineItem {
  description: string
  quantity: number
  unitPrice: number
}

export interface InvoiceData {
  invoiceNumber: string
  date: string
  dueDate: string
  // Business (sender)
  businessName: string
  businessABN: string
  businessAddress: string
  businessEmail: string
  businessPhone: string
  // Customer
  customerName: string
  customerEmail: string
  customerAddress?: string
  // Line items
  items: LineItem[]
  notes?: string
  paymentTerms?: string
}

export interface ContractData {
  contractNumber: string
  date: string
  businessName: string
  businessABN: string
  customerName: string
  customerEmail: string
  projectDescription: string
  deliverables: string[]
  totalAmount: number
  paymentSchedule: string
  startDate?: string
  completionDate?: string
  specialTerms?: string
}

const OUTPUT_DIR = path.join(process.cwd(), "data", "documents")

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`
}

// ─── Invoice PDF ──────────────────────────────────────────────────────────────

export async function generateInvoice(data: InvoiceData): Promise<string> {
  ensureOutputDir()
  const filename = `invoice-${data.invoiceNumber}-${Date.now()}.pdf`
  const filepath = path.join(OUTPUT_DIR, filename)

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" })
    const stream = fs.createWriteStream(filepath)
    doc.pipe(stream)

    const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    const gst = subtotal * 0.1
    const total = subtotal + gst

    // Header
    doc.fontSize(28).font("Helvetica-Bold").text(data.businessName, 50, 50)
    doc.fontSize(10).font("Helvetica").fillColor("#666")
      .text(`ABN: ${data.businessABN}`, 50, 90)
      .text(data.businessAddress, 50, 105)
      .text(data.businessEmail, 50, 120)
      .text(data.businessPhone, 50, 135)

    // Invoice title + number
    doc.fillColor("#1a1a2e").fontSize(36).font("Helvetica-Bold")
      .text("INVOICE", 350, 50, { align: "right" })
    doc.fontSize(11).font("Helvetica").fillColor("#333")
      .text(`Invoice #: ${data.invoiceNumber}`, 350, 100, { align: "right" })
      .text(`Date: ${data.date}`, 350, 115, { align: "right" })
      .text(`Due: ${data.dueDate}`, 350, 130, { align: "right" })

    // Divider
    doc.moveTo(50, 165).lineTo(545, 165).strokeColor("#ddd").stroke()

    // Bill To
    doc.fillColor("#666").fontSize(9).font("Helvetica-Bold").text("BILL TO", 50, 180)
    doc.fillColor("#333").fontSize(11).font("Helvetica-Bold").text(data.customerName, 50, 195)
    doc.font("Helvetica").fontSize(10)
    if (data.customerAddress) doc.text(data.customerAddress, 50, 210)
    doc.text(data.customerEmail, 50, data.customerAddress ? 225 : 210)

    // Line items table
    const tableTop = 280
    doc.fillColor("#1a1a2e").rect(50, tableTop, 495, 25).fill()
    doc.fillColor("white").font("Helvetica-Bold").fontSize(10)
      .text("Description", 60, tableTop + 8)
      .text("Qty", 340, tableTop + 8, { width: 50, align: "right" })
      .text("Unit Price", 395, tableTop + 8, { width: 70, align: "right" })
      .text("Amount", 470, tableTop + 8, { width: 70, align: "right" })

    let y = tableTop + 35
    data.items.forEach((item, i) => {
      if (i % 2 === 1) {
        doc.fillColor("#f8f9fa").rect(50, y - 5, 495, 22).fill()
      }
      const amount = item.quantity * item.unitPrice
      doc.fillColor("#333").font("Helvetica").fontSize(10)
        .text(item.description, 60, y, { width: 270 })
        .text(item.quantity.toString(), 340, y, { width: 50, align: "right" })
        .text(formatCurrency(item.unitPrice), 395, y, { width: 70, align: "right" })
        .text(formatCurrency(amount), 470, y, { width: 70, align: "right" })
      y += 25
    })

    // Totals
    y += 15
    doc.moveTo(350, y).lineTo(545, y).strokeColor("#ddd").stroke()
    y += 10
    doc.fillColor("#666").font("Helvetica").fontSize(10)
      .text("Subtotal:", 350, y, { width: 115, align: "right" })
      .text(formatCurrency(subtotal), 470, y, { width: 70, align: "right" })
    y += 20
    doc.text("GST (10%):", 350, y, { width: 115, align: "right" })
      .text(formatCurrency(gst), 470, y, { width: 70, align: "right" })
    y += 10
    doc.moveTo(350, y).lineTo(545, y).strokeColor("#999").stroke()
    y += 10
    doc.fillColor("#1a1a2e").font("Helvetica-Bold").fontSize(12)
      .text("TOTAL AUD:", 350, y, { width: 115, align: "right" })
      .text(formatCurrency(total), 470, y, { width: 70, align: "right" })

    // Payment terms + notes
    y += 50
    if (data.paymentTerms) {
      doc.fillColor("#666").font("Helvetica-Bold").fontSize(9).text("PAYMENT TERMS", 50, y)
      doc.fillColor("#333").font("Helvetica").fontSize(10).text(data.paymentTerms, 50, y + 14)
      y += 40
    }
    if (data.notes) {
      doc.fillColor("#666").font("Helvetica-Bold").fontSize(9).text("NOTES", 50, y)
      doc.fillColor("#333").font("Helvetica").fontSize(10).text(data.notes, 50, y + 14)
    }

    // Footer
    doc.fillColor("#999").fontSize(9).font("Helvetica")
      .text("Thank you for your business.", 50, 760, { align: "center" })

    doc.end()
    stream.on("finish", () => resolve(filepath))
    stream.on("error", reject)
  })
}

// ─── Contract PDF ─────────────────────────────────────────────────────────────

export async function generateContract(data: ContractData): Promise<string> {
  ensureOutputDir()
  const filename = `contract-${data.contractNumber}-${Date.now()}.pdf`
  const filepath = path.join(OUTPUT_DIR, filename)

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 60, size: "A4" })
    const stream = fs.createWriteStream(filepath)
    doc.pipe(stream)

    // Title
    doc.fontSize(22).font("Helvetica-Bold").fillColor("#1a1a2e")
      .text("SERVICE AGREEMENT", { align: "center" })
    doc.moveDown(0.5)
    doc.fontSize(11).font("Helvetica").fillColor("#666")
      .text(`Contract #${data.contractNumber} | ${data.date}`, { align: "center" })

    doc.moveDown(1.5)
    doc.moveTo(60, doc.y).lineTo(535, doc.y).strokeColor("#ddd").stroke()
    doc.moveDown(1)

    // Parties
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#1a1a2e").text("PARTIES")
    doc.moveDown(0.4)
    doc.font("Helvetica").fillColor("#333").fontSize(10)
      .text(`This agreement is between ${data.businessName} (ABN: ${data.businessABN}) ("the Service Provider") and ${data.customerName} ("the Client").`)

    doc.moveDown(1.2)
    doc.font("Helvetica-Bold").fillColor("#1a1a2e").fontSize(11).text("PROJECT DESCRIPTION")
    doc.moveDown(0.4)
    doc.font("Helvetica").fillColor("#333").fontSize(10).text(data.projectDescription)

    // Deliverables
    doc.moveDown(1.2)
    doc.font("Helvetica-Bold").fillColor("#1a1a2e").fontSize(11).text("DELIVERABLES")
    doc.moveDown(0.4)
    data.deliverables.forEach((d) => {
      doc.font("Helvetica").fillColor("#333").fontSize(10).text(`• ${d}`, { indent: 10 })
    })

    // Timeline
    if (data.startDate || data.completionDate) {
      doc.moveDown(1.2)
      doc.font("Helvetica-Bold").fillColor("#1a1a2e").fontSize(11).text("TIMELINE")
      doc.moveDown(0.4)
      if (data.startDate) doc.font("Helvetica").fillColor("#333").fontSize(10).text(`Start Date: ${data.startDate}`)
      if (data.completionDate) doc.font("Helvetica").fillColor("#333").fontSize(10).text(`Completion Date: ${data.completionDate}`)
    }

    // Payment
    doc.moveDown(1.2)
    doc.font("Helvetica-Bold").fillColor("#1a1a2e").fontSize(11).text("PAYMENT")
    doc.moveDown(0.4)
    doc.font("Helvetica").fillColor("#333").fontSize(10)
      .text(`Total Amount: ${formatCurrency(data.totalAmount)} AUD (inc. GST)`)
      .text(`Payment Schedule: ${data.paymentSchedule}`)

    // Standard terms
    doc.moveDown(1.2)
    doc.font("Helvetica-Bold").fillColor("#1a1a2e").fontSize(11).text("TERMS & CONDITIONS")
    doc.moveDown(0.4)
    const terms = [
      "1. The Service Provider will perform services as described above in a professional manner.",
      "2. The Client agrees to provide timely feedback and required materials to enable project delivery.",
      "3. Additional work outside this agreement will be quoted separately.",
      "4. Intellectual property created under this agreement transfers to the Client upon full payment.",
      "5. Either party may terminate this agreement with 14 days written notice.",
      "6. This agreement is governed by the laws of New South Wales, Australia.",
    ]
    terms.forEach((t) => {
      doc.font("Helvetica").fillColor("#333").fontSize(10).text(t, { paragraphGap: 4 })
    })

    if (data.specialTerms) {
      doc.moveDown(0.5)
      doc.font("Helvetica-Bold").fillColor("#333").fontSize(10).text("Special Conditions:")
      doc.font("Helvetica").text(data.specialTerms)
    }

    // Signatures
    doc.moveDown(2)
    doc.moveTo(60, doc.y).lineTo(535, doc.y).strokeColor("#ddd").stroke()
    doc.moveDown(1)
    doc.font("Helvetica-Bold").fillColor("#1a1a2e").fontSize(11).text("SIGNATURES")
    doc.moveDown(1)

    const sigY = doc.y
    // Left sig
    doc.moveTo(60, sigY + 40).lineTo(240, sigY + 40).strokeColor("#333").stroke()
    doc.font("Helvetica").fillColor("#333").fontSize(9)
      .text(data.businessName, 60, sigY + 45)
      .text("(Service Provider)", 60, sigY + 57)
      .text("Date: _______________", 60, sigY + 69)
    // Right sig
    doc.moveTo(300, sigY + 40).lineTo(480, sigY + 40).strokeColor("#333").stroke()
    doc.font("Helvetica").fillColor("#333").fontSize(9)
      .text(data.customerName, 300, sigY + 45)
      .text("(Client)", 300, sigY + 57)
      .text("Date: _______________", 300, sigY + 69)

    doc.end()
    stream.on("finish", () => resolve(filepath))
    stream.on("error", reject)
  })
}
