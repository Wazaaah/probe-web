import type { TrialSession } from './trial'

/**
 * Ranking transcripts by comparing them to each other, never by scoring them.
 *
 * Every judge tried so far asks the same kind of question: look at this exchange and say
 * how good it was, out of a hundred. That requires the model to hold a stable internal
 * scale across sessions it never sees together, and the evidence is that it does not —
 * the scores drift, and the drift is worst in the middle of the range, which is exactly
 * where a fluent student who read nothing sits.
 *
 * A comparison needs no scale. Both transcripts are in front of the model at once, the
 * question is which of the two gives more evidence of having read the source, and the
 * answer is one of two names. In testing this was the most reliable judge on the hard
 * case: 84 of 96 comparisons correct where the shipped judge was at 0.642 AUC.
 *
 * Two things here are not optional. Every pair is asked twice with the transcripts
 * swapped, because a judge shown the same two answers in the other order does not always
 * say the same thing, and a position bias would otherwise be silently baked into the
 * ranking. And a pair that disagrees with itself across the two orders is recorded as a
 * tie rather than resolved — the honest reading of "A beats B and B beats A" is that this
 * judge cannot separate them.
 */

export interface Bout {
  a: string
  b: string
  /** The participant the judge preferred, or null when the two orders disagreed. */
  winner: string | null
  flipped: boolean
}

export interface Ranked {
  participant: string
  /** Wins plus half a point per tie, as a share of bouts fought. */
  share: number
  wins: number
  ties: number
  losses: number
}

/** Every unordered pair, each to be judged twice. */
export function pairsOf<T>(items: T[]): [T, T][] {
  const out: [T, T][] = []
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) out.push([items[i], items[j]])
  }
  return out
}

/**
 * How many model calls a ranking will cost, so it can be said out loud before spending.
 * Two per pair, and pairs grow with the square of the field.
 */
export const boutCount = (n: number): number => n * (n - 1)

export function transcriptOf(session: TrialSession): string {
  return session.turns
    .map((t, i) => `Examiner ${i + 1}: ${t.question}\nStudent ${i + 1}: "${t.said}"`)
    .join('\n\n')
}

export const COMPARER =
  'You compare two oral examinations on the same reading and say which student gives more evidence of having read it.'

export function comparePrompt(left: string, right: string): string {
  return `Two students were examined on the same reading. Neither transcript is labelled.

=== TRANSCRIPT A ===
${left}

=== TRANSCRIPT B ===
${right}

Which student gives more evidence of having actually read the source?

Confidence is not evidence. Fluency is not evidence. Length is not evidence. What counts
is detail that could only come from the reading — a specific, a distinction the source
draws, a consequence it follows through, a place they correct themselves toward something
the source says. A student who is hesitant but specific has read it; a student who is
smooth and general may not have.

Reply with JSON only: {"winner":"A"|"B"}`
}

/** Models answer "A", "Transcript A", "a" — take the first letter that is A or B. */
export function readWinner(value: unknown): 'A' | 'B' | null {
  const text = typeof value === 'string' ? value : ''
  const found = text.toUpperCase().match(/\b([AB])\b/)
  return found ? (found[1] as 'A' | 'B') : null
}

/**
 * Resolve a pair from its two orderings.
 *
 * Agreement across the swap is a decision; disagreement is a tie. Taking the first answer
 * and moving on would hide exactly the cases the judge cannot call, which are the ones a
 * person most needs to look at.
 */
export function settle(a: string, b: string, first: 'A' | 'B' | null, second: 'A' | 'B' | null): Bout {
  // `second` was asked with the transcripts swapped, so "A" there means b.
  const firstPick = first === 'A' ? a : first === 'B' ? b : null
  const secondPick = second === 'A' ? b : second === 'B' ? a : null
  if (firstPick && firstPick === secondPick) return { a, b, winner: firstPick, flipped: false }
  return { a, b, winner: null, flipped: Boolean(firstPick && secondPick) }
}

/** Order the field by share of points won, ties counting half. */
export function rank(participants: string[], bouts: Bout[]): Ranked[] {
  const table = new Map<string, Ranked>()
  for (const p of participants) table.set(p, { participant: p, share: 0, wins: 0, ties: 0, losses: 0 })

  for (const bout of bouts) {
    const a = table.get(bout.a)
    const b = table.get(bout.b)
    if (!a || !b) continue
    if (bout.winner === bout.a) { a.wins += 1; b.losses += 1 }
    else if (bout.winner === bout.b) { b.wins += 1; a.losses += 1 }
    else { a.ties += 1; b.ties += 1 }
  }

  for (const row of table.values()) {
    const fought = row.wins + row.ties + row.losses
    row.share = fought ? (row.wins + row.ties / 2) / fought : 0
  }
  return [...table.values()].sort((x, y) => y.share - x.share)
}

/** Spearman's rho between two orderings of the same people, or null below three. */
export function agreementWith(ordered: string[], other: Map<string, number>): number | null {
  const pairs = ordered.map((p, i) => ({ mine: i + 1, theirs: other.get(p) })).filter((p) => p.theirs != null) as {
    mine: number
    theirs: number
  }[]
  if (pairs.length < 3) return null

  const rankOf = (values: number[]): number[] => {
    const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)
    const out = new Array<number>(values.length)
    let at = 0
    while (at < order.length) {
      let end = at
      while (end + 1 < order.length && order[end + 1].v === order[at].v) end += 1
      const shared = (at + end) / 2 + 1
      for (let k = at; k <= end; k += 1) out[order[k].i] = shared
      at = end + 1
    }
    return out
  }

  const a = rankOf(pairs.map((p) => p.mine))
  const b = rankOf(pairs.map((p) => p.theirs))
  const mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length
  const ma = mean(a)
  const mb = mean(b)
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < a.length; i += 1) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return da && db ? num / Math.sqrt(da * db) : null
}
