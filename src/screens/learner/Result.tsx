import { Icon } from '../../components/Icon'
import { Bars, ProbeMoment, Transcript, TopBar } from '../../components/ui'
import { REVIEWER } from '../../data/sample'
import type { SessionResult } from '../../data/types'

/**
 * What the learner is shown when it is over.
 *
 * The score is deliberately second to the verdict: a number is not the point, and the
 * places they had to be pressed are what they should take away.
 */
export function Result({
  result,
  pathName,
  sending,
  onDone,
}: {
  result: SessionResult
  pathName: string
  sending: boolean
  onDone: () => void
}) {
  return (
    <div className="pane">
      <TopBar title="" rule={false} />
      <div className="scroll pad">
        <div className="stack gap-6" style={{ padding: '4px 0 20px' }}>
          <span className="micro-med dim">{pathName}</span>
          <h1 className="display">{result.score}</h1>
          <p className="body" style={{ color: 'var(--ink-900)' }}>
            {result.verdict}
          </p>
        </div>

        <div className="row gap-8 wrap" style={{ paddingBottom: 20 }}>
          <span className="chip">{result.transcript.length} questions</span>
          <span className="chip">
            <Icon name="fork" size={12} />
            {result.probes} pressed
          </span>
          <span className="chip">
            {sending ? (
              <>
                <span className="dot" /> Sending to {REVIEWER.name.split(' ')[0]}
              </>
            ) : (
              <>
                <Icon name="check" size={12} /> {REVIEWER.name.split(' ')[0]} has it
              </>
            )}
          </span>
        </div>

        <div className="stack gap-20">
          <Bars rows={result.bars} legend />
          {result.moment && (
            <ProbeMoment
              heading="Where you were pushed"
              caption={result.moment.concept || result.moment.question}
              quote={`“${result.moment.spoken.trim()}”`}
            />
          )}
          <Transcript answers={result.transcript} />
        </div>
        <div style={{ height: 16 }} />
      </div>

      <div className="dock">
        <button className="btn" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  )
}
