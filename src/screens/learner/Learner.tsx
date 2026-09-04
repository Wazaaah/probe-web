import { useMemo, useRef, useState } from 'react'
import { Banner, useHandoffAlert, type Alert } from '../../components/Banner'
import { Nav } from '../../components/ui'
import { BrainSetup } from '../BrainSetup'
import { Profile } from '../Profile'
import { Session } from '../Session'
import { Consent } from './Consent'
import { History } from './History'
import { Library } from './Library'
import { Result } from './Result'
import { Upload } from './Upload'
import { LEARNER, SEED_PATHS } from '../../data/sample'
import { askToNotify } from '../../lib/notify'
import { describeRun, recordRun } from '../../lib/runs'
import type { Examiner } from '../../lib/examiner'
import type { ProbeStore } from '../../lib/store'
import type { Handoff, QuestionPath, SessionResult } from '../../data/types'

type Tab = 'library' | 'sessions' | 'profile'
type Stage = 'tabs' | 'upload' | 'consent' | 'session' | 'result' | 'brain'

const CONSENT_KEY = 'probe.consent'

/** Reads a change to the shared state the way the learner would experience it. */
function alertFor(previous: Handoff, next: Handoff): Alert | null {
  if (next.status === 'sent' && previous.status !== 'sent')
    return { icon: 'fork', title: 'Your angle is ready', detail: next.pathName, action: 'Open' }
  if (next.status === 'rerun' && previous.status !== 'rerun')
    return {
      icon: 'refresh',
      title: 'Run it again',
      detail: `Your reviewer wants another go at ${next.pathName}.`,
      action: 'Open',
    }
  if (next.nudged && !previous.nudged)
    return { icon: 'bell', title: 'A nudge', detail: 'Your reviewer is waiting on this one.' }
  return null
}

export function Learner({ store }: { store: ProbeStore }) {
  const [tab, setTab] = useState<Tab>('library')
  const [stage, setStage] = useState<Stage>('tabs')
  const [result, setResult] = useState<SessionResult | null>(null)
  const [sending, setSending] = useState(false)
  const startedAt = useRef(Date.now())

  const paths: QuestionPath[] = store.handoff.paths ?? SEED_PATHS
  const path = paths[Math.min(Math.max(store.handoff.pathIndex, 0), paths.length - 1)] ?? null

  const { alert, dismiss } = useHandoffAlert(store.handoff, store.device, alertFor)
  const consented = useMemo(() => {
    try {
      return localStorage.getItem(CONSENT_KEY) === 'yes'
    } catch {
      return false
    }
  }, [stage])

  const begin = () => setStage(consented ? 'session' : 'consent')

  const finish = async (examiner: Examiner) => {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000))
    const local: SessionResult = {
      score: examiner.score(),
      verdict: examiner.verdict(),
      bars: examiner.breakdown(),
      probes: examiner.probeCount,
      moment: examiner.weakest(),
      transcript: examiner.answers,
    }
    setResult(local)
    setStage('result')
    setSending(true)

    // A model's reading of the whole transcript beats the running tally, so if one is
    // configured the score the reviewer sees is the one it wrote.
    const summary = path && store.brain ? await store.brain.summarise(path, examiner.answers) : null
    const final: SessionResult = summary
      ? {
          ...local,
          score: summary.score,
          verdict: summary.verdict || local.verdict,
          bars: summary.concepts.length > 0 ? summary.concepts : local.bars,
          moment: summary.momentQuote
            ? {
                question: summary.momentConcept,
                concept: summary.momentConcept,
                spoken: summary.momentQuote,
                coverage: 0,
                probed: true,
              }
            : local.moment,
        }
      : local

    setResult(final)
    store.push({ status: 'done', score: final.score, nudged: false, result: final })
    recordRun({
      document: store.handoff.document,
      title: path?.name ?? store.handoff.pathName,
      meta: describeRun(minutes, examiner.answers.length, examiner.probeCount),
      score: final.score,
      at: Date.now(),
    })
    setSending(false)
  }


  // The examination takes the whole window: no navigation, nothing else to look at.
  if (stage === 'session' && path)
    return (
      <div className="frame bare">
        <Session
          path={path}
          brain={store.brain}
          onStart={() => {
            startedAt.current = Date.now()
            store.push({ status: 'live', nudged: false })
          }}
          onPause={() => setStage('tabs')}
          onFinish={(examiner) => void finish(examiner)}
        />
      </div>
    )

  const detail = stage !== 'tabs'
  const pane =
    stage === 'brain' ? (
      <BrainSetup store={store} onBack={() => setStage('tabs')} />
    ) : stage === 'upload' ? (
      <Upload
        brain={store.brain}
        onBack={() => setStage('tabs')}
        onSent={(document, generated) => {
          store.push({
            status: 'awaiting',
            document,
            paths: generated,
            score: null,
            pathName: '',
            nudged: false,
            result: null,
          })
          setStage('tabs')
        }}
      />
    ) : stage === 'consent' ? (
      <Consent
        onBack={() => setStage('tabs')}
        onAgree={() => {
          try {
            localStorage.setItem(CONSENT_KEY, 'yes')
          } catch {
            /* it will simply be asked again next time */
          }
          void askToNotify()
          setStage('session')
        }}
      />
    ) : stage === 'result' && result ? (
      <Result
        result={result}
        pathName={path?.name ?? store.handoff.pathName}
        sending={sending}
        onDone={() => setStage('tabs')}
      />
    ) : (
      <div className="pane">
        {tab === 'library' && (
          <Library
            handoff={store.handoff}
            path={path}
            online={store.link === 'online'}
            onUpload={() => setStage('upload')}
            onBegin={begin}
            onSeeResult={() => result && setStage('result')}
          />
        )}
        {tab === 'sessions' && <History />}
        {tab === 'profile' && <Profile store={store} onOpenBrain={() => setStage('brain')} />}
      </div>
    )

  return (
    <div className="frame">
      <Nav
        who={LEARNER}
        active={tab}
        hidden={detail}
        onSelect={(next) => {
          setStage('tabs')
          setTab(next)
        }}
        items={[
          { id: 'library', icon: 'book', label: 'Library' },
          { id: 'sessions', icon: 'clock', label: 'Sessions' },
          { id: 'profile', icon: 'user', label: 'Profile' },
        ]}
      />

      {pane}

      {alert && (
        <Banner
          alert={alert}
          onDismiss={dismiss}
          onAction={() => {
            dismiss()
            setStage('tabs')
            setTab('library')
          }}
        />
      )}
    </div>
  )
}
