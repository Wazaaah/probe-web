import { Icon } from '../../components/Icon'
import { TopBar } from '../../components/ui'
import { REVIEWER } from '../../data/sample'

const POINTS = [
  {
    icon: 'mic' as const,
    title: 'Your microphone opens after each question',
    detail: 'A red Recording marker is on screen whenever it is listening. Mute closes it at any point.',
  },
  {
    icon: 'wave' as const,
    title: 'Speech is transcribed, not recorded',
    detail: 'Your browser turns what you say into text. No audio file is written, kept or uploaded.',
  },
  {
    icon: 'doc' as const,
    title: 'The text of your answers is judged',
    detail: 'Each answer goes to the model you configured so it can decide what to ask next. Nothing else does.',
  },
  {
    icon: 'people' as const,
    title: `${REVIEWER.name} sees the transcript`,
    detail: 'The point of a session is that someone reads it. Your reviewer gets the questions, your answers and a score.',
  },
]

/** Asked once, before the microphone is ever opened. */
export function Consent({ onAgree, onBack }: { onAgree: () => void; onBack: () => void }) {
  return (
    <div className="pane">
      <TopBar title="" onBack={onBack} rule={false} />
      <div className="scroll pad">
        <h1 className="title" style={{ padding: '4px 0 8px' }}>
          Before you start
        </h1>
        <p className="body dim">This is a spoken examination. Here is exactly what happens to what you say.</p>

        <div className="stack gap-16" style={{ marginTop: 24 }}>
          {POINTS.map((point) => (
            <div className="row" style={{ alignItems: 'flex-start' }} key={point.title}>
              <span className="tile">
                <Icon name={point.icon} size={19} />
              </span>
              <span className="grow stack gap-4">
                <span className="body-med">{point.title}</span>
                <span className="meta dim">{point.detail}</span>
              </span>
            </div>
          ))}
        </div>
        <div style={{ height: 24 }} />
      </div>

      <div className="dock" style={{ flexDirection: 'column' }}>
        <button className="btn" onClick={onAgree}>
          <Icon name="check" size={19} color="var(--surface)" />
          I understand — start
        </button>
        <button className="btn ghost" onClick={onBack}>
          Not now
        </button>
      </div>
    </div>
  )
}
