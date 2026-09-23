import { readStrings, type SourceDoc } from './claims'

/**
 * Connecting several readings before the questioning begins — without a graph.
 *
 * A full knowledge graph (entities, typed relationships, traversal) is the wrong tool for
 * this. Researchers extracting relationships from the Stanford Encyclopedia of
 * Philosophy — writing in the same register as the readings this app is fed — got 48.5%
 * accuracy, with the model inventing relationships to fill out a schema that argumentative
 * prose does not actually have. Forcing "X relates to Y" onto a paragraph that is doing
 * something subtler than that produces confident nonsense, and it would be sitting
 * upstream of every question this app asks.
 *
 * What is built instead is two things, both cheap and neither able to invent a fact:
 *
 *   1. Lexical routing (`relevantDocs`) — no model call at all. Given what a student
 *      wrote, rank the uploaded readings by shared vocabulary and hand the question
 *      generator the ones that are actually relevant, in full, rather than every reading
 *      at once regardless of length.
 *
 *   2. A one-line-per-reading topic summary (`indexDocuments`), built once when the
 *      readings are uploaded. It is a list, not a graph — each line stands on its own and
 *      nothing is asserted to connect to anything else. It exists so a question generator
 *      facing ten readings can see what all of them cover in a few hundred words, and so a
 *      lecturer can see the reading list summarised without opening every file.
 *
 * Claim verification never uses either of these. It searches every reading's retrieved
 * text directly (`windowsOf`/`evidenceFor` in claims.ts), because that is a mechanical
 * check against real text and adding a summary in front of it would only be one more place
 * for an error to hide.
 */

export interface Topic {
  text: string
}

export interface DocIndexEntry {
  doc: SourceDoc
  topics: Topic[]
}

export type DocIndex = DocIndexEntry[]

/* -- lexical routing, no model call --------------------------------------- */

