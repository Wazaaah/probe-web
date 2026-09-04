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

/** A long document costs tokens and adds nothing — the first pages carry the substance. */
const MAX_PAGES = 40

export class UnreadableFile extends Error {}

const PLAIN = ['txt', 'md', 'markdown', 'csv', 'json', 'rtf', 'html', 'htm', 'log']

function extensionOf(name: string): string {
  const at = name.lastIndexOf('.')
  return at < 0 ? '' : name.slice(at + 1).toLowerCase()
}

async function readPdf(file: File, onProgress?: (done: number, total: number) => void): Promise<string> {
  const { getDocument } = await pdfjs()
  const doc = await getDocument({ data: await file.arrayBuffer() }).promise
  const pages = Math.min(doc.numPages, MAX_PAGES)
  const out: string[] = []

  for (let page = 1; page <= pages; page += 1) {
    const content = await (await doc.getPage(page)).getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) out.push(text)
    onProgress?.(page, pages)
  }
  await doc.destroy()
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

  if (PLAIN.includes(extension) || file.type.startsWith('text/')) {
    onProgress?.(1, 1)
    return plainify(await file.text(), extension)
  }

  throw new UnreadableFile(
    `Probe can read PDF and plain text in the browser. ${extension ? '.' + extension : 'That file'} needs pasting in for now.`,
  )
}
