import type { Answer } from '../data/types'

/**
 * Scoring an examination by what the student committed to, one claim at a time.
 *
 * The judge that ships asks a model to look at a transcript and say how well the student
 * did. Testing showed what the literature predicts: asked for a single holistic number, a
 * model has to hold a consistent internal scale and does not, and the failure lands
 * hardest in the middle — on the answers that are neither clearly good nor clearly empty,
 * which is exactly where a fluent bluffer sits. On a well-known paper that judge scored
 * 0.642 AUC, barely better than a coin flip.
 *
 * This asks two narrower questions instead, both of which a model is reliable at:
 *
 *   1. what did the student actually claim about the source?   (extraction)
 *   2. does this passage of the source support this claim?     (checking, one at a time)
 *
 * Nobody is ever asked how good the student was. The score falls out of counting. On the
 * same hard case this reached 0.858.
 *
 * Two details carry most of the weight. A claim is checked against the passage that
 * actually bears on it, retrieved here in the browser, rather than against the whole
 * paper at once — a model reading 6,000 words to check one sentence loses the sentence.
 * And a claim already present in the student's own write-up scores nothing: repeating
 * your own paragraph shows you can read your own paragraph.
 *
 * A third detail was added once readings stopped being a single document: retrieval
 * spans every uploaded reading at once, tagged with which one each passage came from. A
 * claim gets checked against whichever reading actually bears on it, not against the
 * reading the student happened to write about most — which matters the moment there is
 * more than one on the list.
 */

export type Support = 'supported' | 'contradicted' | 'absent'

/** One uploaded reading. `name` is what a lecturer or a report shows for it. */
export interface SourceDoc {
  name: string
  text: string
}

export interface Claim {
  text: string
  support: Support
  /** True when the claim was already in their written passage, so it evidences nothing. */
  recycled: boolean
  /**
   * Which window of retrieved text this claim was checked against — an index into the
   * `Window[]` produced by `windowsOf` for the SAME array of readings used at check time.
   *
   * Kept because it is free and it is what makes a class report possible. Claims checked
   * against the same window are about the same part of the same reading, so grouping by
   * this index clusters thirty conversations by topic without a single extra model call
   * and without anybody having to name the topics in advance. Resolving it back to a
   * reading and an excerpt is `windows[passage]` — see `windowsOf`.
   */
  passage: number
}

export interface Grade {
  claims: Claim[]
  /** Of the claims they made, how many the source bears out. */
  precision: number
  /** Supported claims that were not already in their write-up. */
  fresh: number
  /** 0-100, for sitting beside the existing score. */
  score: number
  /**
   * The checker call itself failed or returned nothing readable — every claim below
   * defaulted to "absent" for that reason, not because the source was actually checked
   * and found wanting. Conflating those two is the worst failure mode this file has: it
   * reads as "held nothing, everything unsupported," which is indistinguishable from a
   * real transcript of someone who knew nothing, unless this flag says otherwise.
   */
  checkFailed: boolean
}

/* -- retrieval, in the browser, at no cost -------------------------------- */

const STOP = new Set(
  ('a an the and or but if of to in on at for with as is are was were be been being that this these those it its ' +
    'from by not no so than then there here what which who whom whose how why when where can could would should ' +
    'will shall may might must do does did done have has had having i you he she they we me him her them us my ' +
    'your his their our about into over under more most some any all such very also just only own same too now')
    .split(' '),
)

