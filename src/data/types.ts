/** The two sides of the handoff. One browser signs in as each. */
export type Role = 'learner' | 'reviewer'

/** A follow-up held in reserve, and the condition that fires it. */
export interface Probe {
  /** Worded for the reviewer's question tree. */
  condition: string
  /** What the examiner asks when it fires. */
  followUp: string
  /** Fires when the answer contained none of these. */
  missing: string[]
}

/**
 * A question the examiner asks, and what it listens for.
 *
 * `expects` is what a complete answer touches on. Whatever the answer misses is what
 * decides between moving on and pressing — which is the whole idea: the next question
 * comes from what was just said, not from a fixed running order.
 */
export interface PathNode {
  question: string
  concept: string
  expects: string[]
  probes: Probe[]
}

/** One angle the same document can be examined from. */
export interface QuestionPath {
  name: string
  description: string
  difficulty: 'Gentle' | 'Moderate' | 'Hard'
  minutes: number
  /** Shown only to the reviewer, who sees all four before choosing. */
  opener: string
  script: PathNode[]
}

/** One exchange, kept so the summary is built from what was actually said. */
export interface Answer {
  question: string
  concept: string
  spoken: string
  /** Percentage of the expected ground the answer covered. */
  coverage: number
  probed: boolean
}

export type Understanding = 'solid' | 'shaky' | 'gap'

export interface ConceptScore {
  label: string
  state: Understanding
  percent: number
}

/** What the examiner decided about one answer. */
export interface Verdict {
  covered: boolean
  coverage: number
  followUp: string
}

/** What it made of the whole session. */
export interface Summary {
  score: number
  verdict: string
  concepts: ConceptScore[]
  momentConcept: string
  momentQuote: string
}

export interface SessionResult {
  score: number
  verdict: string
  bars: ConceptScore[]
  probes: number
  moment: Answer | null
  transcript: Answer[]
}

export interface Person {
  initials: string
  name: string
  meta: string
}

/** Where the learner has got to, as the reviewer sees it. */
export type HandoffStatus = 'awaiting' | 'sent' | 'live' | 'done' | 'rerun'

/** The one piece of state both browsers share. */
export interface Handoff {
  status: HandoffStatus
  pathIndex: number
  pathName: string
  score: number | null
  nudged: boolean
  document: string
  /** Generated from a real upload; null means the seeded four. */
  paths: QuestionPath[] | null
  /** What came back, once there is something to read. */
  result: SessionResult | null
  /** Set by the sender so a browser ignores the echo of its own write. */
  from: string
  at: number
}
