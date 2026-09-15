import { describe, expect, it } from 'vitest'
import { agreementWith, boutCount, pairsOf, rank, readWinner, settle } from './ranking'

/**
 * The bookkeeping around the comparisons, which is where a ranking quietly goes wrong.
 *
 * The model's opinion is the interesting part but it is not the fragile part. What breaks
 * a tournament is a swap that is not really a swap, a disagreement recorded as a win, or
 * a tie that silently becomes a loss — none of which look wrong in the output. They just
 * produce an order.
 */

describe('pairsOf and boutCount', () => {
  it('pairs everyone with everyone once', () => {
    expect(pairsOf(['P1', 'P2', 'P3'])).toEqual([
      ['P1', 'P2'],
      ['P1', 'P3'],
      ['P2', 'P3'],
    ])
  })

  it('counts two calls per pair, so the cost can be stated before spending it', () => {
    expect(boutCount(5)).toBe(20)
    expect(boutCount(2)).toBe(2)
    expect(boutCount(1)).toBe(0)
  })
})

describe('settle', () => {
  it('agrees across the swap and names a winner', () => {
    // Asked (P1, P2) it said A; asked (P2, P1) it said B. Both mean P1.
    expect(settle('P1', 'P2', 'A', 'B')).toEqual({ a: 'P1', b: 'P2', winner: 'P1', flipped: false })
  })

  it('agrees on the other one too', () => {
    expect(settle('P1', 'P2', 'B', 'A')).toEqual({ a: 'P1', b: 'P2', winner: 'P2', flipped: false })
  })

  it('records a tie when the judge contradicts itself on the swap', () => {
    // "A" both times means it picked whoever was shown first, which is position bias.
    const bout = settle('P1', 'P2', 'A', 'A')
    expect(bout.winner).toBeNull()
    expect(bout.flipped).toBe(true)
  })

  it('records a tie when a reply could not be read, without inventing a winner', () => {
    expect(settle('P1', 'P2', null, 'B').winner).toBeNull()
    expect(settle('P1', 'P2', null, null).winner).toBeNull()
  })
})

describe('rank', () => {
  it('puts the student who won every bout first', () => {
    const table = rank(
      ['P1', 'P2', 'P3'],
      [
        { a: 'P1', b: 'P2', winner: 'P1', flipped: false },
        { a: 'P1', b: 'P3', winner: 'P1', flipped: false },
        { a: 'P2', b: 'P3', winner: 'P2', flipped: false },
      ],
    )
    expect(table.map((r) => r.participant)).toEqual(['P1', 'P2', 'P3'])
    expect(table[0].share).toBe(1)
    expect(table[2].share).toBe(0)
  })

  it('counts a tie as half a point to both, not a loss to either', () => {
    const table = rank(
      ['P1', 'P2'],
      [{ a: 'P1', b: 'P2', winner: null, flipped: true }],
    )
    expect(table[0].share).toBe(0.5)
    expect(table[1].share).toBe(0.5)
    expect(table[0].ties).toBe(1)
    expect(table[0].losses).toBe(0)
  })

  it('gives a participant with no bouts a share of zero rather than dividing by zero', () => {
    const table = rank(['P1'], [])
    expect(table[0].share).toBe(0)
    expect(Number.isFinite(table[0].share)).toBe(true)
  })
})

describe('agreementWith', () => {
  it('is 1 when the machine ordered them exactly as the human did', () => {
    const human = new Map([['P1', 1], ['P2', 2], ['P3', 3], ['P4', 4]])
    expect(agreementWith(['P1', 'P2', 'P3', 'P4'], human)).toBeCloseTo(1, 5)
  })

  it('is -1 when the machine ordered them exactly backwards', () => {
    const human = new Map([['P1', 1], ['P2', 2], ['P3', 3], ['P4', 4]])
    expect(agreementWith(['P4', 'P3', 'P2', 'P1'], human)).toBeCloseTo(-1, 5)
  })

  it('declines to report a correlation on fewer than three, rather than dressing up noise', () => {
    expect(agreementWith(['P1', 'P2'], new Map([['P1', 1], ['P2', 2]]))).toBeNull()
  })

  it('ignores people the human did not rate', () => {
    const human = new Map([['P1', 1], ['P2', 2], ['P3', 3]])
    expect(agreementWith(['P1', 'P2', 'P3', 'P9'], human)).toBeCloseTo(1, 5)
  })
})

describe('readWinner', () => {
  it('takes a bare letter', () => {
    expect(readWinner('A')).toBe('A')
    expect(readWinner('b')).toBe('B')
  })

  it('takes a letter inside a sentence, which is what models actually send', () => {
    expect(readWinner('Transcript A')).toBe('A')
    expect(readWinner('I would say B.')).toBe('B')
  })

  it('returns null rather than guessing when there is no letter', () => {
    expect(readWinner('neither of them')).toBeNull()
    expect(readWinner(undefined)).toBeNull()
    expect(readWinner('')).toBeNull()
  })
})
