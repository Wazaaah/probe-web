import { useState } from 'react'
import { Icon } from '../components/Icon'
import { Avatar } from '../components/ui'
import { providerInfo } from '../lib/brain'
import type { ProbeStore } from '../lib/store'
import { LEARNER, REVIEWER } from '../data/sample'

const LINK_LABEL = { online: 'Paired', connecting: 'Reconnecting', offline: 'Offline' } as const

/**
 * The one screen both roles share.
 *
 * It answers the three questions a demo raises: who is this browser, is it actually
 * talking to the other one, and what is judging the answers.
 */
export function Profile({ store, onOpenBrain }: { store: ProbeStore; onOpenBrain: () => void }) {
  const [code, setCode] = useState(store.code)
  const person = store.role === 'reviewer' ? REVIEWER : LEARNER
  const info = providerInfo(store.provider)
  const canHear = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  return (
    <div className="scroll pad">
      <div className="row gap-14" style={{ padding: '12px 0 20px' }}>
        <Avatar who={person} size="big" />
        <div className="grow stack gap-4">
          <p className="title">{person.name}</p>
          <p className="meta dim">{store.role === 'reviewer' ? 'Signed in as the reviewer' : 'Signed in as the learner'}</p>
        </div>
      </div>

      <div className="card stack gap-12">
        <div className="between">
          <span className="body-med">Paired device</span>
          <span className="chip">
            <span className={`dot${store.link === 'online' ? '' : ' still'}`} />
            {LINK_LABEL[store.link]}
          </span>
        </div>
        <p className="meta dim">
          The other browser needs this same code. Everything either of you does is relayed to the other through it.
        </p>
        <div className="row gap-8">
          <input
            className="field"
            value={code}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setCode(event.target.value)}
          />
          <button
            className="btn quiet small"
            disabled={code.trim() === store.code || !code.trim()}
            onClick={() => store.signIn(store.role ?? 'learner', code)}
          >
            Change
          </button>
        </div>
        <p className="micro dimmer">
          Anyone who guesses the code can join the session. Fine for a demo; a real build puts this behind an account.
        </p>
      </div>

      <div className="stack" style={{ marginTop: 20 }}>
        <button className="row" style={{ padding: '13px 0', width: '100%', textAlign: 'left' }} onClick={onOpenBrain}>
          <span className="tile">
            <Icon name="spark" size={19} />
          </span>
          <span className="grow stack gap-4">
            <span className="body-med">Examiner</span>
            <span className="meta dim">
              {store.brain ? `${info.label} · ${store.model}` : 'No model — falling back to word matching'}
            </span>
          </span>
          <Icon name="chev" size={15} color="var(--ink-600)" />
        </button>
        <div className="rule" />

        <div className="row" style={{ padding: '13px 0' }}>
          <span className="tile">
            <Icon name={canHear ? 'mic' : 'micOff'} size={19} />
          </span>
          <span className="grow stack gap-4">
            <span className="body-med">Voice</span>
            <span className="meta dim">
              {canHear
                ? 'Speech recognition available. Audio is transcribed by the browser and never stored.'
                : 'This browser has no speech recognition — sessions fall back to typing. Chrome or Edge have it.'}
            </span>
          </span>
        </div>
        <div className="rule" />
      </div>

      <div style={{ marginTop: 22 }}>
        <button className="btn quiet" onClick={store.signOut}>
          Sign out of this device
        </button>
        <p className="micro dimmer" style={{ marginTop: 10, textAlign: 'center' }}>
          Signing out asks which side you are on again. Nothing else is cleared.
        </p>
      </div>
      <div style={{ height: 16 }} />
    </div>
  )
}
