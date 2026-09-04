import type { Answer, ConceptScore, PathNode, Verdict } from '../data/types'

export interface Move {
  question: string
  index: number
  probe: boolean
}

/**
 * Decides what comes next.
 *
 * This is Probe in one object: the examiner asks, listens, and then the *answer* — not a
 * fixed running order — chooses the next move. Position, the transcript and the
 * one-probe-per-question rule live here; who actually judges an answer is swappable, so
 * a model and the on-page fallback produce the same shape of session.
 */
export class Examiner {
  private index = 0
  private firedHere = new Set<number>()
  readonly answers: Answer[] = []
  probing = false

  constructor(private readonly script: PathNode[]) {}

  get node(): PathNode | null {
    return this.script[this.index] ?? null
  }

  get total(): number {
    return this.script.length
  }

  get position(): number {
    return this.index
  }

  /** True once this question has already been pressed on. */
  get probedHere(): boolean {
    return this.firedHere.size > 0
  }

  opening(): Move | null {
    const first = this.script[0]
    return first ? { question: first.question, index: 0, probe: false } : null
  }

  /**
   * Shallow judgement, used when no model is configured or a call fails. It matches
   * terms rather than meaning, so it rewards saying the right words — the right shape
   * for a fallback, the wrong one to rely on.
   */
  localVerdict(said: string): Verdict {
    const node = this.node
    if (!node) return { covered: true, coverage: 0, followUp: '' }
    const lower = said.toLowerCase()
    const hit = node.expects.filter((t) => lower.includes(t.toLowerCase())).length
    const coverage = Math.round((hit / Math.max(node.expects.length, 1)) * 100)

    const probe = node.probes.find(
      (p, i) => !this.firedHere.has(i) && p.missing.length > 0 &&
        !p.missing.some((m) => lower.includes(m.toLowerCase())),
    )
    return probe
      ? { covered: false, coverage, followUp: probe.followUp }
      : { covered: true, coverage, followUp: '' }
  }

  /**
   * Applies a verdict from whichever brain produced it. A spent probe cannot fire
   * again, so a learner who keeps missing is moved along rather than trapped.
   */
  apply(said: string, verdict: Verdict): Move | null {
    const node = this.node
    if (!node) return null

    const press = !verdict.covered && verdict.followUp.trim().length > 0 && !this.probedHere
    this.record(node, said, verdict.coverage, press || this.probing)

    if (press) {
      this.firedHere.add(this.firedHere.size)
      this.probing = true
      return { question: verdict.followUp, index: this.index, probe: true }
    }

    this.probing = false
    this.firedHere.clear()
    this.index += 1
    const next = this.script[this.index]
    return next ? { question: next.question, index: this.index, probe: false } : null
  }

  /** One row per question: a probe replaces the earlier attempt rather than adding one. */
  private record(node: PathNode, spoken: string, coverage: number, probed: boolean): void {
    const entry: Answer = { question: node.question, concept: node.concept, spoken, coverage, probed }
    const at = this.answers.findIndex((a) => a.question === node.question)
    if (at < 0) {
      this.answers.push(entry)
      return
    }
    // Keep the better attempt, but remember it took a probe to get there.
    const previous = this.answers[at]
    this.answers[at] = coverage >= previous.coverage ? { ...entry, probed: true } : { ...previous, probed: true }
  }

  get probeCount(): number {
    return this.answers.filter((a) => a.probed).length
  }

  /** Coverage of what was actually said, less a deduction per question that was pressed. */
  score(): number {
    if (this.answers.length === 0) return 0
    const coverage = this.answers.reduce((sum, a) => sum + a.coverage, 0) / this.answers.length / 100
    const penalty = this.probeCount * 0.04
    return Math.round(Math.min(1, Math.max(0, coverage - penalty)) * 100)
  }

  breakdown(): ConceptScore[] {
    return this.answers.map((a) => ({
      label: a.concept || a.question.slice(0, 28),
      percent: a.coverage,
      state: a.coverage >= 70 ? 'solid' : a.coverage >= 30 ? 'shaky' : 'gap',
    }))
  }

  /** The moment worth showing the reviewer: the weakest answer that had to be pressed. */
  weakest(): Answer | null {
    return this.answers.filter((a) => a.probed).sort((x, y) => x.coverage - y.coverage)[0] ?? null
  }

  verdict(): string {
    const bars = this.breakdown()
    const gaps = bars.filter((b) => b.state === 'gap').length
    const shaky = bars.filter((b) => b.state === 'shaky').length
    if (gaps === 0 && shaky === 0) return 'Ready. Nothing had to be dragged out of you.'
    if (gaps === 0) return `Ready, with ${shaky} soft spot${shaky === 1 ? '' : 's'}.`
    return `${gaps} gap${gaps === 1 ? '' : 's'} to close before this is defensible.`
  }
}
