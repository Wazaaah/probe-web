import { describe, expect, it } from 'vitest'
import {
  evidenceFor,
  passageFor,
  readClaims,
  readVerdicts,
  recycles,
  scoreClaims,
  windowsOf,
  type Claim,
  type SourceDoc,
} from './claims'

/**
 * The parts of the claims judge that decide a score without a model in the loop.
 *
 * These are worth holding down precisely because the model half is the part everyone
 * looks at. Retrieval that returns the wrong passage makes a correct claim look absent;
 * a recycled-claim check that never fires hands marks to someone reading their own
 * paragraph back; and a score that ignores either half rewards the wrong student. None of
 * those failures announce themselves — they come out as a plausible number.
 *
 * Retrieval now spans more than one reading, which adds a failure mode worth its own
 * tests: a claim about the second reading getting silently checked against the first
 * because that is the one more students happened to write about.
 */

const doc = (name: string, text: string): SourceDoc => ({ name, text })

const SINGER = doc(
  'Singer',
  `Singer argues that if it is in our power to prevent something bad from
happening, without thereby sacrificing anything of comparable moral importance, we ought
morally to do it. He notes that the principle takes no account of proximity or distance.
Dora, in the Brazilian film Central Station, is paid a thousand dollars to deliver a
homeless boy to an address, and buys a television with the money. Bob has invested his
savings in a Bugatti and can save a child only by sacrificing the car. Singer concludes
that the distinction between duty and charity, as ordinarily drawn, cannot be sustained.`,
)

const MILL = doc(
  'Mill',
  `Mill argues that the only purpose for which power can be rightfully exercised over any
member of a civilised community, against his will, is to prevent harm to others. He
distinguishes liberty of thought and discussion from liberty of action, and treats the
suppression of an opinion as a peculiar evil, because we lose the chance to exchange
error for truth.`,
)

describe('windowsOf', () => {
  it('returns the whole text as one window when it is short', () => {
    expect(windowsOf([doc('short', 'a short passage of text')], 110)).toHaveLength(1)
  })

  it('overlaps, so a sentence across a boundary still lands whole somewhere', () => {
    const text = Array.from({ length: 300 }, (_, i) => `w${i}`).join(' ')
    const w = windowsOf([doc('long', text)], 110, 45)
    expect(w.length).toBeGreaterThan(2)
    // Consecutive windows must share content, or a claim spanning the seam matches neither.
    const first = new Set(w[0].text.split(' '))
    const shared = w[1].text.split(' ').filter((t) => first.has(t))
    expect(shared.length).toBeGreaterThan(30)
  })

  it('tags every window with which reading it came from', () => {
    const w = windowsOf([SINGER, MILL], 30, 15)
    expect(w.some((x) => x.doc === 0)).toBe(true)
    expect(w.some((x) => x.doc === 1)).toBe(true)
  })

  it('never lets a window span two readings', () => {
    // Singer's last words and Mill's first words share no window, however small the size.
    const w = windowsOf([SINGER, MILL], 8, 4)
    for (const window of w) {
      const lower = window.text.toLowerCase()
      const hasSinger = lower.includes('duty') || lower.includes('bugatti')
      const hasMill = lower.includes('civilised') || lower.includes('opinion')
      expect(hasSinger && hasMill).toBe(false)
    }
  })
})

describe('passageFor across several readings', () => {
  it('routes a claim to the reading it actually concerns, not the first one', () => {
    const w = windowsOf([SINGER, MILL], 30, 15)
    const idx = passageFor('Mill treats the suppression of an opinion as a peculiar evil', w)
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(w[idx].doc).toBe(1)
  })

  it('routes the other way just as readily', () => {
    const w = windowsOf([SINGER, MILL], 30, 15)
    const idx = passageFor('Bob has a Bugatti and can only save the child by giving it up', w)
    expect(w[idx].doc).toBe(0)
  })
})

