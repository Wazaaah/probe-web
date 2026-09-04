import { Icon } from '../../components/Icon'
import { Avatar } from '../../components/ui'
import { REVIEWER } from '../../data/sample'
import type { Handoff, QuestionPath } from '../../data/types'

/**
 * The learner's home.
 *
 * There is exactly one thing to know here — whether an angle has come back yet — so the
 * screen is built around that single card and nothing competes with it.
 */
export function Library({
  handoff,
  path,
  online,
  onUpload,
  onBegin,
  onSeeResult,
}: {
  handoff: Handoff
  path: QuestionPath | null
  online: boolean
  onUpload: () => void
  onBegin: () => void
  onSeeResult: () => void
}) {
  const waiting = handoff.status === 'awaiting'
  const ready = handoff.status === 'sent' || handoff.status === 'rerun'
  const done = handoff.status === 'done'

  return (
    <div className="scroll pad">
      <div className="between" style={{ padding: '12px 0 4px' }}>
        <h1 className="screen-title">Your material</h1>
        <span className="chip">
          <span className={`dot${online ? '' : ' still'}`} />
          {online ? 'Paired' : 'Offline'}
        </span>
      </div>
      <p className="body dim" style={{ marginTop: 4 }}>
        {REVIEWER.name} chooses how you get questioned. You will not see the other angles.
      </p>

      <div className="card lifted stack gap-12" style={{ marginTop: 20 }}>
        <div className="row">
          <span className="tile lg">
            <Icon name="doc" size={22} />
          </span>
          <span className="grow stack gap-4">
            <span className="card-title truncate">{handoff.document}</span>
            <span className="meta dim">{handoff.paths ? 'You uploaded this' : 'Sample document'}</span>
          </span>
        </div>
        <div className="rule" />

        {waiting && (
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Avatar who={REVIEWER} />
            <span className="grow stack gap-4">
              <span className="body-med">Waiting on {REVIEWER.name.split(' ')[0]}</span>
              <span className="meta dim">
                {handoff.paths
                  ? 'Four angles are on their way to your reviewer. They pick one and it arrives here.'
                  : 'Your reviewer is choosing an angle. This screen updates the moment they send it.'}
              </span>
            </span>
            <span className="dot" style={{ color: 'var(--ink-600)', marginTop: 8 }} />
          </div>
        )}

        {ready && (
          <div className="stack gap-12">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <Avatar who={REVIEWER} unread />
              <span className="grow stack gap-4">
                <span className="body-med">
                  {handoff.status === 'rerun' ? 'Run it again' : `${REVIEWER.name.split(' ')[0]} sent you an angle`}
                </span>
                <span className="meta dim">
                  {handoff.status === 'rerun'
                    ? 'Your reviewer asked for another attempt at the same angle.'
                    : 'Answer out loud. Expect to be pushed where you are thin.'}
                </span>
              </span>
            </div>
            <div className="notice stack gap-6">
              <span className="micro-med dim">The angle</span>
              <span className="body-semi">{handoff.pathName || path?.name}</span>
              {path && (
                <span className="row gap-8 wrap" style={{ paddingTop: 2 }}>
                  <span className="chip outline">{path.difficulty}</span>
                  <span className="chip outline">
                    <Icon name="clock" size={12} /> {path.minutes} min
                  </span>
                  <span className="chip outline">{path.script.length} questions</span>
                </span>
              )}
            </div>
            <button className="btn" onClick={onBegin}>
              <Icon name="mic" size={19} color="var(--surface)" />
              Begin
            </button>
          </div>
        )}

        {handoff.status === 'live' && (
          <div className="stack gap-12">
            <p className="meta dim">You have a session open on this angle.</p>
            <button className="btn" onClick={onBegin}>
              <Icon name="play" size={19} color="var(--surface)" />
              Resume {handoff.pathName}
            </button>
          </div>
        )}

        {done && (
          <div className="stack gap-12">
            <div className="between">
              <span className="body-med">{handoff.pathName}</span>
              <span className="title">{handoff.score ?? 0}</span>
            </div>
            <p className="meta dim">Sent to {REVIEWER.name}. They can ask you to run it again.</p>
            <button className="btn quiet" onClick={onSeeResult}>
              See what you said
            </button>
          </div>
        )}
      </div>

      <button className="card dashed" style={{ marginTop: 16, alignItems: 'center' }} onClick={onUpload}>
        <span className="row gap-10">
          <Icon name="upload" size={20} color="var(--ink-700)" />
          <span className="body-med" style={{ color: 'var(--ink-800)' }}>
            Upload something else
          </span>
        </span>
        <span className="micro dimmer">PDF or plain text · read in this browser</span>
      </button>
      <div style={{ height: 12 }} />
    </div>
  )
}
