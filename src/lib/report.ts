import type { Grade, SourceDoc } from './claims'
import { windowsOf } from './claims'

/**
 * What the examination is for: saying where understanding stops.
 *
 * Not a score. The proposal this is built from is explicit that the purpose is not to
 * catch or punish anyone for using AI, and that the system supports formative dialogue
 * rather than assigning grades. A number does neither. "72" tells a student nothing they
 * can act on and tells a lecturer nothing they can teach to.
 *
 * What both of them can use is a boundary: here is what this person could say about the
 * source and defend, here is what they asserted that the source does not bear out, and
 * here is where the questioning stopped getting anything new. That is the same claim
 * data the scoring used — it was always the interesting half, and collapsing it to a
 * percentage threw it away.
 *
 * The class report is the other half, and it is a third of what the pilot set out to
 * test: whether patterns across many conversations help a lecturer decide what to revisit.
 * It groups by which passage of the source each claim was checked against, so topics fall
 * out of the retrieval that already happened rather than from anybody labelling them.
 */

export interface Boundary {
  /** Claims the source bears out, that were not already in their own write-up. */
  held: string[]
  /** Claims they made that the source does not support. Worth correcting, not punishing. */
  unsupported: string[]
  /** Claims the source directly contradicts. The most useful thing a student can be told. */
  wrong: string[]
  /** Supported, but already in their passage — evidence of reading their own words. */
  restated: string[]
  /** Which passages of the source they showed any command of. */
  passages: number[]
}

export function boundaryOf(grade: Grade | null): Boundary {
  const empty: Boundary = { held: [], unsupported: [], wrong: [], restated: [], passages: [] }
  if (!grade?.claims?.length) return empty

  const held: string[] = []
  const unsupported: string[] = []
  const wrong: string[] = []
  const restated: string[] = []
  const passages = new Set<number>()

  for (const claim of grade.claims) {
    if (claim.support === 'contradicted') wrong.push(claim.text)
    else if (claim.support === 'absent') unsupported.push(claim.text)
    else if (claim.recycled) restated.push(claim.text)
    else {
      held.push(claim.text)
      if (claim.passage >= 0) passages.add(claim.passage)
    }
  }
  return { held, unsupported, wrong, restated, passages: [...passages].sort((a, b) => a - b) }
}

/**
 * A sentence a student could act on, or an honest admission that there is nothing to say.
 *
 * Deliberately plain and deliberately short. It names what they held and what they did
 * not, and it never characterises the person — "could not say what the authors concede"
 * is a fact about an exchange; "superficial understanding" is a verdict about a student,
 * and this is not the instrument for those.
 */
export function boundaryLine(b: Boundary): string {
  if (!b.held.length && !b.unsupported.length && !b.wrong.length && !b.restated.length) {
    return 'Nothing was said about the source that could be checked either way.'
  }
  const parts: string[] = []
  if (b.held.length) parts.push(`held ${b.held.length} claim${b.held.length === 1 ? '' : 's'} the reading bears out`)
  else parts.push('held nothing the reading bears out')
  if (b.restated.length) parts.push(`${b.restated.length} restated from their own write-up`)
  if (b.unsupported.length) parts.push(`${b.unsupported.length} the reading does not support`)
  if (b.wrong.length) parts.push(`${b.wrong.length} the reading contradicts`)
  return `${parts.join(', ')}.`
}

/**
 * One student's boundary, as plain text a lecturer can download and hand off — to Canvas,
 * to the student, wherever. This is the shape the production app actually ships: never a
 * score, never a raw transcript by default, just where understanding stopped.
 */
export function studentReportText(name: string, indexNumber: string, week: string, b: Boundary): string {
  const lines = [`${name} (${indexNumber})`, week, '', boundaryLine(b), '']

  if (b.held.length) {
    lines.push('HELD — the reading bears these out')
    for (const c of b.held) lines.push(`  - ${c}`)
    lines.push('')
  }
  if (b.unsupported.length) {
    lines.push('NOT BORNE OUT — the reading does not support these')
    for (const c of b.unsupported) lines.push(`  - ${c}`)
    lines.push('')
  }
  if (b.wrong.length) {
    lines.push('CONTRADICTED — the reading says otherwise')
    for (const c of b.wrong) lines.push(`  - ${c}`)
    lines.push('')
  }
  if (b.restated.length) {
    lines.push('RESTATED — supported, but lifted from their own write-up rather than shown fresh')
    for (const c of b.restated) lines.push(`  - ${c}`)
  }
  return lines.join('\n').trim()
}

/* -- across a class ------------------------------------------------------- */