describe('evidenceFor', () => {
  it('returns the passage that shares the claim’s rare words', () => {
    const w = windowsOf([SINGER], 40, 20)
    const got = evidenceFor('Bob invested his savings in a Bugatti', w, [SINGER], 1)
    expect(got.toLowerCase()).toContain('bugatti')
  })

  it('does not return the Bugatti passage for a claim about Dora', () => {
    const w = windowsOf([SINGER], 30, 15)
    const got = evidenceFor('Dora was paid to deliver a boy and bought a television', w, [SINGER], 1)
    expect(got.toLowerCase()).toContain('dora')
  })

  it('labels the snippet with which reading it came from', () => {
    const w = windowsOf([SINGER, MILL], 30, 15)
    const got = evidenceFor('Mill distinguishes thought from action', w, [SINGER, MILL], 1)
    expect(got).toContain('[Mill]')
  })

  it('survives a claim made entirely of stopwords', () => {
    const w = windowsOf([SINGER], 30, 15)
    expect(() => evidenceFor('and the of it', w, [SINGER], 2)).not.toThrow()
  })
})

describe('recycles', () => {
  const work = 'I think Singer argues that distance makes no moral difference to our obligations.'

  it('catches a claim lifted from their own passage', () => {
    expect(recycles('Singer argues that distance makes no moral difference', work)).toBe(true)
  })

  it('passes a claim they did not already write', () => {
    expect(recycles('Dora bought a television with the money she was paid', work)).toBe(false)
  })

  it('is false when no passage was supplied, rather than throwing', () => {
    expect(recycles('anything at all', '')).toBe(false)
  })
})

describe('scoreClaims', () => {
  const claim = (support: Claim['support'], recycled = false): Claim => ({ text: 'x', support, recycled, passage: 0 })

  it('scores nothing when no claims were made', () => {
    expect(scoreClaims([]).score).toBe(0)
  })

  it('scores nothing when everything said is unsupported', () => {
    expect(scoreClaims([claim('absent'), claim('absent'), claim('contradicted')]).score).toBe(0)
  })

  it('gives full marks for four fresh supported claims and nothing wrong', () => {
    expect(scoreClaims([claim('supported'), claim('supported'), claim('supported'), claim('supported')]).score).toBe(100)
  })

  it('refuses to reward claims recycled from their own passage', () => {
    const recycled = scoreClaims([claim('supported', true), claim('supported', true), claim('supported', true), claim('supported', true)])
    expect(recycled.precision).toBe(1)
    expect(recycled.fresh).toBe(0)
    expect(recycled.score).toBe(0)
  })

  it('penalises saying many things loosely over few things accurately', () => {
    const careful = scoreClaims([claim('supported'), claim('supported'), claim('supported'), claim('supported')])
    const loose = scoreClaims([
      claim('supported'), claim('supported'), claim('supported'), claim('supported'),
      claim('absent'), claim('absent'), claim('absent'), claim('absent'),
    ])
    expect(loose.fresh).toBe(careful.fresh)
    expect(loose.score).toBeLessThan(careful.score)
  })

  it('defaults checkFailed to false, and carries it through when set', () => {
    expect(scoreClaims([claim('supported')]).checkFailed).toBe(false)
    expect(scoreClaims([claim('absent')], 4, true).checkFailed).toBe(true)
  })
})

describe('reading what the model returned', () => {
  it('takes plain strings', () => {
    expect(readClaims(['a claim about something', 'another claim entirely'])).toHaveLength(2)
  })

  it('takes objects, which the model produces about half the time', () => {
    expect(readClaims([{ claim: 'a claim about something', note: 'ignored' }])).toEqual(['a claim about something'])
  })

  it('drops fragments too short to check', () => {
    expect(readClaims(['yes', 'a claim about something'])).toHaveLength(1)
  })

  it('returns an empty list for a malformed reply rather than throwing', () => {
    expect(readClaims(undefined)).toEqual([])
    expect(readClaims({ claims: 'nope' })).toEqual([])
  })

  it('pads verdicts to the number of claims, defaulting to absent', () => {
    // A short reply must not silently shift every later claim onto the wrong verdict.
    expect(readVerdicts(['supported'], 3)).toEqual(['supported', 'absent', 'absent'])
  })

  it('treats anything it does not recognise as absent, never as supported', () => {
    expect(readVerdicts(['SUPPORTED', 'maybe', 'contradicted'], 3)).toEqual(['supported', 'absent', 'contradicted'])
  })
})
