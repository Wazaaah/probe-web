/**
 * Recording a trial session so it can be looked at afterwards.
 *
 * Probe normally keeps nothing: a session happens in the tab and the transcript dies with
 * it. That is right for ordinary use and useless for finding out whether the thing works,
 * so this module exists for the one case where someone is running a handful of people
 * through the same reading on purpose and needs the transcripts back.
 *
 * It records two kinds of thing.
 *
 * The first is the transcript — what was asked, what was said, how long the silence
 * before the answer was. Timing matters because it is the one signal a confident bluffer
 * cannot produce on demand: hesitating before a specific is different from hesitating
 * before a generality, and no amount of fluent prose fakes it.
 *
 * The second is a set of lexical measures computed here, in the tab, from the transcript.
 * They are the measures that separated simulated students in testing — hedging, self-
 * repair, how much of an answer is recycled from the document or from the student's own
 * previous answer, and how much NEW grounded specific detail each probe extracts. They
 * are recorded rather than acted on: the whole reason for running real people is that we
 * do not yet know whether these hold outside the simulation, and a measure you are still
 * validating must not be allowed to affect anybody's result.
 *
 * Nothing leaves the browser unless the person running the trial exports it.
 */

import type { Answer } from '../data/types'

export interface TrialTurn {
  /** Which question in the script this belongs to, so probes group with their parent. */
  index: number
  question: string
  /** True when this turn was a follow-up rather than a fresh question. */
  probe: boolean
  said: string
  /** Milliseconds between the question finishing and the first word of the answer. */
  silenceMs: number
  /** Milliseconds spent answering, first word to last. */
  spokenMs: number
  /** Whether they typed instead of speaking — typed answers have no meaningful silence. */
  typed: boolean
  at: number
}

export type Preparation = 'read' | 'skimmed' | 'unread' | 'unsaid'

export interface TrialSession {
  participant: string
  /** Self-reported before starting, and never shown to the examiner. */
  preparation: Preparation
  document: string
  startedAt: number
  endedAt: number
  turns: TrialTurn[]
  answers: Answer[]
  score: number | null
  signals: TrialSignals | null
  /** Anything the participant wanted to say afterwards. */
  note: string
}

/* -- lexicon ------------------------------------------------------------- */

/** Flagging your own uncertainty. Separated from knowledge on purpose: the judge we
 *  measured conflates the two and marks a hedging student down for being honest. */
const HEDGES = [
  'i think', 'i believe', 'i guess', 'i suppose', 'maybe', 'perhaps', 'possibly',
  'might', 'may be', 'could be', 'seems', 'seem to', 'appears', 'sort of', 'kind of',
  'roughly', 'i am not sure', "i'm not sure", 'not certain', "i don't know",
  'i do not know', "i can't remember", 'if i remember', 'if i recall', 'probably',
  'somewhat', 'to some extent',
]

/** Raising the force of a claim rather than its content. */
const BOOSTERS = [
  'clearly', 'obviously', 'certainly', 'definitely', 'undoubtedly', 'of course',
  'well established', 'well-established', 'without question', 'it is clear',
  'everyone knows', 'always', 'never', 'absolutely', 'fundamentally', 'essentially',
  'in fact', 'indeed', 'precisely', 'exactly', 'strongly', 'firmly', 'no doubt',
]

/** Revising yourself mid-answer — costly to fake, because it needs a position specific
 *  enough to be worth correcting. */
const REPAIRS = [
  'actually', 'i mean', 'wait', 'sorry', 'let me', 'rather', 'or rather',
  "that's not", 'that is not', 'i should say', 'i misspoke', 'on reflection',
]

const ABSTRACT = /(?:tion|sion|ment|ity|ness|ism|ance|ence|ology|ability|hood|ship)s?$/i

const STOP = new Set(
  ('a an the and or but if of to in on at for with as is are was were be been being that this these those it its ' +
    'from by not no so than then there here what which who whom whose how why when where can could would should ' +
    'will shall may might must do does did done have has had having i you he she they we me him her them us my ' +
    'your his their our about into over under more most some any all such very also just only own same too now')
    .split(' '),
)

