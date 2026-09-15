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
 */

export type Support = 'supported' | 'contradicted' | 'absent'

export interface Claim {
  text: string
  support: Support
  /** True when the claim was already in their written passage, so it evidences nothing. */
  recycled: boolean
}

export interface Grade {
  claims: Claim[]
  /** Of the claims they made, how many the source bears out. */
  precision: number
  /** Supported claims that were not already in their write-up. */
  fresh: number
  /** 0-100, for sitting beside the existing score. */
  score: number
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

/** Overlapping windows, so a sentence straddling a boundary still lands whole in one. */
export function windowsOf(source: string, size = 110, stride = 45): string[] {
  const all = source.split(/\s+/).filter(Boolean)
  if (all.length <= size) return [all.join(' ')]
  const out: string[] = []
  for (let i = 0; i < all.length; i += stride) {
    out.push(all.slice(i, i + size).join(' '))
    if (i + size >= all.length) break
  }
  return out
}

/**
 * The passages most likely to bear on a claim, by share of the claim's content words.
 *
 * Deliberately not an embedding model. This runs in the tab with no download and no
 * network, and for checking whether a specific assertion appears in a specific paper,
 * sharing rare words with it is most of the signal.
 */
export function evidenceFor(claim: string, windows: string[], take = 3): string {
  const want = new Set(content(claim))
  if (!want.size || !windows.length) return windows.slice(0, take).join('\n\n')
  return windows
    .map((text) => {
      const have = new Set(content(text))
      let hit = 0
      for (const term of want) if (have.has(term)) hit += 1
      return { text, score: hit / want.size }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, take)
    .map((w) => w.text)
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
export function scoreClaims(claims: Claim[], target = 4): Grade {
  if (!claims.length) return { claims, precision: 0, fresh: 0, score: 0 }
  const supported = claims.filter((c) => c.support === 'supported')
  const fresh = supported.filter((c) => !c.recycled).length
  const precision = supported.length / claims.length
  return {
    claims,
    precision,
    fresh,
    score: Math.round(precision * Math.min(1, fresh / target) * 100),
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

/** Same leniency for the extraction step, which has the same habit. */
export function readClaims(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') {
        for (const key of ['claim', 'text', 'content']) {
          const found = (item as Record<string, unknown>)[key]
          if (typeof found === 'string') return found
        }
      }
      return ''
    })
    .map((t) => t.trim())
    .filter((t) => t.length > 8)
    .slice(0, limit)
}
