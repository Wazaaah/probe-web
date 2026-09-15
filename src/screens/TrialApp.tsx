import { useMemo, useRef, useState } from 'react'
import { BrainSetup } from './BrainSetup'
import { Session } from './Session'
import { Trial } from './Trial'
import { Review } from './Review'
import { Upload } from './learner/Upload'
import { TopBar } from '../components/ui'
import { Icon } from '../components/Icon'
import { recorder } from '../lib/trial'
import type { Examiner } from '../lib/examiner'
import type { ProbeStore } from '../lib/store'
import type { QuestionPath } from '../data/types'

/**
 * Probe with everything that is not this experiment taken out.
 *
 * The shipped app opens on a choice between two roles, because the product is one person
 * examining another's work. None of that applies to an afternoon spent finding out
 * whether the judging works: there is one machine, one reading, and five people taking
 * turns at it. A role chooser, an inbox, a pairing code and a library are all things a
 * participant would have to be walked past before answering a single question, and each
 * one is a chance for the session to start badly.
 *
 * So this build boots into the only sequence that matters — set the key, load the
 * reading, pick the angle once, then run people through it — and keeps the participant's
 * view down to the examination itself.
 *
 * The angle is chosen once, by the organiser, and then fixed. Five transcripts are only
 * comparable if they came from the same questions, and letting each participant pick
 * would quietly destroy the thing being measured.
 */

type Stage = 'brain' | 'reading' | 'angle' | 'console' | 'session' | 'recorded' | 'review'

/**
 * Whether the examiner has been set up at least once.
 *
 * Not the same question as "is there a model configured": the in-page option is a
 * legitimate choice and leaves `store.brain` null, so booting on that would trap anyone
 * who picked it on the setup screen forever, reload after reload.
 */
const READY = 'probe.trial.ready'

const settled = (): boolean => {
  try {
    return localStorage.getItem(READY) === 'yes'
  } catch {
    return false
  }
}

const settle = (): void => {
  try {
    localStorage.setItem(READY, 'yes')
  } catch {
    /* private browsing: setup is asked for again next reload, which is survivable */
  }
}

export function TrialApp({ store }: { store: ProbeStore }) {
  const paths = store.handoff.paths
  const [stage, setStage] = useState<Stage>(() => {
    if (!settled()) return 'brain'
    if (!paths?.length) return 'reading'
    return 'console'
  })
  const [angle, setAngle] = useState(0)
  const startedAt = useRef(Date.now())

  const path: QuestionPath | null = useMemo(
    () => (paths?.length ? paths[Math.min(angle, paths.length - 1)] : null),
    [paths, angle],
  )

  /**
   * The score is computed and kept, but the participant is not shown it.
   *
   * It comes from the judge this whole exercise exists to test, and we already know it
   * ranks a confident bluffer above an honest hesitant student. Showing someone a mark
   * from it would be unfair to them and would contaminate the next thing they say.
   */
  const finish = async (examiner: Examiner) => {
    const local = examiner.score()
    setStage('recorded')
    const summary = path && store.brain ? await store.brain.summarise(path, examiner.answers).catch(() => null) : null
    recorder.finish(examiner.answers, summary?.score ?? local)
  }

  if (stage === 'brain')
    return (
      <BrainSetup
        store={store}
        onBack={() => {
          settle()
          setStage(store.handoff.paths?.length ? 'console' : 'reading')
        }}
      />
    )

  if (stage === 'reading')
    return (
      <Upload
        brain={store.brain}
        onBack={() => setStage('brain')}
        intro="Probe reads it and writes four ways of attacking it. You pick one, and everybody gets that same one."
        onSent={(document, generated) => {
          store.push({ status: 'sent', document, paths: generated, pathIndex: 0, pathName: generated[0]?.name ?? '' })
          setStage('angle')
        }}
      />
    )

  if (stage === 'angle' && paths?.length)
    return (
      <div className="pane">
        <TopBar title="Pick the angle" onBack={() => setStage('reading')} />
        <div className="scroll pad">
          <p className="body dim" style={{ padding: '4px 0 16px' }}>
            Everyone gets this same one. Five transcripts only compare if they came from the
            same questions.
          </p>
          <div className="stack gap-10">
            {paths.map((option, i) => {
              const on = angle === i
              return (
                <button
                  key={option.name}
                  className={`card${on ? ' chosen' : ''}`}
                  style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}
                  onClick={() => setAngle(i)}
                  aria-pressed={on}
                >
                  <span className="grow stack gap-4">
                    <span className="row gap-8">
                      <span className="card-title">{option.name}</span>
                      <span className="chip">{option.difficulty}</span>
                    </span>
                    <span className="meta dim">{option.description}</span>
                    <span className="micro dimmer">
                      {option.script.length} questions · about {option.minutes} min
                    </span>
                  </span>
                  <span className={`radio${on ? ' on' : ''}`} style={{ marginTop: 4 }}>
                    {on && <Icon name="check" size={13} color="var(--surface)" />}
                  </span>
                </button>
              )
            })}
          </div>
          <button className="btn" style={{ marginTop: 18 }} onClick={() => setStage('console')}>
            Use this one for everybody
          </button>
          <div className="spacer-48" />
        </div>
      </div>
    )

  if (stage === 'review') return <Review onLeave={() => setStage('console')} />

  if (stage === 'session' && path)
    return (
      <div className="frame bare">
        <Session
          path={path}
          brain={store.brain}
          onStart={() => {
            startedAt.current = Date.now()
          }}
          onPause={() => setStage('console')}
          onFinish={(examiner) => void finish(examiner)}
        />
      </div>
    )

  /**
   * What the participant sees when it is over. Deliberately nothing: no score, no
   * breakdown, no verdict. They answered questions and that is the end of their part.
   */
  if (stage === 'recorded')
    return (
      <div className="pane">
        <div className="scroll pad" style={{ display: 'grid', placeItems: 'center', minHeight: '70vh' }}>
          <div className="stack gap-12" style={{ textAlign: 'center', maxWidth: 320 }}>
            <p className="display">Done</p>
            <p className="body dim">Thank you — that is recorded. Please hand the machine back.</p>
            <button className="btn" onClick={() => setStage('console')}>
              Next participant
            </button>
          </div>
        </div>
      </div>
    )

  return (
    <Trial
      onLeave={() => setStage(paths?.length ? 'angle' : 'reading')}
      onReview={() => setStage('review')}
      onBegin={path ? () => setStage('session') : undefined}
      angleName={path?.name ?? ''}
      onChangeReading={() => setStage('reading')}
      onChangeBrain={() => setStage('brain')}
    />
  )
}