const words = (text: string): string[] => text.toLowerCase().match(/[a-z0-9'-]+/g) ?? []
const content = (text: string): string[] => words(text).filter((w) => !STOP.has(w) && w.length > 2)

function ngrams(text: string, n: number): Set<string> {
  const w = words(text)
  const out = new Set<string>()
  for (let i = 0; i + n <= w.length; i += 1) out.add(w.slice(i, i + n).join(' '))
  return out
}

/** Share of this text's n-grams that also occur in `source`, as a percentage. */
function echo(text: string, source: string, n = 3): number {
  const mine = ngrams(text, n)
  if (!mine.size) return 0
  const theirs = ngrams(source, n)
  let hit = 0
  for (const gram of mine) if (theirs.has(gram)) hit += 1
  return (hit / mine.size) * 100
}

/** Occurrences per hundred words, so a long answer cannot inflate a rate. */
function rate(text: string, phrases: string[]): number {
  const haystack = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `
  let found = 0
  for (const phrase of phrases) {
    let from = 0
    for (;;) {
      const at = haystack.indexOf(phrase, from)
      if (at < 0) break
      found += 1
      from = at + phrase.length
    }
  }
  return (found / Math.max(words(text).length, 1)) * 100
}

/** Figures, names and technical terms — the things only engagement produces. */
function specifics(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of text.match(/\b\d[\d.,%]*\b/g) ?? []) out.add(m.toLowerCase())
  // Skip sentence-initial capitals: they carry no signal.
  for (const m of text.match(/(?<![.!?]\s|^)\b[A-Z][a-z]{2,}/g) ?? []) out.add(m.toLowerCase())
  for (const w of content(text)) if (w.length >= 8) out.add(w)
  return out
}

function abstraction(text: string): number {
  const c = content(text)
  if (!c.length) return 0
  return (c.filter((w) => ABSTRACT.test(w)).length / c.length) * 100
}

export interface TrialSignals {
  words: number
  hedge: number
  boost: number
  repair: number
  /** New grounded specifics per hundred words, summed over every turn after the first. */
  groundedYield: number
  /** New specifics that do NOT occur in the document — invention rather than recall. */
  ungroundedYield: number
  /** How much of the later answers is lifted from the document. */
  documentEcho: number
  /** How much of the later answers repeats the student's own opening answer. */
  selfEcho: number
  /** Change in abstract vocabulary from the first answer to the rest. Rising means a
   *  retreat upward under pressure, which is where someone goes when specifics run out. */
  abstractionDrift: number
  /** Median silence before answering, in seconds. */
  medianSilence: number
  /** Median silence before answers that followed a probe, which is where it should bite. */
  medianProbeSilence: number
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Reduce a finished transcript to the measures worth comparing across people.
 *
 * Grounding is checked against terms that are not merely common in the document: a word
 * that appears on every page is available to anyone who glanced at the title, so counting
 * it would hand marks to exactly the person this is meant to distinguish.
 */
export function signalsFor(turns: TrialTurn[], document: string): TrialSignals {
  const said = turns.map((t) => t.said)
  const whole = said.join(' ')
  const opener = said[0] ?? ''
  const later = said.slice(1).join(' ')

  const counts = new Map<string, number>()
  for (const w of content(document)) counts.set(w, (counts.get(w) ?? 0) + 1)
  const grounded = new Set([...specifics(document)].filter((s) => (counts.get(s) ?? 1) <= 40))

  let gained = 0
  let invented = 0
  for (let i = 1; i < said.length; i += 1) {
    const seen = new Set<string>()
    for (const earlier of said.slice(0, i)) for (const s of specifics(earlier)) seen.add(s)
    const fresh = [...specifics(said[i])].filter((s) => !seen.has(s))
    const per = 100 / Math.max(words(said[i]).length, 1)
    gained += fresh.filter((s) => grounded.has(s)).length * per
    invented += fresh.filter((s) => !grounded.has(s)).length * per
  }

  const spoken = turns.filter((t) => !t.typed)
  return {
    words: words(whole).length,
    hedge: rate(whole, HEDGES),
    boost: rate(whole, BOOSTERS),
    repair: rate(whole, REPAIRS),
    groundedYield: gained,
    ungroundedYield: invented,
    documentEcho: echo(later || whole, document, 3),
    selfEcho: later ? echo(later, opener, 3) : 0,
    abstractionDrift: later ? abstraction(later) - abstraction(opener) : 0,
    medianSilence: median(spoken.map((t) => t.silenceMs)) / 1000,
    medianProbeSilence: median(spoken.filter((t) => t.probe).map((t) => t.silenceMs)) / 1000,
  }
}

/* -- the document under examination -------------------------------------- */

/**
 * The text of whatever was last read in.
 *
 * Held here rather than in the store because the store is published over the pairing
 * link, and a whole document does not belong on a 4KB pub/sub channel. Grounding needs
 * the full text and nothing else does, so it stays in this module and dies with the tab.
 */
let currentDocument = ''

export function rememberDocument(text: string): void {
  currentDocument = text
}

export function documentText(): string {
  return currentDocument
}

/* -- the recorder -------------------------------------------------------- */

const KEY = 'probe.trial'
const SESSIONS = 'probe.trial.sessions'

export interface TrialSetup {
  participant: string
  preparation: Preparation
  /** Optional ntfy topic; when set, a finished session is pushed there as well as kept. */
  topic: string
}

function readSetup(): TrialSetup | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as TrialSetup) : null
  } catch {
    return null
  }
}

export function saveSetup(setup: TrialSetup | null): void {
  try {
    if (setup) localStorage.setItem(KEY, JSON.stringify(setup))
    else localStorage.removeItem(KEY)
  } catch {
    /* private browsing: the trial still runs, it just is not remembered between reloads */
  }
}

export const trialSetup = readSetup

/** Is this tab set up to record? Ordinary sessions must be untouched by any of this. */
export function trialArmed(): boolean {
  const setup = readSetup()
  return Boolean(setup?.participant)
}

/**
 * Holds one session while it happens.
 *
 * A module-level instance rather than React state on purpose: the examination screen
 * already owns a good deal of state, and recording must never be able to trigger a
 * re-render or change what the examiner does.
 */
class Recorder {
  private turns: TrialTurn[] = []
  private askedAt = 0
  private startedAt = 0
  private firstWordAt = 0
  private document = ''

  begin(document = currentDocument): void {
    this.turns = []
    this.startedAt = Date.now()
    this.askedAt = 0
    this.firstWordAt = 0
    this.document = document
  }

  /** The examiner has finished speaking and the microphone is open. */
  asked(): void {
    this.askedAt = Date.now()
    this.firstWordAt = 0
  }

  /** The recogniser produced its first words for this answer. */
  speaking(): void {
    if (!this.firstWordAt) this.firstWordAt = Date.now()
  }

  answered(index: number, question: string, probe: boolean, said: string, typed: boolean): void {
    if (!this.startedAt) return
    const now = Date.now()
    const first = this.firstWordAt || now
    this.turns.push({
      index,
      question,
      probe,
      said,
      silenceMs: this.askedAt ? Math.max(0, first - this.askedAt) : 0,
      spokenMs: Math.max(0, now - first),
      typed,
      at: now,
    })
    this.firstWordAt = 0
  }

  finish(answers: Answer[], score: number | null): TrialSession | null {
    const setup = readSetup()
    if (!setup?.participant || !this.turns.length) return null
    const session: TrialSession = {
      participant: setup.participant,
      preparation: setup.preparation,
      document: this.document.slice(0, 200),
      startedAt: this.startedAt,
      endedAt: Date.now(),
      turns: this.turns,
      answers,
      score,
      signals: signalsFor(this.turns, this.document),
      note: '',
    }
    keep(session)
    this.turns = []
    this.startedAt = 0
    return session
  }
}

export const recorder = new Recorder()

/* -- what has been collected on this device ------------------------------ */

export function loadSessions(): TrialSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as TrialSession[]) : []
  } catch {
    return []
  }
}

function keep(session: TrialSession): void {
  try {
    localStorage.setItem(SESSIONS, JSON.stringify([...loadSessions(), session]))
  } catch {
    /* Storage full or blocked. The export below still works for the session in hand. */
  }
}

export function clearSessions(): void {
  try {
    localStorage.removeItem(SESSIONS)
  } catch {
    /* nothing to do */
  }
}

export function annotate(at: number, note: string): void {
  const all = loadSessions()
  const found = all.find((s) => s.startedAt === at)
  if (!found) return
  found.note = note
  try {
    localStorage.setItem(SESSIONS, JSON.stringify(all))
  } catch {
    /* the note is lost, the session is not */
  }
}

/**
 * Hand the collected sessions over as a file.
 *
 * A download rather than an upload: there is no server behind Probe, the transcripts are
 * someone's coursework, and the person running the trial should be the one who decides
 * where they go.
 */
export function exportSessions(sessions = loadSessions()): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    count: sessions.length,
    sessions,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `probe-trial-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking immediately can cancel the download in some browsers; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** A compact table for reading on the spot, before anyone opens the JSON. */
export function summarise(sessions = loadSessions()): string {
  if (!sessions.length) return 'No sessions recorded yet.'
  const head = ['participant', 'prep', 'score', 'words', 'hedge', 'repair', 'gYield', 'docEcho', 'silence']
  const rows = sessions.map((s) => [
    s.participant,
    s.preparation,
    s.score == null ? '—' : String(s.score),
    String(s.signals?.words ?? 0),
    (s.signals?.hedge ?? 0).toFixed(2),
    (s.signals?.repair ?? 0).toFixed(2),
    (s.signals?.groundedYield ?? 0).toFixed(1),
    (s.signals?.documentEcho ?? 0).toFixed(1),
    `${(s.signals?.medianSilence ?? 0).toFixed(1)}s`,
  ])
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ')
  return [line(head), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)].join('\n')
}
