import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { TopBar } from '../../components/ui'
import { LEARNER } from '../../data/sample'
import type { QuestionPath } from '../../data/types'

/**
 * The question tree, opened over the chooser.
 *
 * The reviewer is deciding how hard to push someone, so they get to see every question
 * and every follow-up held in reserve before they send it.
 */
function Tree({ path, onClose }: { path: QuestionPath; onClose: () => void }) {
  // On a desktop this is a dialog, and a dialog closes on Escape.
  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [onClose])

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <span className="grab" />
        <div className="between sheet-head">
          <span className="stack gap-4">
            <span className="card-title">{path.name}</span>
            <span className="micro dim">
              {path.script.length} questions · {path.script.reduce((n, q) => n + q.probes.length, 0)} follow-ups in
              reserve
            </span>
          </span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" size={20} color="var(--ink-700)" />
          </button>
        </div>
        <div className="rule" />

        <div className="scroll pad">
          <div className="stack gap-16" style={{ paddingTop: 12 }}>
            {path.script.map((node, index) => (
              <div className="node-row" key={index}>
                <span className="spine">
                  <span className="num">{index + 1}</span>
                  {index < path.script.length - 1 && <span className="thread" />}
                </span>
                <span className="grow stack gap-10" style={{ paddingBottom: 6 }}>
                  <span className="stack gap-4">
                    <span className="micro-med dimmer">{node.concept}</span>
                    <span className="body-med">{node.question}</span>
                  </span>

                  {node.expects.length > 0 && (
                    <span className="row gap-6 wrap">
                      {node.expects.map((term) => (
                        <span className="chip outline" key={term}>
                          {term}
                        </span>
                      ))}
                    </span>
                  )}

                  {node.probes.map((probe, i) => (
                    <span className="probe stack gap-6" key={i}>
                      <span className="micro-med dimmer">{probe.condition}</span>
                      <span className="probe-body">
                        <Icon name="fork" size={14} color="var(--ink-800)" />
                        <span className="meta" style={{ color: 'var(--ink-900)' }}>
                          {probe.followUp}
                        </span>
                      </span>
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
          <div style={{ height: 16 }} />
        </div>
      </div>
    </div>
  )
}

/** Four kinds of pressure, one of which is about to be sent to a real person. */
export function Paths({
  paths,
  chosen,
  onBack,
  onSend,
}: {
  paths: QuestionPath[]
  chosen: number
  onBack: () => void
  onSend: (index: number) => void
}) {
  const [picked, setPicked] = useState(Math.min(Math.max(chosen, 0), paths.length - 1))
  const [preview, setPreview] = useState<QuestionPath | null>(null)

  return (
    <div className="pane">
      <TopBar title="Choose an angle" onBack={onBack} />
      <div className="scroll pad">
        <p className="body dim" style={{ padding: '4px 0 16px' }}>
          Four ways of attacking the same document. {LEARNER.name.split(' ')[0]} sees only the one you send.
        </p>

        <div className="stack gap-12 grid">
          {paths.map((path, index) => {
            const on = picked === index
            return (
              <div className={`card${on ? ' chosen-accent lifted' : ''}`} key={`${path.name}-${index}`}>
                <button
                  className="row"
                  style={{ alignItems: 'flex-start', width: '100%', textAlign: 'left' }}
                  onClick={() => setPicked(index)}
                  aria-pressed={on}
                >
                  <span className="grow stack gap-6">
                    <span className="card-title">{path.name}</span>
                    <span className="meta dim">{path.description}</span>
                  </span>
                  <span className={`radio${on ? ' accent' : ''}`} style={{ marginTop: 4 }}>
                    {on && <span />}
                  </span>
                </button>

                <div className="row gap-8 wrap">
                  <span className="chip">{path.difficulty}</span>
                  <span className="chip">
                    <Icon name="clock" size={12} /> {path.minutes} min
                  </span>
                  <span className="chip">
                    <Icon name="fork" size={12} /> {path.script.reduce((n, q) => n + q.probes.length, 0)} follow-ups
                  </span>
                </div>

                <div className="notice stack gap-4">
                  <span className="micro-med dim">Opens with</span>
                  <span className="meta" style={{ color: 'var(--ink-900)' }}>
                    {path.opener}
                  </span>
                </div>

                <button className="btn quiet small" onClick={() => setPreview(path)}>
                  See all {path.script.length} questions
                </button>
              </div>
            )
          })}
        </div>
        <div style={{ height: 16 }} />
      </div>

      <div className="dock">
        <button className="btn" onClick={() => onSend(picked)}>
          <Icon name="check" size={19} color="var(--surface)" />
          Send to {LEARNER.name.split(' ')[0]}
        </button>
      </div>

      {preview && <Tree path={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}
