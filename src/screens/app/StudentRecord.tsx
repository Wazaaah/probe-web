import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { boundaryLine, boundaryOf, studentReportText } from '../../lib/report'
import { downloadReport, examsFor, readingFor, updateExamGrade } from '../../lib/roster'
import type { ProbeStore } from '../../lib/store'

/**
 * One student's whole record — every exam they've sat, each against whichever reading it
 * was for. This is the page a lecturer downloads from before handing anything to a
 * student; the student never sees this page themselves.
 */
export function StudentRecord({ store, indexNumber, onBack }: { store: ProbeStore; indexNumber: string; onBack: () => void }) {
  const [exams, setExams] = useState(() => examsFor(indexNumber))
  const [regradingId, setRegradingId] = useState<string | null>(null)
  const name = exams[0]?.student.name ?? indexNumber

  const retryGrade = async (examId: string) => {
    const target = exams.find((e) => e.id === examId)
    const reading = target ? readingFor(target.readingId) : null
    if (!target || !reading || !store.brain) return
    setRegradingId(examId)
    const grade = await store.brain.grade(target.answers, reading.docs, target.work).catch(() => null)
    const next = grade ?? target.grade
    const score = grade && !grade.checkFailed ? grade.score : target.score
    if (next) updateExamGrade(examId, next, score)
    setExams(examsFor(indexNumber))
    setRegradingId(null)
  }

  return (
    <div className="pa-stack pa-gap-20">
      <button className="pa-btn ghost" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        <Icon name="back" size={16} color="var(--pa-accent)" /> Students
      </button>

      <div className="pa-stack pa-gap-6">
        <h1 className="pa-h1">{name}</h1>
        <p className="pa-lede">{indexNumber} · {exams.length} exam{exams.length === 1 ? '' : 's'}</p>
      </div>

      <div className="pa-stack pa-gap-14">
        {exams.map((exam) => {
          const reading = readingFor(exam.readingId)
          const boundary = boundaryOf(exam.grade)
          const week = reading?.week ?? 'Reading no longer listed'
          return (
            <div key={exam.id} className="pa-card pa-stack pa-gap-10" style={boundary.checkFailed ? { borderColor: 'var(--pa-bad)' } : undefined}>
              <div className="pa-between">
                <span className="pa-h3">{week}</span>
                <span className="pa-meta">{new Date(exam.startedAt).toLocaleDateString()}</span>
              </div>
              <span className="pa-body" style={{ fontWeight: 600, color: boundary.checkFailed ? 'var(--pa-bad)' : undefined }}>
                {boundaryLine(boundary)}
              </span>
              {boundary.held.length > 0 && <span className="pa-meta">Held: {boundary.held.slice(0, 4).join(' · ')}</span>}
              {boundary.unsupported.length > 0 && <span className="pa-meta">Not borne out: {boundary.unsupported.slice(0, 4).join(' · ')}</span>}
              {boundary.wrong.length > 0 && <span className="pa-meta">Contradicted: {boundary.wrong.slice(0, 4).join(' · ')}</span>}
              {boundary.checkFailed ? (
                <button
                  className="pa-btn"
                  style={{ alignSelf: 'flex-start' }}
                  disabled={regradingId === exam.id}
                  onClick={() => void retryGrade(exam.id)}
                >
                  {regradingId === exam.id ? 'Re-grading…' : 'Retry grading'}
                </button>
              ) : (
                <button
                  className="pa-btn quiet"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() =>
                    downloadReport(
                      `${exam.student.indexNumber}-${exam.student.name.replace(/\s+/g, '-')}-${week.replace(/\s+/g, '-')}.txt`,
                      studentReportText(exam.student.name, exam.student.indexNumber, week, boundary),
                    )
                  }
                >
                  Download this report
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
