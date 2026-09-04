import { describe, expect, it } from 'vitest'
import { Examiner } from './examiner'
import type { PathNode } from '../data/types'

/**
 * The branching rules, held to the same contract as the Android build.
 *
 * These are the decisions that make Probe what it is — press once and only once, let the
 * answer choose the next question, keep the better of two attempts — so they are tested
 * against the local judge, where the outcome is deterministic.
 */

const SCRIPT: PathNode[] = [
  {
    question: 'What does the preference do?',
    concept: 'Exit waterfall',
    expects: ['preference', 'investor'],
    probes: [
      {
        condition: 'if they skip the preference',
        followUp: 'What comes out before common sees anything?',
        missing: ['preference'],
      },
    ],
  },
  {
    question: 'And at a twenty million exit?',
    concept: 'Downside sensitivity',
    expects: ['nothing', 'zero'],
    probes: [],
  },
]

const judge = (examiner: Examiner, said: string) => examiner.apply(said, examiner.localVerdict(said))

describe('Examiner', () => {
  it('opens on the first question of the script', () => {
    expect(new Examiner(SCRIPT).opening()?.question).toBe(SCRIPT[0].question)
  })

  it('moves on when the answer covers what was expected', () => {
    const examiner = new Examiner(SCRIPT)
    examiner.opening()
    const move = judge(examiner, 'The investor takes their preference first')

    expect(move?.probe).toBe(false)
    expect(move?.question).toBe(SCRIPT[1].question)
    expect(examiner.position).toBe(1)
  })

  it('presses when the answer misses the term the probe watches for', () => {
    const examiner = new Examiner(SCRIPT)
    examiner.opening()
    const move = judge(examiner, 'I get whatever my shares are worth')

    expect(move?.probe).toBe(true)
    expect(move?.question).toBe(SCRIPT[0].probes[0].followUp)
    // A probe is a detour, not progress.
    expect(examiner.position).toBe(0)
  })

  it('presses at most once per question, however thin the second answer is', () => {
    const examiner = new Examiner(SCRIPT)
    examiner.opening()
    judge(examiner, 'I get whatever my shares are worth')
    const move = judge(examiner, 'I still do not know')

    expect(move?.probe).toBe(false)
    expect(move?.question).toBe(SCRIPT[1].question)
  })

  it('records one row per question, not one per attempt', () => {
    const examiner = new Examiner(SCRIPT)
    examiner.opening()
    judge(examiner, 'I get whatever my shares are worth')
    judge(examiner, 'The preference comes out first')

    expect(examiner.answers).toHaveLength(1)
    expect(examiner.answers[0].probed).toBe(true)
    // The better attempt survives.
    expect(examiner.answers[0].spoken).toBe('The preference comes out first')
  })

  it('ends after the last question', () => {
    const examiner = new Examiner(SCRIPT)
    examiner.opening()
    judge(examiner, 'The investor takes their preference first')

    expect(judge(examiner, 'Nothing, it is zero')).toBeNull()
    expect(examiner.answers).toHaveLength(2)
  })

  it('deducts for every question that had to be pressed', () => {
    const clean = new Examiner(SCRIPT)
    clean.opening()
    judge(clean, 'The investor takes their preference first')
    judge(clean, 'Nothing, it is zero')

    const pressed = new Examiner(SCRIPT)
    pressed.opening()
    judge(pressed, 'I get whatever my shares are worth')
    judge(pressed, 'The investor takes their preference first')
    judge(pressed, 'Nothing, it is zero')

    expect(pressed.probeCount).toBe(1)
    expect(pressed.score()).toBeLessThan(clean.score())
  })

  it('grades each concept by how much of it the answer covered', () => {
    const examiner = new Examiner(SCRIPT)
    examiner.opening()
    judge(examiner, 'The investor takes their preference first')
    judge(examiner, 'They walk away with something')

    const [first, second] = examiner.breakdown()
    expect(first).toEqual({ label: 'Exit waterfall', state: 'solid', percent: 100 })
    expect(second).toEqual({ label: 'Downside sensitivity', state: 'gap', percent: 0 })
  })

  it('surfaces the weakest pressed answer as the moment worth reading', () => {
    const examiner = new Examiner(SCRIPT)
    examiner.opening()
    judge(examiner, 'I get whatever my shares are worth')
    judge(examiner, 'The preference comes out first')
    judge(examiner, 'Nothing at all')

    expect(examiner.weakest()?.concept).toBe('Exit waterfall')
  })

  it('accepts a verdict from outside itself, whatever the words were', () => {
    const examiner = new Examiner(SCRIPT)
    examiner.opening()
    // None of the expected terms are present, but the judge says it was covered.
    const move = examiner.apply('They are paid ahead of me', { covered: true, coverage: 90, followUp: '' })

    expect(move?.probe).toBe(false)
    expect(examiner.answers[0].coverage).toBe(90)
  })
})
