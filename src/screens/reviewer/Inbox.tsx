import { Icon } from '../../components/Icon'
import { Avatar } from '../../components/ui'
import { LEARNER } from '../../data/sample'
import type { Handoff } from '../../data/types'

const STATE: Record<Handoff['status'], { chip: string; live: boolean }> = {
  awaiting: { chip: 'Needs an angle', live: false },
  sent: { chip: 'Sent', live: false },
  live: { chip: 'In session', live: true },
  done: { chip: 'Result in', live: false },
  rerun: { chip: 'Rerun asked', live: false },
}

/**
 * The reviewer's queue.
 *
 * One person, one document, one decision — the reviewer's whole job in this prototype is
 * choosing how hard someone gets pushed, so nothing else is on this screen.
 */
export function Inbox({
  handoff,
  online,
  onChoose,
  onRead,
  onNudge,
}: {
  handoff: Handoff
  online: boolean
  onChoose: () => void
  onRead: () => void
  onNudge: () => void
}) {
  const state = STATE[handoff.status]

  return (
    <div className="scroll pad">
      <div className="between" style={{ padding: '12px 0 4px' }}>
        <h1 className="screen-title">Inbox</h1>
        <span className="chip">
          <span className={`dot${online ? '' : ' still'}`} />
          {online ? 'Paired' : 'Offline'}
        </span>
      </div>
      <p className="body dim" style={{ marginTop: 4 }}>
        Pick the angle. They never see the other three.
      </p>

      <div className="card lifted stack gap-12" style={{ marginTop: 20 }}>
        <div className="row">
          <Avatar who={LEARNER} size="mid" unread={handoff.status === 'awaiting' || handoff.status === 'done'} />
          <span className="grow stack gap-4">
            <span className="card-title">{LEARNER.name}</span>
            <span className="meta dim truncate">{handoff.document}</span>
          </span>
          <span className="chip">
            {state.live && <span className="dot" />}
            {state.chip}
          </span>
        </div>
        <div className="rule" />

        {handoff.status === 'awaiting' && (
          <div className="stack gap-12">
            <p className="meta dim">
              {handoff.paths
                ? `Probe read it and wrote ${handoff.paths.length} ways of attacking it.`
                : 'Four standing angles are ready for this document.'}
            </p>
            <button className="btn" onClick={onChoose}>
              <Icon name="fork" size={19} color="var(--surface)" />
              Choose an angle
            </button>
          </div>
        )}

        {handoff.status === 'sent' && (
          <div className="stack gap-12">
            <div className="notice stack gap-6">
              <span className="micro-med dim">You sent</span>
              <span className="body-semi">{handoff.pathName}</span>
            </div>
            <p className="meta dim">
              {handoff.nudged
                ? 'Nudged. It is on their home screen and their phone buzzed.'
                : `Waiting for ${LEARNER.name.split(' ')[0]} to start.`}
            </p>
            <div className="row gap-10">
              <button className="btn quiet" onClick={onNudge} disabled={handoff.nudged}>
                <Icon name="bell" size={18} />
                {handoff.nudged ? 'Nudged' : 'Nudge'}
              </button>
              <button className="btn quiet" onClick={onChoose}>
                Change angle
              </button>
            </div>
          </div>
        )}

        {handoff.status === 'live' && (
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <span className="tile">
              <Icon name="wave" size={19} />
            </span>
            <span className="grow stack gap-4">
              <span className="body-med">{handoff.pathName}</span>
              <span className="meta dim">
                {LEARNER.name.split(' ')[0]} is answering now. The result lands here when it ends.
              </span>
            </span>
          </div>
        )}

        {(handoff.status === 'done' || handoff.status === 'rerun') && (
          <div className="stack gap-12">
            <div className="between">
              <span className="stack gap-4">
                <span className="body-med">{handoff.pathName}</span>
                <span className="meta dim">
                  {handoff.result
                    ? `${handoff.result.transcript.length} questions · ${handoff.result.probes} pressed`
                    : 'Result received'}
                </span>
              </span>
              <span className="display" style={{ fontSize: 32, lineHeight: '40px' }}>
                {handoff.score ?? 0}
              </span>
            </div>
            <button className="btn" onClick={onRead}>
              Read the session
            </button>
          </div>
        )}
      </div>

      <p className="micro dimmer" style={{ marginTop: 16, textAlign: 'center' }}>
        This inbox is live. Anything the other device does shows up here without a refresh.
      </p>
    </div>
  )
}