const words = (text: string): string[] => text.toLowerCase().match(/[a-z0-9'-]+/g) ?? []
const content = (text: string): string[] => words(text).filter((w) => !STOP.has(w) && w.length > 2)

/** One overlapping slice of one reading, tagged with which reading it came from. */
export interface Window {
  text: string
  /** Index into the `SourceDoc[]` passed to `windowsOf`. */
  doc: number
}

/**
 * Overlapping windows across every reading, each tagged with its source.
 *
 * One flat array rather than one per document: a claim's `passage` is a single index into
 * this array regardless of how many readings there are, so nothing downstream — scoring,
 * the class report — needs to know document count changed. Windows never span a document
 * boundary, so a claim's evidence is never half of one reading and half of another.
 */
export function windowsOf(docs: SourceDoc[], size = 110, stride = 45): Window[] {
  const out: Window[] = []
  docs.forEach((doc, index) => {
    const all = doc.text.split(/\s+/).filter(Boolean)
    if (all.length <= size) {
      out.push({ text: all.join(' '), doc: index })
      return
    }
    for (let i = 0; i < all.length; i += stride) {
      out.push({ text: all.slice(i, i + size).join(' '), doc: index })
      if (i + size >= all.length) break
    }
  })
  return out
}

/**
 * The single window that best bears on a claim, as an index, or -1 when none does.
 *
 * Searches across every reading at once. Which reading a claim concerns falls out of this
 * the same way it always did within one document — by which words the claim shares with
 * the passage — so a claim about the second reading is not compared against the first
 * just because that is the one most students happened to write about.
 */
export function passageFor(claim: string, windows: Window[]): number {
  const want = new Set(content(claim))
  if (!want.size || !windows.length) return -1
  let best = -1
  let bestScore = 0
  windows.forEach((window, i) => {
    const have = new Set(content(window.text))
    let hit = 0
    for (const term of want) if (have.has(term)) hit += 1
    const score = hit / want.size
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  })
  return best
}

/**
 * The passages most likely to bear on a claim, by share of the claim's content words,
 * each labelled with which reading it came from.
 *
 * Deliberately not an embedding model. This runs in the tab with no download and no
 * network, and for checking whether a specific assertion appears in a specific paper,
 * sharing rare words with it is most of the signal. The label matters once there is more
 * than one reading: the checker needs to know it is looking at reading three, not reading
 * one, or "the passage does not say this" becomes ambiguous about which passage.
 */
export function evidenceFor(claim: string, windows: Window[], docs: SourceDoc[], take = 3): string {
  const want = new Set(content(claim))
  const label = (w: Window) => docs[w.doc]?.name ?? `reading ${w.doc + 1}`
  if (!want.size || !windows.length) {
    return windows.slice(0, take).map((w) => `[${label(w)}]\n${w.text}`).join('\n\n')
  }
  return windows
    .map((w) => {
      const have = new Set(content(w.text))
      let hit = 0
      for (const term of want) if (have.has(term)) hit += 1
      return { w, score: hit / want.size }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, take)
    .map(({ w }) => `[${label(w)}]\n${w.text}`)
    .join('\n\n— — —\n\n')
}

/** Is this claim just a restatement of something they already wrote? */
export function recycles(claim: string, work: string, threshold = 0.3): boolean {
  if (!work.trim()) return false
  const have = new Set<string>()
  const w = words(work)
  for (let i = 0; i + 3 <= w.length; i += 1) have.add(w.slice(i, i + 3).join(' '))

  const c = words(claim)
  let hit = 0
  let total = 0
  for (let i = 0; i + 3 <= c.length; i += 1) {
    total += 1
    if (have.has(c.slice(i, i + 3).join(' '))) hit += 1
  }
  return total ? hit / total > threshold : false
}

/**
 * Turn checked claims into one number.
 *
 * Precision alone rewards saying almost nothing very carefully; fresh count alone rewards
 * saying a great deal loosely. Multiplying them means a good score needs both — several
 * things the source bears out, and few it does not. Four fresh supported claims is
 * treated as a full showing, which is about what three or four questions can surface.
 */
export function scoreClaims(claims: Claim[], target = 4, checkFailed = false): Grade {
  if (!claims.length) return { claims, precision: 0, fresh: 0, score: 0, checkFailed }
  const supported = claims.filter((c) => c.support === 'supported')
  const fresh = supported.filter((c) => !c.recycled).length
  const precision = supported.length / claims.length
  return {
    claims,
    precision,
    fresh,
    score: Math.round(precision * Math.min(1, fresh / target) * 100),
    checkFailed,
  }
}

/* -- prompts -------------------------------------------------------------- */

export const EXTRACTOR = 'You extract claims. You do not evaluate them and you do not judge anybody.'

export function extractPrompt(answers: Answer[]): string {
  const transcript = answers
    .map((a, i) => `Examiner ${i + 1}: ${a.question}\nStudent ${i + 1}: "${a.spoken}"`)
    .join('\n\n')
  return `${transcript}

List every distinct claim the student made ABOUT THE SOURCE — what it argues, shows,
distinguishes, concedes or implies. One short self-contained sentence each, at most
twelve. Use their meaning, not their exact words.

Leave out their opinions, their hedging, and anything that is not a claim about the
source. If they claimed nothing about it, return an empty list.

Reply with JSON only: {"claims":["...","..."]}`
}

export const CHECKER = 'You check one claim against one passage. You report only what the passage says.'

export function checkPrompt(items: { claim: string; evidence: string }[]): string {
  return `For each numbered claim, decide whether ITS OWN passage supports it.

supported    - the passage says this, in any words
contradicted - the passage says otherwise
absent       - the passage does not address it

Judge each claim only against the passage printed beneath it. Do not use anything you
know about the topic from elsewhere; a claim that is true in general but not in this
passage is "absent".

${items.map((it, i) => `--- CLAIM ${i + 1} ---\n"${it.claim}"\n\nITS PASSAGE:\n${it.evidence}`).join('\n\n')}

Reply with JSON only: {"verdicts":["supported","absent",...]} with ${items.length} entries in order.`
}

/** Models return `["supported"]` or `[{verdict:"supported"}]` depending on mood. */
export function readVerdicts(value: unknown, n: number): Support[] {
  const list = Array.isArray(value) ? value : []
  const out: Support[] = []
  for (let i = 0; i < n; i += 1) {
    const item = list[i]
    const raw =
      typeof item === 'string'
        ? item
        : item && typeof item === 'object' && typeof (item as any).verdict === 'string'
          ? (item as any).verdict
          : ''
    const clean = raw.toLowerCase().trim()
    out.push(clean === 'supported' || clean === 'contradicted' ? clean : 'absent')
  }
  return out
}

/**
 * Pull a list of strings out of whatever shape the model chose.
 *
 * Asked for {"claims":["...","..."]} it sometimes returns
 * {"claims":[{"claim":"...","word_count":16}]} instead — the same content with extra
 * bookkeeping it decided would be helpful. A parser that insists on strings silently
 * discards all of them, which has previously removed a whole persona from an experiment
 * without a single error being raised. Take the string if it is one, and the obvious
 * field if it is not.
 */
export function readStrings(value: unknown, limit = 12, minLength = 8): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') {
        for (const key of ['claim', 'topic', 'text', 'content', 'value']) {
          const found = (item as Record<string, unknown>)[key]
          if (typeof found === 'string') return found
        }
      }
      return ''
    })
    .map((t) => t.trim())
    .filter((t) => t.length > minLength)
    .slice(0, limit)
}

/** Kept as the name most call sites already use; identical to `readStrings`. */
export const readClaims = readStrings
