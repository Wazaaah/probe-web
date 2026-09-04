import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { groupRuns } from '../../lib/runs'

/**
 * Sessions, grouped by the document they came from.
 *
 * One upload gets examined from several angles over time, so the document is the unit
 * that means something — a run on its own says very little.
 */
export function History() {
  const groups = useMemo(groupRuns, [])
  const [open, setOpen] = useState<string | null>(groups[0]?.document ?? null)

  return (
    <div className="scroll pad">
      <h1 className="screen-title" style={{ padding: '12px 0 4px' }}>
        Sessions
      </h1>
      <p className="body dim" style={{ marginBottom: 20 }}>
        Everything you have been questioned on, kept with the document it came from.
      </p>

      <div className="stack gap-10">
        {groups.map((group) => {
          const on = open === group.document
          const average = Math.round(group.runs.reduce((sum, r) => sum + r.score, 0) / group.runs.length)
          return (
            <div className="card flat" key={group.document}>
              <button
                className="row"
                style={{ padding: 14, width: '100%', textAlign: 'left' }}
                onClick={() => setOpen(on ? null : group.document)}
                aria-expanded={on}
              >
                <span className="tile">
                  <Icon name="doc" size={19} />
                </span>
                <span className="grow stack gap-4">
                  <span className="body-med truncate">{group.document}</span>
                  <span className="meta dim">
                    {group.runs.length} session{group.runs.length === 1 ? '' : 's'} · avg {average}
                  </span>
                </span>
                <span style={{ transform: on ? 'rotate(90deg)' : 'none', transition: 'transform .2s var(--ease)' }}>
                  <Icon name="chev" size={16} color="var(--ink-600)" />
                </span>
              </button>

              {on && (
                <div className="stack" style={{ padding: '0 14px 6px' }}>
                  <div className="rule" />
                  {group.runs.map((run, index) => (
                    <div className="stack" key={`${run.title}-${index}`}>
                      <div className="row" style={{ padding: '12px 0' }}>
                        <span className="grow stack gap-4">
                          <span className="body-med">{run.title}</span>
                          <span className="micro dim">{run.meta}</span>
                        </span>
                        <span className="body-semi">{run.score}</span>
                      </div>
                      {index < group.runs.length - 1 && <div className="rule" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ height: 12 }} />
    </div>
  )
}
