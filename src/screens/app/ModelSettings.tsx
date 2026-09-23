import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { PROVIDERS, makeBrain, providerInfo, type ProviderId } from '../../lib/brain'
import type { ProbeStore } from '../../lib/store'

type Check = { state: 'idle' | 'testing' | 'ok' | 'bad'; note: string }

/**
 * Which model judges, and the key it judges with — kept here, in the admin area, and
 * nowhere a lecturer running an exam would stumble into it. The examiner-facing settings
 * (voice, how long a pause counts as finished) are a separate screen on purpose: those are
 * something to tune per meeting, this is something to set up once.
 */
export function ModelSettings({ store }: { store: ProbeStore }) {
  const [provider, setProvider] = useState<ProviderId>(store.provider)
  const [model, setModel] = useState(store.model)
  const [apiKey, setApiKey] = useState(store.apiKey)
  const [reveal, setReveal] = useState(false)
  const [check, setCheck] = useState<Check>({ state: 'idle', note: '' })

  const info = providerInfo(provider)
  const needsKey = provider !== 'none'

  const choose = (next: ProviderId) => {
    setProvider(next)
    setModel(providerInfo(next).defaultModel)
    setCheck({ state: 'idle', note: '' })
  }

  const test = async () => {
    setCheck({ state: 'testing', note: '' })
    const brain = makeBrain({ provider, model: model || info.defaultModel, apiKey })
    if (!brain) {
      setCheck({ state: 'bad', note: 'Paste a key first.' })
      return
    }
    try {
      setCheck({ state: 'ok', note: await brain.check() })
    } catch (error) {
      setCheck({ state: 'bad', note: error instanceof Error ? error.message : 'The call failed.' })
    }
  }

  const save = () => {
    store.chooseProvider(provider)
    store.saveBrain(model || info.defaultModel, needsKey ? apiKey.trim() : '')
  }

  return (
    <div className="pa-stack pa-gap-20">
      <div className="pa-stack pa-gap-6">
        <h1 className="pa-h1">Model &amp; API key</h1>
        <p className="pa-lede">
          Who judges the answers, and what it costs. This is set up once for the whole
          course, not something a lecturer touches before each meeting.
        </p>
      </div>

      <div className="pa-grid">
        {PROVIDERS.map((option) => {
          const on = provider === option.id
          return (
            <button
              key={option.id}
              className="pa-card pa-stack pa-gap-8"
              style={{ alignItems: 'flex-start', borderColor: on ? 'var(--pa-accent)' : undefined, cursor: 'pointer' }}
              onClick={() => choose(option.id)}
              aria-pressed={on}
            >
              <span className="pa-row pa-between" style={{ width: '100%' }}>
                <span className="pa-h3">{option.label}</span>
                <span className={`pa-chip${on ? ' accent' : ''}`}>{option.free ? 'Free' : 'Paid'}</span>
              </span>
              <span className="pa-meta">{option.blurb}</span>
            </button>
          )
        })}
      </div>

      {needsKey && (
        <div className="pa-card pa-stack pa-gap-16">
          <div className="pa-stack pa-gap-4">
            <span className="pa-h3">API key</span>
            <span className="pa-meta">
              Get one at {info.keysUrl}. It stays in this browser and goes nowhere except {info.label}.
            </span>
          </div>
          <div className="pa-row pa-gap-8">
            <input
              className="pa-field"
              type={reveal ? 'text' : 'password'}
              value={apiKey}
              placeholder={provider === 'claude' ? 'sk-ant-…' : provider === 'groq' ? 'gsk_…' : 'AIza…'}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setApiKey(event.target.value)
                setCheck({ state: 'idle', note: '' })
              }}
            />
            <button className="pa-btn quiet" onClick={() => setReveal((v) => !v)}>
              {reveal ? 'Hide' : 'Show'}
            </button>
          </div>

          <div className="pa-stack pa-gap-4">
            <span className="pa-h3">Model</span>
            <input
              className="pa-field"
              value={model}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => {
                setModel(event.target.value)
                setCheck({ state: 'idle', note: '' })
              }}
            />
            <span className="pa-micro">Free tiers rotate their model names. If a call 404s, this is why.</span>
          </div>

          <div className="pa-row pa-gap-8" style={{ flexWrap: 'wrap' }}>
            <button className="pa-btn quiet" onClick={test} disabled={check.state === 'testing' || !apiKey.trim()}>
              {check.state === 'testing' ? 'Asking it to judge an answer…' : 'Test this key'}
            </button>
            <button className="pa-btn" onClick={save}>
              Save
            </button>
          </div>

          {check.state !== 'idle' && check.state !== 'testing' && (
            <div className="pa-row" style={{ alignItems: 'flex-start', color: check.state === 'ok' ? 'var(--pa-good)' : 'var(--pa-bad)' }}>
              <Icon name={check.state === 'ok' ? 'check' : 'close'} size={16} color={check.state === 'ok' ? 'var(--pa-good)' : 'var(--pa-bad)'} />
              <span className="pa-meta" style={{ color: 'inherit' }}>{check.note}</span>
            </div>
          )}
        </div>
      )}

      {!needsKey && (
        <button className="pa-btn" style={{ alignSelf: 'flex-start' }} onClick={save}>
          Save
        </button>
      )}
    </div>
  )
}
