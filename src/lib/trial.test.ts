import { describe, expect, it } from 'vitest'
import { signalsFor, type TrialTurn } from './trial'

/**
 * These measures are the reason for running a trial at all, so they have to be right
 * about the thing they claim to measure — and, just as importantly, insensitive to the
 * thing they must not measure. Answer length is the one that has already caught us out:
 * the judge's score correlated with it at r = 0.22, which meant a verbose student scored
 * better for being verbose. Every rate here is per hundred words for that reason, and the
 * last test holds it to that.
 */

const DOCUMENT = `Mill argues that the only purpose for which power can be rightfully exercised
over any member of a civilised community, against his will, is to prevent harm to others.
His own good, either physical or moral, is not a sufficient warrant. The harm principle
therefore draws a boundary around self-regarding conduct. Mill distinguishes liberty of
thought and discussion from liberty of action, and treats the suppression of an opinion as
a peculiar evil: if the opinion is right, we are robbed of the chance to exchange error for
truth; if wrong, we lose the clearer perception produced by its collision with error.`

const turn = (said: string, over: Partial<TrialTurn> = {}): TrialTurn => ({
  index: 0,
  question: 'What does the harm principle rule out?',
  probe: false,
  said,
  silenceMs: 1000,
  spokenMs: 5000,
  typed: false,
  at: 0,
  ...over,
})

describe('signalsFor', () => {
  it('survives an empty transcript rather than dividing by zero', () => {
    const s = signalsFor([], DOCUMENT)
    expect(s.words).toBe(0)
    expect(Number.isFinite(s.hedge)).toBe(true)
    expect(Number.isFinite(s.groundedYield)).toBe(true)
  })

  it('counts hedging and boosting apart from each other', () => {
    const hedged = signalsFor([turn('I think it might be about harm, I am not sure really')], DOCUMENT)
    const boosted = signalsFor([turn('It is obviously and certainly about harm, clearly')], DOCUMENT)
    expect(hedged.hedge).toBeGreaterThan(boosted.hedge)
    expect(boosted.boost).toBeGreaterThan(hedged.boost)
  })

  it('separates grounded detail from invented detail', () => {
    // Both answers produce new long terms; only one produces terms the document contains.
    const grounded = signalsFor(
      [turn('It is about harm.'), turn('Mill separates liberty of discussion from liberty of action.', { probe: true })],
      DOCUMENT,
    )
    const invented = signalsFor(
      [turn('It is about harm.'), turn('Bentham formalised the proportionality calculus in 1823.', { probe: true })],
      DOCUMENT,
    )
    expect(grounded.groundedYield).toBeGreaterThan(invented.groundedYield)
    expect(invented.ungroundedYield).toBeGreaterThan(invented.groundedYield)
  })

  it('notices an answer read straight off the page', () => {
    const recited = signalsFor(
      [
        turn('It is about harm.'),
        turn('The only purpose for which power can be rightfully exercised over any member of a civilised community, against his will, is to prevent harm to others.', { probe: true }),
      ],
      DOCUMENT,
    )
    const ownWords = signalsFor(
      [turn('It is about harm.'), turn('You can only stop someone when they would hurt somebody else.', { probe: true })],
      DOCUMENT,
    )
    expect(recited.documentEcho).toBeGreaterThan(40)
    expect(ownWords.documentEcho).toBeLessThan(10)
  })

  it('notices a second answer that just repeats the first', () => {
    const repeated = signalsFor(
      [turn('It stops you harming other people.'), turn('It stops you harming other people.', { probe: true })],
      DOCUMENT,
    )
    expect(repeated.selfEcho).toBeGreaterThan(50)
  })

  it('reports the pause before answering in seconds, ignoring typed turns', () => {
    const s = signalsFor(
      [
        turn('Something.', { silenceMs: 2000 }),
        turn('Something else.', { silenceMs: 4000, probe: true }),
        // A typed answer has no meaningful silence and must not drag the median around.
        turn('Typed answer.', { silenceMs: 90000, typed: true }),
      ],
      DOCUMENT,
    )
    expect(s.medianSilence).toBe(3)
    expect(s.medianProbeSilence).toBe(4)
  })

  it('tells reading the source back apart from reading their own passage back', () => {
    const work = 'I argue that Mill draws the line at conduct which affects only the person doing it.'
    const readSource = signalsFor(
      [
        turn('It is about harm.'),
        turn('The suppression of an opinion is a peculiar evil, because we lose the chance to exchange error for truth.', { probe: true }),
      ],
      DOCUMENT,
      work,
    )
    const readSelf = signalsFor(
      [turn('It is about harm.'), turn(work, { probe: true })],
      DOCUMENT,
      work,
    )
    // Quoting the reading is not the same failure as restating your own paragraph, and the
    // two measures have to be able to disagree or neither is worth recording.
    expect(readSource.documentEcho).toBeGreaterThan(readSource.workEcho)
    expect(readSelf.workEcho).toBeGreaterThan(readSelf.documentEcho)
  })

  it('reports no work echo when no passage was supplied', () => {
    const s = signalsFor([turn('Something about harm.')], DOCUMENT)
    expect(s.workEcho).toBe(0)
  })

  it('does not reward length: the same answer said twice over scores the same rates', () => {
    const once = 'I think it might be about harm, perhaps.'
    const short = signalsFor([turn(once)], DOCUMENT)
    const long = signalsFor([turn(`${once} ${once} ${once}`)], DOCUMENT)
    expect(long.words).toBeGreaterThan(short.words)
    expect(long.hedge).toBeCloseTo(short.hedge, 5)
  })
})
