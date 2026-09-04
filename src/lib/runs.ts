import { HISTORY, type DocumentHistory } from '../data/sample'

/**
 * Every session this browser has finished, grouped by the document it came from.
 *
 * History is per-upload rather than one flat list, because the question a reviewer
 * actually asks is "how did they do on the board deck", not "what was session nine".
 */

const KEY = 'probe.runs'

export interface Run {
  document: string
  title: string
  meta: string
  score: number
  at: number
}

export function loadRuns(): Run[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function recordRun(run: Run): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([run, ...loadRuns()].slice(0, 60)))
  } catch {
    /* private browsing: the session still counts, it just is not kept */
  }
}

/** This browser's own runs first, then the seeded history behind them. */
export function groupRuns(): DocumentHistory[] {
  const groups: DocumentHistory[] = []
  for (const run of loadRuns()) {
    const existing = groups.find((g) => g.document === run.document)
    const entry = { title: run.title, meta: run.meta, score: run.score }
    if (existing) existing.runs.push(entry)
    else groups.push({ document: run.document, runs: [entry] })
  }
  return [...groups, ...HISTORY]
}

export function describeRun(minutes: number, questions: number, probes: number): string {
  const when = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${when} · ${minutes} min · ${questions} question${questions === 1 ? '' : 's'}, ${probes} probe${probes === 1 ? '' : 's'}`
}
