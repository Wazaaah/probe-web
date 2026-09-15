import { useRef, useState } from 'react'
import { BrainSetup } from './BrainSetup'
import { Session } from './Session'
import { Trial } from './Trial'
import { Review } from './Review'
import { Upload } from './learner/Upload'
import { readingText, recorder, rememberSource, rememberWork } from '../lib/trial'
import type { Examiner } from '../lib/examiner'
import type { ProbeStore } from '../lib/store'
import type { QuestionPath } from '../data/types'

/**
 * Probe with everything that is not this experiment taken out.
 *
 * The shipped app opens on a choice between two roles, because the product is one person
 * examining another's work. None of that applies to an afternoon spent finding out
 * whether the judging works: there is one machine and five people taking turns at it. A
 * role chooser, a pairing code, an inbox and a library are all things a participant has
 * to be walked past before answering a question, and each is a chance for the session to
 * start badly.
 *
 * Two texts, not one, because that is what Probe is for. Everyone is examined on the same
 * reading, and each person brings a short passage they wrote about it. The questions come
 * from what THEY wrote and can only be answered out of the reading — which is the point,
 * and the reason a paragraph produced by someone who never opened the source is the case
 * worth catching.
 *
 * Questions are therefore built per participant and differ between them. That is correct
 * and costs nothing here: the comparison at the end is each transcript against a blind
 * human read of that same transcript, which never required two people to have been asked
 * the same thing.
 */

type Stage = 'brain' | 'reading' | 'console' | 'building' | 'session' | 'recorded' | 'review'

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
  const [readingName, setReadingName] = useState(() => store.handoff.document)
  const [stage, setStage] = useState<Stage>(() => {
    if (!settled()) return 'brain'
    return readingText() ? 'console' : 'reading'
  })
  const [path, setPath] = useState<QuestionPath | null>(null)
  const [failed, setFailed] = useState('')
  const startedAt = useRef(Date.now())

  /**
   * Build this participant's questions from their own passage, against the reading.
   *
   * Done when they sit down rather than up front, because the questions depend on what
   * they wrote. It takes a few seconds and the screen says so — a participant staring at
   * a blank pane assumes the thing has crashed.
   */
  const begin = async (work: string) => {
    rememberWork(work)
    setFailed('')
    setStage('building')
    const source = { name: readingName || 'the reading', text: readingText() }
    const paths = store.brain ? await store.brain.buildPaths('their passage', work, { source }) : null
    const first = paths?.[0] ?? null
    if (!first) {
      setFailed('Could not write questions from that passage. Check the examiner key, or try a longer passage.')
      setStage('console')
      return
    }
    setPath(first)
    setStage('session')
  }

  /**
   * The score is computed and kept, but the participant is not shown it.
   *
   * It comes from the judge this whole exercise exists to test, and we already know it
   * ranks a confident bluffer above an honest hesitant student. Showing someone a mark
   * from it would be unfair to them and would colour the next thing they say.
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
          setStage(readingText() ? 'console' : 'reading')
        }}
      />
    )

  if (stage === 'reading')
    return (
      <Upload
        brain={store.brain}
        onBack={() => setStage('brain')}
        kind="reading"
        skipPaths
        intro="Upload the reading everybody was set — the source itself, not an essay about it. Each person brings their own passage about it when they sit down."
        onSent={(name) => {
          // Upload has already handed the text to the trial module; keep the name with it.
          rememberSource(readingText())
          setReadingName(name)
          store.push({ status: 'sent', document: name })
          setStage('console')
        }}
      />
    )

  if (stage === 'review') return <Review onLeave={() => setStage('console')} />

  if (stage === 'building')
    return (
      <div className="pane">
        <div className="scroll pad" style={{ display: 'grid', placeItems: 'center', minHeight: '70vh' }}>
          <div className="stack gap-12" style={{ textAlign: 'center', maxWidth: 340 }}>
            <p className="display">Reading it</p>
            <p className="body dim">Working out what to ask about this passage. A few seconds.</p>
          </div>
        </div>
      </div>
    )

  if (stage === 'session' && path)
    return (
      <div className="frame bare">
        <Session
          path={path}
          brain={store.brain}
          onStart={() => {
            startedAt.current = Date.now()
            recorder.begin()
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
      onLeave={() => setStage('reading')}
      onReview={() => setStage('review')}
      onBegin={(work) => void begin(work)}
      readingName={readingName}
      error={failed}
      onChangeReading={() => setStage('reading')}
      onChangeBrain={() => setStage('brain')}
    />
  )
}
