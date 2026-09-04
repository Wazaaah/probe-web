import { useEffect, useState } from 'react'
import { Banner, useHandoffAlert, type Alert } from '../../components/Banner'
import { Nav } from '../../components/ui'
import { BrainSetup } from '../BrainSetup'
import { Profile } from '../Profile'
import { Inbox } from './Inbox'
import { Paths } from './Paths'
import { People, Reports } from './People'
import { Report } from './Report'
import { LEARNER, REVIEWER, SEED_PATHS } from '../../data/sample'
import { askToNotify } from '../../lib/notify'
import type { ProbeStore } from '../../lib/store'
import type { Handoff } from '../../data/types'

type Tab = 'inbox' | 'people' | 'reports' | 'profile'
type Stage = 'tabs' | 'paths' | 'report' | 'brain'

const FIRST = LEARNER.name.split(' ')[0]

/** Reads a change to the shared state the way the reviewer would experience it. */
function alertFor(previous: Handoff, next: Handoff): Alert | null {
  if (next.status === 'done' && previous.status !== 'done')
    return { icon: 'report', title: `${FIRST} finished`, detail: `${next.pathName} · scored ${next.score ?? 0}`, action: 'Read' }
  if (next.status === 'live' && previous.status !== 'live')
    return { icon: 'wave', title: `${FIRST} started`, detail: next.pathName }
  if (next.paths && next.paths !== previous.paths && next.status === 'awaiting')
    return { icon: 'upload', title: `${FIRST} uploaded something`, detail: next.document, action: 'Open' }
  return null
}

export function Reviewer({ store }: { store: ProbeStore }) {
  const [tab, setTab] = useState<Tab>('inbox')
  const [stage, setStage] = useState<Stage>('tabs')

  const paths = store.handoff.paths ?? SEED_PATHS
  const { alert, dismiss } = useHandoffAlert(store.handoff, store.device, alertFor)

  // The other device can move on while this one is reading. A report for a session that
  // no longer exists would show a score of zero and an empty transcript, so leave it.
  const status = store.handoff.status
  useEffect(() => {
    if (stage === 'report' && status !== 'done' && status !== 'rerun') setStage('tabs')
  }, [stage, status])

  const detail = stage !== 'tabs'
  const pane =
    stage === 'brain' ? (
      <BrainSetup store={store} onBack={() => setStage('tabs')} />
    ) : stage === 'paths' ? (
      <Paths
        paths={paths}
        chosen={store.handoff.pathIndex}
        onBack={() => setStage('tabs')}
        onSend={(index) => {
          void askToNotify()
          store.push({
            status: 'sent',
            pathIndex: index,
            pathName: paths[index]?.name ?? '',
            score: null,
            result: null,
            nudged: false,
          })
          setStage('tabs')
        }}
      />
    ) : stage === 'report' ? (
      <Report
        handoff={store.handoff}
        onBack={() => setStage('tabs')}
        onRerun={() => {
          store.push({ status: 'rerun', nudged: true })
          setStage('tabs')
        }}
      />
    ) : (
      <div className="pane">
        {tab === 'inbox' && (
          <Inbox
            handoff={store.handoff}
            online={store.link === 'online'}
            onChoose={() => {
              void askToNotify()
              setStage('paths')
            }}
            onRead={() => setStage('report')}
            onNudge={() => store.push({ nudged: true })}
          />
        )}
        {tab === 'people' && <People handoff={store.handoff} />}
        {tab === 'reports' && <Reports />}
        {tab === 'profile' && <Profile store={store} onOpenBrain={() => setStage('brain')} />}
      </div>
    )

  return (
    <div className="frame">
      <Nav
        who={REVIEWER}
        active={tab}
        hidden={detail}
        onSelect={(next) => {
          setStage('tabs')
          setTab(next)
        }}
        items={[
          {
            id: 'inbox',
            icon: 'inbox',
            label: 'Inbox',
            badge: store.handoff.status === 'awaiting' || store.handoff.status === 'done' ? 1 : undefined,
          },
          { id: 'people', icon: 'people', label: 'People' },
          { id: 'reports', icon: 'report', label: 'Reports' },
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
            setTab('inbox')
            setStage(store.handoff.status === 'done' ? 'report' : 'tabs')
          }}
        />
      )}
    </div>
  )
}
