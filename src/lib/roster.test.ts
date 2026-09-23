import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadExams, loadReadings, roster, saveExam, saveReading, type ExamRecord, type Reading } from './roster'

/** A minimal in-memory Storage, since Node has no real localStorage for these to hit. */
function memoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  } as Storage
}

const reading = (id: string, week: string): Reading => ({
  id,
  week,
  uploadedAt: Date.now(),
  docs: [{ name: `${week}.pdf`, text: 'a reading' }],
  index: null,
})

const exam = (indexNumber: string, name: string, over: Partial<ExamRecord> = {}): ExamRecord => ({
  id: `${indexNumber}-${Date.now()}-${Math.random()}`,
  readingId: 'r1',
  student: { indexNumber, name },
  submittedAs: `${indexNumber}_${name.replace(' ', '_')}.docx`,
  work: 'their passage',
  startedAt: Date.now(),
  endedAt: Date.now() + 1000,
  answers: [],
  score: 80,
  grade: null,
  ...over,
})

describe('roster', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))
  afterEach(() => vi.unstubAllGlobals())

  it('keeps readings uploaded on different weeks, never overwriting', () => {
    saveReading(reading('w1', 'Week 1'))
    saveReading(reading('w2', 'Week 2'))
    expect(loadReadings().map((r) => r.week)).toEqual(['Week 1', 'Week 2'])
  })

  it('builds the roster from exam records, not a separate table', () => {
    saveExam(exam('68742026', 'McNobert Amoah'))
    saveExam(exam('68741111', 'Ama Owusu'))
    const entries = roster()
    expect(entries.map((e) => e.student.name)).toEqual(['Ama Owusu', 'McNobert Amoah'])
  })

  it('groups a student’s several exams together under one roster entry', () => {
    saveExam(exam('68742026', 'McNobert Amoah', { readingId: 'w1', score: 60, startedAt: 1000 }))
    saveExam(exam('68742026', 'McNobert Amoah', { readingId: 'w2', score: 90, startedAt: 2000 }))
    const entries = roster()
    expect(entries).toHaveLength(1)
    expect(entries[0].exams).toHaveLength(2)
    // Most recent first, and the roster's headline score follows it.
    expect(entries[0].latestScore).toBe(90)
  })

  it('starts empty rather than throwing on a fresh device', () => {
    expect(loadExams()).toEqual([])
    expect(roster()).toEqual([])
  })
})
