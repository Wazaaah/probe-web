import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

/**
 * Turning an upload into something the examiner can read.
 *
 * Everything happens in this tab: the file is never sent anywhere except, as text, to
 * whichever model the user configured. PDF goes through pdf.js; plain formats are read
 * as they are. Anything else asks to be pasted rather than pretending to have read it.
 */

/**
 * pdf.js is most of this app's weight and is only needed by someone who uploads a PDF,
 * so it is fetched on the first one rather than shipped in the opening payload.
 */
async function pdfjs() {
  const library = await import('pdfjs-dist')
  library.GlobalWorkerOptions.workerSrc = workerUrl
  return library
}

/**
 * Same reasoning for Word documents: fetched only when one is actually uploaded. Word is
 * the one format everyone actually writes an essay in, and until this a .docx just failed
 * silently into a rejection the accept filter made worse — a browser's native file picker
 * hides files that do not match `accept`, so someone trying to pick a Word file could not
 * even select it, which reads as nothing happening at all rather than as an error.
 */
async function mammoth() {
  return import('mammoth')
}

/**
 * A ceiling on pages, but a generous one, and it is reported rather than hidden.
 *
 * The old limit of 40 was set on the assumption that the first pages carry the substance.
 * That is true of a report and false of a dissertation, a case file or a set of readings —
 * and when it was false the app silently examined a student on the first third of their
 * own work. Reading is cheap; it is the prompt that has to be selective, not the reader.
 */
const MAX_PAGES = 400

export class UnreadableFile extends Error {}

const PLAIN = ['txt', 'md', 'markdown', 'csv', 'json', 'rtf', 'html', 'htm', 'log']

function extensionOf(name: string): string {
  const at = name.lastIndexOf('.')
  return at < 0 ? '' : name.slice(at + 1).toLowerCase()
}

/**
 * Rebuild a line of text from the fragments pdf.js emits.
 *
 * A PDF has no words — it has glyphs at coordinates. pdf.js hands back whatever fragments
 * the file happened to group, so kerned text arrives split: "once" comes through as "on",
 * "c", "e". Joining every fragment with a space turns that into "on c e", which is how a
 * real upload produced "a land on c e flowing" and the examiner then wrote questions
 * about words the author never used.
 *
 * The fix is to ask where the next fragment starts. If it begins roughly where the last
 * one ended it is the same word and takes no space; a real gap, or a line break, takes
 * one. The threshold scales with the font so it holds for footnotes and headings alike.
 */
function joinItems(items: unknown[]): string {
  let out = ''
  let previous: { transform: number[]; width: number; height?: number; hasEOL?: boolean } | null = null

  for (const item of items) {
    if (!item || typeof item !== 'object' || !('str' in item)) continue
    const glyph = item as { str: string; transform: number[]; width: number; height?: number; hasEOL?: boolean }
    if (previous) {
      const sameLine = Math.abs(glyph.transform[5] - previous.transform[5]) < 2
      const gap = glyph.transform[4] - (previous.transform[4] + previous.width)
      const space = (glyph.height || 10) * 0.18
      if (!sameLine || previous.hasEOL || gap > space) out += ' '
    }
    out += glyph.str
    previous = glyph
  }
  return out
}

async function readPdf(file: File, onProgress?: (done: number, total: number) => void): Promise<string> {
  const { getDocument } = await pdfjs()
  const doc = await getDocument({ data: await file.arrayBuffer() }).promise
  const total = doc.numPages
  const pages = Math.min(total, MAX_PAGES)
  const out: string[] = []

  for (let page = 1; page <= pages; page += 1) {
    const content = await (await doc.getPage(page)).getTextContent()
    const text = joinItems(content.items)
      .replace(/\s+/g, ' ')
      // Justified text puts air around hyphens: "small - scale" is one word, not three.
      .replace(/([A-Za-z]) - ([A-Za-z])/g, '$1-$2')
      .trim()
    if (text) out.push(text)
    onProgress?.(page, pages)
  }
  await doc.destroy()

  // Say so rather than examining someone on a document they only partly submitted.
  if (total > pages) {
    out.push(`\n[Probe read the first ${pages} of ${total} pages of this document.]`)
  }
  return out.join('\n\n')
}

/** Strips the tags out of an HTML or RTF-ish file so the model reads prose, not markup. */
function plainify(raw: string, extension: string): string {
  if (extension !== 'html' && extension !== 'htm') return raw
  return raw
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A .docx is a zip of XML, not text, so it needs a real parser — Word is what most people
 * actually write an essay in, and this used to fail with no useful explanation.
 *
 * Only the modern format (.docx, 2007 onward) is readable this way. The old binary .doc
 * format is a different thing entirely and mammoth cannot open it; that case gets its own
 * message rather than the generic one, because "convert it first" is an actionable answer
 * and "could not be read" is not.
 */
async function readWord(file: File): Promise<string> {
  const { extractRawText } = await mammoth()
  const { value, messages } = await extractRawText({ arrayBuffer: await file.arrayBuffer() })
  const text = value.trim()
  if (!text) {
    const reason = messages.find((m) => m.type === 'error')?.message
    throw new UnreadableFile(
      reason
        ? `That Word document could not be read: ${reason}`
        : 'That Word document has no text in it — paste the text instead.',
    )
  }
  return text
}

export async function readDocument(file: File, onProgress?: (done: number, total: number) => void): Promise<string> {
  const extension = extensionOf(file.name)

  if (extension === 'pdf' || file.type === 'application/pdf') {
    const text = await readPdf(file, onProgress)
    if (text.trim().length < 40) {
      // A scanned PDF is images all the way down; there is no text layer to find.
      throw new UnreadableFile('That PDF has no text layer — it looks like a scan. Paste the text instead.')
    }
    return text
  }

  if (extension === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    onProgress?.(1, 1)
    return readWord(file)
  }

  if (extension === 'doc') {
    // The old binary format, not the zip-of-XML one — a different problem from "we do
    // not support this yet", so it gets a different, actionable answer.
    throw new UnreadableFile(
      'That is the older .doc format, which cannot be read in the browser. Save it as .docx (or PDF) from Word, or paste the text in.',
    )
  }

  if (PLAIN.includes(extension) || file.type.startsWith('text/')) {
    onProgress?.(1, 1)
    return plainify(await file.text(), extension)
  }

  throw new UnreadableFile(
    `Probe can read PDF, Word (.docx) and plain text in the browser. ${extension ? '.' + extension : 'That file'} needs pasting in for now.`,
  )
}
