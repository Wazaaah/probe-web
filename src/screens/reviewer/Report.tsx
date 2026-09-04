import { Icon } from '../../components/Icon'
import { Avatar, Bars, ProbeMoment, Transcript, TopBar } from '../../components/ui'
import { LEARNER } from '../../data/sample'
import type { Handoff } from '../../data/types'

/**
 * What came back.
 *
 * The reviewer is deciding whether to put this person in front of a board, so the
 * transcript is not an appendix — it is the evidence, and it is on the same screen.
 */
export function Report({
  handoff,
  onBack,
  onRerun,
}: {
  handoff: Handoff
  onBack: () => void
  onRerun: () => void
}) {
  const result = handoff.result

  return (
    <div className="pane">
      <TopBar title="" onBack={onBack} rule={false} />
      <div className="scroll pad">
        <div className="row" style={{ paddingBottom: 16 }}>
          <Avatar who={LEARNER} size="mid" />
          <span className="grow stack gap-4">
            <span className="body-semi">{LEARNER.name}</span>
            <span className="meta dim truncate">{handoff.document}</span>
          </span>
        </div>

        <div className="stack gap-6" style={{ paddingBottom: 20 }}>
          <span className="micro-med dim">{handoff.pathName}</span>
          <h1 className="display">{handoff.score ?? 0}</h1>
          <p className="body" style={{ color: 'var(--ink-900)' }}>
            {result?.verdict ?? 'The session finished.'}
          </p>
        </div>

        {result ? (
          <div className="stack gap-20">
            <div className="row gap-8 wrap">
              <span className="chip">{result.transcript.length} questions</span>
              <span className="chip">
                <Icon name="fork" size={12} />
                {result.probes} pressed
              </span>
            </div>
            <Bars rows={result.bars} legend />
            {result.moment && (
              <ProbeMoment
                heading="Where they had to be pushed"
                caption={result.moment.concept || result.moment.question}
                quote={`“${result.moment.spoken.trim()}”`}
              />
            )}
            <Transcript answers={result.transcript} />
          </div>
        ) : (
          <div className="notice stack gap-6">
            <p className="body-med">Only the score came through</p>
            <p className="meta dim">
              The transcript arrives with the result. If this session was run before the two devices were paired, there
              is nothing to read.
            </p>
          </div>
        )}
        <div style={{ height: 16 }} />
      </div>

      <div className="dock">
        <button className="btn quiet" onClick={onRerun} disabled={handoff.status === 'rerun'}>
          <Icon name="refresh" size={18} />
          {handoff.status === 'rerun' ? 'Rerun asked for' : 'Ask for another go'}
        </button>
        <button className="btn" onClick={onBack}>
          Done
        </button>
      </div>
    </div>
  )
}
