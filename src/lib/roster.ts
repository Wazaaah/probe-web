/**
 * Where the real app keeps readings, students and exam records — for now.
 *
 * There is no backend yet: everything here lives in this browser's `localStorage`, the
 * same way the trial does. Once Supabase is wired in, the storage underneath these
 * functions changes; the functions themselves — and everything that calls them — should
 * not have to. Treat every `load`/`save` here as a placeholder for a network call, not as
 * the architecture.
 *
 * This is deliberately separate from `trial.ts`: the trial records self-report fields and
 * lexical signals nobody outside a research trial needs, and its data must never mix with
 * a real student's record.
 */

import type { Answer } from '../data/types'
import type { Grade, SourceDoc } from './claims'
import type { DocIndex } from './documents'
import type { Student } from './student'

/* -- readings, uploaded on a recurring cadence, never archived ------------ */

export interface Reading {
  id: string
  /** Free text — "Week 4", a date, whatever the lecturer calls it. Never inferred: the
   *  student's submission carries no signal of which week it answers, so this label is
   *  the only thing that lets a lecturer pick the right reading later. */
  week: string
  uploadedAt: number
  docs: SourceDoc[]
  index: DocIndex | null
}

const READINGS_KEY = 'probe.admin.readings'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked: it still works for this tab's lifetime */
  }
}

export const loadReadings = (): Reading[] => readJson(READINGS_KEY, [])

/** Newest week first — the one a lecturer is about to use is the one they see first. */
export const readingsByWeek = (): Reading[] =>
  [...loadReadings()].sort((a, b) => b.uploadedAt - a.uploadedAt)

export function saveReading(reading: Reading): void {
  writeJson(READINGS_KEY, [...loadReadings(), reading])
}

/** Corrects a mistaken upload. Not how a week is retired — readings are never archived. */
export function removeReading(id: string): void {
  writeJson(
    READINGS_KEY,
    loadReadings().filter((r) => r.id !== id),
  )
}

export function rememberReadingIndex(id: string, index: DocIndex): void {
  writeJson(
    READINGS_KEY,
    loadReadings().map((r) => (r.id === id ? { ...r, index } : r)),
  )
}

/* -- exam records, one per student per reading ----------------------------- */

export interface ExamRecord {
  id: string
  readingId: string
  student: Student
  /** The filename the submission arrived as, kept for when a name has to be checked by eye. */
  submittedAs: string
  work: string
  startedAt: number
  endedAt: number
  answers: Answer[]
  score: number | null
  grade: Grade | null
}

const EXAMS_KEY = 'probe.admin.exams'

export const loadExams = (): ExamRecord[] => readJson(EXAMS_KEY, [])

export function saveExam(record: ExamRecord): void {
  writeJson(EXAMS_KEY, [...loadExams(), record])
}

/** Re-grades an existing record in place — for when the checker call failed and the
 *  transcript is still there to check again, without re-running the exam itself. */
export function updateExamGrade(id: string, grade: Grade, score: number | null): void {
  writeJson(
    EXAMS_KEY,
    loadExams().map((e) => (e.id === id ? { ...e, grade, score } : e)),
  )
}

export const examsFor = (indexNumber: string): ExamRecord[] =>
  loadExams()
    .filter((e) => e.student.indexNumber === indexNumber)
    .sort((a, b) => b.startedAt - a.startedAt)

export const readingFor = (readingId: string): Reading | null =>
  loadReadings().find((r) => r.id === readingId) ?? null

/**
 * The student roster, derived from exam records rather than kept as its own table — one
 * source of truth. A student exists here because they have at least one exam, never
 * because someone typed their name in ahead of time.
 */
export interface RosterEntry {
  student: Student
  exams: ExamRecord[]
  latestScore: number | null
}

/** Hands a report to the lecturer as a file — the only place this data goes. Distributing
 *  it from there (Canvas, email, in person) is the lecturer's call, not this app's. */
export function downloadReport(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function roster(): RosterEntry[] {
  const byStudent = new Map<string, ExamRecord[]>()
  for (const exam of loadExams()) {
    const list = byStudent.get(exam.student.indexNumber) ?? []
    list.push(exam)
    byStudent.set(exam.student.indexNumber, list)
  }
  return [...byStudent.entries()]
    .map(([, exams]) => {
      const sorted = [...exams].sort((a, b) => b.startedAt - a.startedAt)
      return { student: sorted[0].student, exams: sorted, latestScore: sorted[0].score }
    })
    .sort((a, b) => a.student.name.localeCompare(b.student.name))
}
