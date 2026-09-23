import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { boundaryLine, boundaryOf } from '../../lib/report'
import { roster } from '../../lib/roster'

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

/** Every student who has sat an exam, derived from the exam records themselves — nobody
 *  is on this list because someone typed their name in ahead of time. */
export function Students({ onOpen }: { onOpen: (indexNumber: string) => void }) {
  const [q, setQ] = useState('')
  const entries = roster().filter(
    (e) => !q.trim() || e.student.name.toLowerCase().includes(q.toLowerCase()) || e.student.indexNumber.includes(q),
  )

  return (
    <div className="pa-stack pa-gap-20">
      <div className="pa-stack pa-gap-6">
        <h1 className="pa-h1">Students</h1>
        <p className="pa-lede">Everyone examined so far, across every reading.</p>
      </div>

      <input className="pa-field" placeholder="Search by name or index number" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 340 }} />

      {entries.length === 0 ? (
        <div className="pa-empty">{q ? 'No one matches that search.' : 'No exams recorded yet.'}</div>
      ) : (
        <div className="pa-card pa-list">
          {entries.map(({ student, exams }) => {
            const boundary = boundaryOf(exams[0].grade)
            return (
              <button key={student.indexNumber} className="pa-list-row link" style={{ width: '100%', cursor: 'pointer' }} onClick={() => onOpen(student.indexNumber)}>
                <span className="pa-avatar">{initials(student.name)}</span>
                <span className="pa-grow pa-stack pa-gap-4" style={{ alignItems: 'flex-start' }}>
                  <span className="pa-body" style={{ fontWeight: 600 }}>{student.name}</span>
                  <span className="pa-micro">
                    {student.indexNumber} · {exams.length} exam{exams.length === 1 ? '' : 's'}
                    {!boundary.checkFailed && ` · ${boundaryLine(boundary)}`}
                  </span>
                </span>
                {boundary.checkFailed && <span className="pa-chip bad">Check failed</span>}
                <Icon name="chev" size={16} color="var(--pa-ink-faint)" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
