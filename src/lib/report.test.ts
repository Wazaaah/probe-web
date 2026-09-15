import { describe, expect, it } from 'vitest'
import type { Claim, Grade } from './claims'
import { boundaryLine, boundaryOf, classReport, classReportText } from './report'

/**
 * The report is the product now, so its arithmetic is load-bearing in a way a score never
 * was. A miscount here does not look like a bug — it looks like a finding, and a lecturer
 * reteaches something on the strength of it.
 */

const claim = (text: string, support: Claim['support'], passage = 0, recycled = false): Claim => ({
  text,
  support,
  recycled,
  passage,
})

const grade = (claims: Claim[]): Grade => ({ claims, precision: 0, fresh: 0, score: 0 })

const SOURCE = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ')

describe('boundaryOf', () => {
  it('sorts claims into what was held, missed, contradicted and merely restated', () => {
    const b = boundaryOf(
      grade([
        claim('the method used satellite imagery', 'supported', 2),
        claim('the authors concede a limitation', 'supported', 5),
        claim('it was a randomised trial', 'absent', 1),
        claim('the effect was negative', 'contradicted', 3),
        claim('mining expanded in the watershed', 'supported', 0, true),
      ]),
    )
    expect(b.held).toHaveLength(2)
    expect(b.unsupported).toEqual(['it was a randomised trial'])
    expect(b.wrong).toEqual(['the effect was negative'])
    expect(b.restated).toEqual(['mining expanded in the watershed'])
  })

  it('counts a passage as commanded only on a held claim, not a restated one', () => {
    const b = boundaryOf(grade([claim('x', 'supported', 7, true), claim('y', 'supported', 9)]))
    expect(b.passages).toEqual([9])
  })

  it('returns empty rather than throwing when there is no grade at all', () => {
    expect(boundaryOf(null).held).toEqual([])
    expect(boundaryOf(grade([])).unsupported).toEqual([])
  })
})

describe('boundaryLine', () => {
  it('says plainly when nothing checkable was said', () => {
    expect(boundaryLine(boundaryOf(null))).toMatch(/could be checked either way/)
  })

  it('leads with what they held', () => {
    const line = boundaryLine(boundaryOf(grade([claim('a', 'supported', 1), claim('b', 'absent', 2)])))
    expect(line).toMatch(/held 1 claim the reading bears out/)
    expect(line).toMatch(/1 the reading does not support/)
  })

  it('says so when they held nothing, without characterising the student', () => {
    const line = boundaryLine(boundaryOf(grade([claim('a', 'absent', 1)])))
    expect(line).toMatch(/held nothing the reading bears out/)
    // The report describes an exchange. It must never describe a person.
    expect(line).not.toMatch(/superficial|weak|poor|lazy|student/i)
  })
})

describe('classReport', () => {
  const sessions = [
    { participant: 'P1', grade: grade([claim('method was remote sensing', 'supported', 1), claim('they found expansion doubled', 'supported', 4)]) },
    { participant: 'P2', grade: grade([claim('method was remote sensing', 'supported', 1), claim('the sample was randomised', 'absent', 4)]) },
    { participant: 'P3', grade: grade([claim('method was remote sensing', 'supported', 1), claim('the sample was randomised', 'absent', 4)]) },
  ]

  it('counts students, not claims', () => {
    const r = classReport(sessions, SOURCE)
    expect(r.students).toBe(3)
    const topic = r.topics.find((t) => t.passage === 1)
    expect(topic?.held).toBe(3)
  })

  it('puts the thinnest topic first, because that is what the lecturer is asking for', () => {
    const r = classReport(sessions, SOURCE)
    // Passage 4: one student held it, two missed. Passage 1: all three held it.
    expect(r.topics[0].passage).toBe(4)
    expect(r.topics[0].held).toBe(1)
    expect(r.topics[0].missed).toBe(2)
  })

  it('does not count a student as having missed a passage they also held', () => {
    const mixed = [
      { participant: 'P1', grade: grade([claim('right thing', 'supported', 2), claim('wrong thing', 'absent', 2)]) },
    ]
    const topic = classReport(mixed, SOURCE).topics.find((t) => t.passage === 2)
    expect(topic?.held).toBe(1)
    expect(topic?.missed).toBe(0)
  })

  it('surfaces a wrong claim several students made in common', () => {
    const r = classReport(sessions, SOURCE)
    expect(r.shared).toHaveLength(1)
    expect(r.shared[0].students).toBe(2)
    expect(r.shared[0].text).toMatch(/randomised/)
  })

  it('does not surface a wrong claim only one student made', () => {
    const one = [{ participant: 'P1', grade: grade([claim('a lonely error', 'absent', 1)]) }]
    expect(classReport(one, SOURCE).shared).toEqual([])
  })

  it('never names an individual in the rolled-up output', () => {
    const text = classReportText(classReport(sessions, SOURCE))
    expect(text).not.toMatch(/\bP[123]\b/)
  })

  it('drops a topic whose passage no longer resolves, rather than quoting nothing', () => {
    // The reading was replaced after the examination, so passage 99 has no text behind it.
    const stale = [{ participant: 'P1', grade: grade([claim('something', 'supported', 99)]) }]
    expect(classReport(stale, SOURCE).topics).toEqual([])
  })

  it('handles a class where nobody said anything checkable', () => {
    const r = classReport([{ participant: 'P1', grade: null }], SOURCE)
    expect(r.students).toBe(0)
    expect(classReportText(r)).toMatch(/No examinations/)
  })
})
