import { useState } from 'react'
import { classReport } from '../../lib/report'
import { loadExams, readingsByWeek } from '../../lib/roster'

/**
 * Patterns across everyone who has sat this reading's exam — never who, only what.
 * Grouped by reading rather than shown all at once, since a class report that mixes
 * week 3's questions with week 9's answers a lecturer nothing they can act on.
 */
export function ClassReport() {
  const readings = readingsByWeek()
  const [readingId, setReadingId] = useState(readings[0]?.id ?? '')
  const reading = readings.find((r) => r.id === readingId) ?? null

  const exams = reading ? loadExams().filter((e) => e.readingId === reading.id) : []
  const report = reading ? classReport(exams.map((e) => ({ participant: e.student.indexNumber, grade: e.grade })), reading.docs) : null

  return (
    <div className="pa-stack pa-gap-20">
      <div className="pa-stack pa-gap-6">
        <h1 className="pa-h1">Class report</h1>
        <p className="pa-lede">
          Grouped by which part of the reading each claim was checked against, so the
          topics come out of the exchanges themselves. Nobody is named.
        </p>
      </div>

      {readings.length === 0 ? (
        <div className="pa-empty">No readings yet.</div>
      ) : (
        <select className="pa-field" value={readingId} onChange={(e) => setReadingId(e.target.value)} style={{ maxWidth: 320 }}>
          {readings.map((r) => (
            <option key={r.id} value={r.id}>{r.week}</option>
          ))}
        </select>
      )}

      {report && !report.students && <div className="pa-empty">Nothing checkable has been said about this reading yet.</div>}

      {report && report.students > 0 && (
        <div className="pa-stack pa-gap-14">
          <p className="pa-meta">Across {report.students} student{report.students === 1 ? '' : 's'}.</p>

          {report.shared.length > 0 && (
            <div className="pa-card pa-stack pa-gap-8">
              <span className="pa-h3">Believed by more than one, and not in the reading</span>
              {report.shared.slice(0, 4).map((claim) => (
                <span key={claim.text} className="pa-meta">
                  <strong>{claim.students} of {report.students}</strong> — {claim.text}
                </span>
              ))}
              <span className="pa-micro">The same wrong idea in several heads usually comes from the teaching rather than the reading.</span>
            </div>
          )}

          <div className="pa-card pa-stack pa-gap-10">
            <span className="pa-h3">Thinnest parts of the reading</span>
            {report.topics.slice(0, 6).map((topic) => (
              <div key={topic.excerpt} className="pa-stack pa-gap-4">
                <span className="pa-meta">
                  <strong>{topic.held} of {report.students}</strong> held it
                  {topic.missed > 0 && ` · ${topic.missed} tried and missed`}
                  {topic.silent > 0 && ` · ${topic.silent} never went near it`}
                  {' — '}{topic.docName}
                </span>
                <span className="pa-micro">"{topic.excerpt}…"</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