const STOP = new Set(
  ('a an the and or but if of to in on at for with as is are was were be been being that this these those it its ' +
    'from by not no so than then there here what which who whom whose how why when where can could would should ' +
    'will shall may might must do does did done have has had having i you he she they we me him her them us my ' +
    'your his their our about into over under more most some any all such very also just only own same too now')
    .split(' '),
)
const words = (text: string): string[] => text.toLowerCase().match(/[a-z0-9'-]+/g) ?? []
const content = (text: string): string[] => words(text).filter((w) => !STOP.has(w) && w.length > 2)

/**
 * Which of the uploaded readings a passage most likely concerns, ranked by shared rare
 * vocabulary — the same mechanism `passageFor` in claims.ts uses at the paragraph level,
 * applied here at the document level so a question generator is not handed every reading
 * regardless of length.
 *
 * Returns every reading when there are few enough that the question is moot. Otherwise
 * returns only readings that share SOMETHING with the passage, up to `take` — never padded
 * out to `take` with a zero-overlap reading just because ties keep it in front of another
 * equally irrelevant one. A passage that plainly concerns one reading out of five should
 * get one reading's full text, not one relevant reading plus an arbitrary second. The one
 * exception is a passage that shares nothing with anything: rather than leave the question
 * generator with no full text to ground on, the first `take` stand in.
 */
export function relevantDocs(work: string, docs: SourceDoc[], take = 2): SourceDoc[] {
  if (docs.length <= take) return docs
  const want = new Set(content(work))
  if (!want.size) return docs.slice(0, take)
  const scored = docs
    .map((doc) => {
      const have = new Set(content(doc.text))
      let hit = 0
      for (const term of want) if (have.has(term)) hit += 1
      return { doc, score: hit / want.size }
    })
    .sort((a, b) => b.score - a.score)
  const relevant = scored.filter((r) => r.score > 0).slice(0, take).map((r) => r.doc)
  return relevant.length ? relevant : scored.slice(0, take).map((r) => r.doc)
}

/* -- real citations between the uploaded readings, no model call ---------- */

/**
 * A genuine cross-reading relationship, mechanically found rather than inferred.
 *
 * The graph that got rejected asked a model to decide how two readings relate, which on
 * argumentative prose invents a relationship about as often as it finds one. This asks a
 * much narrower question a model never touches: does this reading's own reference list
 * contain the word this OTHER reading is named after? Readings are, in ordinary use,
 * named after their author or title ("Singer.pdf", "Forkuor et al.pdf") — so a match is
 * either a real citation or, at worst, a coincidence of surname. It is never a guess,
 * because nothing here is asked to interpret meaning.
 *
 * This misses real relationships that are not visible as a citation — two readings that
 * cover the same ground without citing each other will never show up here — and it misses
 * readings whose filename carries no name-like word (an arXiv id, a scanned title page).
 * Both are honest gaps in what a purely mechanical check can find, not failures of it.
 */
export interface Citation {
  /** The reading whose reference list contains the mention. */
  from: string
  /** The reading it appears to cite. */
  to: string
}

const REFERENCE_HEADING = /\n\s*(references?|bibliography|works cited|reference list)\s*\n/gi

/**
 * The part of a document most likely to be its reference list.
 *
 * From the last heading that looks like one to the end — the last, because an early false
 * positive (a section merely discussing "references" in prose) is not where a bibliography
 * actually sits. Falls back to the closing stretch of the document when no heading is
 * found at all, which still beats scanning the whole argument for citation-shaped text.
 */
function referenceSection(text: string): string {
  const last = [...text.matchAll(REFERENCE_HEADING)].pop()
  return last?.index != null ? text.slice(last.index) : text.slice(Math.floor(text.length * 0.8))
}

/**
 * The word a reading is most likely named after — usually an author's surname, sometimes
 * the first word of a title. The first run of four or more letters in the filename, which
 * matches how people actually name a PDF they saved ("Singer.pdf", "Singer - Famine.pdf")
 * and quietly returns nothing for a filename that carries no such word (an arXiv id, a
 * scan), rather than guessing at one.
 */
function identityToken(name: string): string | null {
  const base = name.replace(/\.[a-z0-9]+$/i, '')
  const token = base.match(/[A-Za-z][A-Za-z'-]{3,}/)?.[0]
  return token && !STOP.has(token.toLowerCase()) ? token : null
}

/** Every reading's reference list, checked for every other reading's identity token. */
export function citationsAmong(docs: SourceDoc[]): Citation[] {
  const identities = docs.map((doc) => ({ name: doc.name, token: identityToken(doc.name) }))
  const out: Citation[] = []
  for (const citer of docs) {
    const refs = referenceSection(citer.text).toLowerCase()
    for (const { name, token } of identities) {
      if (!token || name === citer.name) continue
      if (new RegExp(`\\b${token.toLowerCase()}\\b`).test(refs)) out.push({ from: citer.name, to: name })
    }
  }
  return out
}

/* -- the one-line-per-reading index, one model call per reading ----------- */

export const TOPIC_EXTRACTOR = 'You summarise what a document covers. You do not evaluate it and you do not invent connections to anything else.'

/** Kept short deliberately: this text sits in every question-generation prompt from now
 *  on, once per reading, so it has to stay cheap even at ten readings. */
const TOPIC_BUDGET = 6000

function clip(text: string, budget = TOPIC_BUDGET): string {
  return text.length <= budget ? text : `${text.slice(0, budget)}\n[...]`
}

export function topicPrompt(doc: SourceDoc): string {
  return `List the main things this document argues, shows or covers — one short
self-contained sentence each, at most six. Plain statements, not summaries of each other.

This is so that later, a claim someone makes can be matched to the right document among
several — write each line as something checkable, not a vague heading.

DOCUMENT (${doc.name})
${clip(doc.text)}

Reply with JSON only: {"topics":["...","..."]}`
}

/** A compact block covering every reading, for the question-generation prompt. */
export function indexSummary(index: DocIndex): string {
  return index
    .map((entry) => `${entry.doc.name}:\n${entry.topics.map((t) => `  - ${t.text}`).join('\n') || '  (no summary)'}`)
    .join('\n\n')
}

/** Same leniency the claim extractor needs — a model's JSON habits do not change per prompt. */
export function readTopics(value: unknown): Topic[] {
  return readStrings(value, 6, 6).map((text) => ({ text }))
}
