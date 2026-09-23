import { Icon } from '../../components/Icon'
import { boundaryLine, boundaryOf, studentReportText } from '../../lib/report'
import { downloadReport, examsFor, readingFor } from '../../lib/roster'

/**
 * One student's whole record — every exam they've sat, each against whichever reading it
 * was for. This is the page a lecturer downloads from before handing anything to a
 * student; the student never sees this page themselves.
 */
export function StudentRecord({ indexNumber, onBack }: { indexNumber: string; onBack: () => void }) {
  const exams = examsFor(indexNumber)
  const name = exams[0]?.student.name ?? indexNumber

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
            <div key={exam.id} className="pa-card pa-stack pa-gap-10">
              <div className="pa-between">
                <span className="pa-h3">{week}</span>
                <span className="pa-meta">{new Date(exam.startedAt).toLocaleDateString()}</span>
              </div>
              <span className="pa-body" style={{ fontWeight: 600 }}>{boundaryLine(boundary)}</span>
              {boundary.held.length > 0 && <span className="pa-meta">Held: {boundary.held.slice(0, 4).join(' · ')}</span>}
              {boundary.unsupported.length > 0 && <span className="pa-meta">Not borne out: {boundary.unsupported.slice(0, 4).join(' · ')}</span>}
              {boundary.wrong.length > 0 && <span className="pa-meta">Contradicted: {boundary.wrong.slice(0, 4).join(' · ')}</span>}
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