export interface TopicPattern {
  passage: number
  /** Which reading this passage came from — its name, for display. */
  docName: string
  /** The opening of that passage, so a lecturer can see which part of the reading it is. */
  excerpt: string
  /** How many students held at least one claim checked against this passage. */
  held: number
  /** How many made a claim against it that the source did not support or contradicted. */
  missed: number
  /** How many said nothing about it at all. */
  silent: number
}

export interface ClassReport {
  students: number
  /** Ordered worst-first: where the class is thinnest comes first, because that is the ask. */
  topics: TopicPattern[]
  /** Claims several students got wrong in the same way — a shared misconception. */
  shared: { text: string; students: number }[]
}

const norm = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Two claims are "the same" if they share most of their uncommon words. */
function similar(a: string, b: string): boolean {
  const wa = new Set(norm(a).split(' ').filter((w) => w.length > 4))
  const wb = new Set(norm(b).split(' ').filter((w) => w.length > 4))
  if (!wa.size || !wb.size) return false
  let shared = 0
  for (const w of wa) if (wb.has(w)) shared += 1
  return shared / Math.min(wa.size, wb.size) >= 0.6
}

/**
 * Roll several examinations up into what a lecturer can act on.
 *
 * Individuals are counted, never named. The proposal asks for class-level patterns
 * "without exposing individual students unnecessarily", and a report that says which
 * three people failed is a different and worse document than one that says two thirds of
 * the class could not say how the method worked.
 */
export function classReport(
  sessions: { participant: string; grade: Grade | null }[],
  docs: SourceDoc[],
): ClassReport {
  const usable = sessions.filter((s) => s.grade?.claims?.length)
  const windows = windowsOf(docs)
  if (!usable.length) return { students: 0, topics: [], shared: [] }

  const touched = new Map<number, { held: Set<string>; missed: Set<string> }>()
  for (const session of usable) {
    for (const claim of session.grade!.claims) {
      if (claim.passage < 0) continue
      const row = touched.get(claim.passage) ?? { held: new Set(), missed: new Set() }
      if (claim.support === 'supported' && !claim.recycled) row.held.add(session.participant)
      else row.missed.add(session.participant)
      touched.set(claim.passage, row)
    }
  }

  const topics: TopicPattern[] = [...touched.entries()]
    .map(([passage, row]) => {
      const window = windows[passage]
      return {
        passage,
        docName: window ? (docs[window.doc]?.name ?? '') : '',
        excerpt: (window?.text ?? '').split(/\s+/).slice(0, 18).join(' '),
        held: row.held.size,
        // Someone who held a claim here is not also counted as having missed it.
        missed: [...row.missed].filter((p) => !row.held.has(p)).length,
        silent: usable.length - new Set([...row.held, ...row.missed]).size,
      }
    })
    // A passage index that no longer resolves — the reading list changed after the
    // examination, say — has nothing to show a lecturer and is dropped rather than
    // rendered as an empty quotation.
    .filter((t) => t.excerpt.trim().length > 0)
    // Thinnest first: fewest students with any command of it, ties broken by who tried.
    .sort((a, b) => a.held - b.held || b.missed - a.missed)

  /* A claim several students made that the source does not bear out is worth more of a
   * lecturer's attention than any individual's transcript: it is the class believing the
   * same wrong thing, which usually comes from the teaching rather than the reading. */
  const wrongClaims: string[] = []
  for (const session of usable) {
    for (const claim of session.grade!.claims) {
      if (claim.support !== 'supported') wrongClaims.push(claim.text)
    }
  }
  const shared: { text: string; students: number }[] = []
  for (const text of wrongClaims) {
    const already = shared.find((s) => similar(s.text, text))
    if (already) already.students += 1
    else shared.push({ text, students: 1 })
  }

  return {
    students: usable.length,
    topics,
    shared: shared.filter((s) => s.students > 1).sort((a, b) => b.students - a.students),
  }
}

/** The class report as plain text, for reading on the spot or pasting into an email. */
export function classReportText(report: ClassReport): string {
  if (!report.students) return 'No examinations with checkable claims yet.'
  const lines: string[] = [`Across ${report.students} student${report.students === 1 ? '' : 's'}.`, '']

  lines.push('WHERE THE CLASS IS THINNEST')
  for (const topic of report.topics.slice(0, 6)) {
    lines.push(
      `  ${String(topic.held).padStart(2)} of ${report.students} held it · ${topic.missed} tried and missed · ${topic.silent} silent  [${topic.docName}]`,
    )
    lines.push(`     "${topic.excerpt}…"`)
  }

  if (report.shared.length) {
    lines.push('', 'SAID BY MORE THAN ONE STUDENT, AND NOT BORNE OUT BY THE READING')
    for (const claim of report.shared.slice(0, 6)) {
      lines.push(`  ${claim.students} students — ${claim.text}`)
    }
  }
  return lines.join('\n')
}
