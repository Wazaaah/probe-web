import { Icon } from '../../components/Icon'
import { loadExams, readingsByWeek, roster } from '../../lib/roster'
import type { Screen } from './ProbeApp'

/** The overview — what's current, what's recently happened, and the quickest way into
 *  the one action that matters most: sitting the next student down. */
export function Home({ go }: { go: (screen: Screen) => void }) {
  const readings = readingsByWeek()
  const current = readings[0] ?? null
  const students = roster()
  const exams = loadExams()
  const recent = [...exams].sort((a, b) => b.startedAt - a.startedAt).slice(0, 5)

  return (
    <div className="pa-stack pa-gap-24">
      <div className="pa-stack pa-gap-6">
        <h1 className="pa-h1">Probe</h1>
        <p className="pa-lede">
          {current ? `This week: ${current.week}.` : 'No reading uploaded yet.'}
        </p>
      </div>

      <div className="pa-grid">
        <button className="pa-card pa-row" style={{ cursor: 'pointer' }} onClick={() => go('run')}>
          <span className="pa-icon-chip"><Icon name="mic" size={17} /></span>
          <span className="pa-grow pa-stack pa-gap-4" style={{ alignItems: 'flex-start' }}>
            <span className="pa-h3">Run an exam</span>
            <span className="pa-meta">Sit a student down now</span>
          </span>
        </button>
        <button className="pa-card pa-row" style={{ cursor: 'pointer' }} onClick={() => go('readings')}>
          <span className="pa-icon-chip"><Icon name="book" size={17} /></span>
          <span className="pa-grow pa-stack pa-gap-4" style={{ alignItems: 'flex-start' }}>
            <span className="pa-h3">{readings.length} reading{readings.length === 1 ? '' : 's'}</span>
            <span className="pa-meta">Across the course so far</span>
          </span>
        </button>
        <button className="pa-card pa-row" style={{ cursor: 'pointer' }} onClick={() => go('students')}>
          <span className="pa-icon-chip"><Icon name="people" size={17} /></span>
          <span className="pa-grow pa-stack pa-gap-4" style={{ alignItems: 'flex-start' }}>
            <span className="pa-h3">{students.length} student{students.length === 1 ? '' : 's'}</span>
            <span className="pa-meta">Examined so far</span>
          </span>
        </button>
      </div>

      <div className="pa-stack pa-gap-10">
        <span className="pa-h3">Recent</span>
        {recent.length === 0 ? (
          <div className="pa-empty">Nothing yet. Run the first exam to see it here.</div>
        ) : (
          <div className="pa-card pa-list">
            {recent.map((exam) => (
              <div key={exam.id} className="pa-list-row">
                <span className="pa-avatar">{exam.student.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}</span>
                <span className="pa-grow pa-stack pa-gap-4" style={{ alignItems: 'flex-start' }}>
                  <span className="pa-body" style={{ fontWeight: 600 }}>{exam.student.name}</span>
                  <span className="pa-micro">{exam.student.indexNumber}</span>
                </span>
                <span className="pa-meta">{new Date(exam.startedAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
