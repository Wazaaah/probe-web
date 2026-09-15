import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { TopBar } from '../components/ui'
import { PROVIDERS, makeBrain, providerInfo, type ProviderId } from '../lib/brain'
import {
  DEFAULT_PAUSE,
  availableVoices,
  chosenVoiceName,
  pauseSeconds,
  setPauseSeconds,
  setVoiceName,
} from '../lib/voice'
import type { ProbeStore } from '../lib/store'

type Check = { state: 'idle' | 'testing' | 'ok' | 'bad'; note: string }

/**
 * Who judges the answers.
 *
 * The key is pasted here and kept in this browser only — it is never built into the
 * bundle, because the bundle is a URL anyone can open and read. Nothing is saved until
 * it has been proved with a real call on the real path.
 */
export function BrainSetup({ store, onBack }: { store: ProbeStore; onBack: () => void }) {
  const [provider, setProvider] = useState<ProviderId>(store.provider)
  const [model, setModel] = useState(store.model)
  const [apiKey, setApiKey] = useState(store.apiKey)
  const [reveal, setReveal] = useState(false)
  const [check, setCheck] = useState<Check>({ state: 'idle', note: '' })
  const [voice, setVoice] = useState(chosenVoiceName)
  const [pause, setPause] = useState(pauseSeconds)

  /**
   * The browser loads its voices asynchronously and returns an empty list until it has.
   * Asking once on mount gives you nothing on a cold tab, so listen for the event too.
   */
  const [voices, setVoices] = useState(availableVoices)
  useEffect(() => {
    const refresh = () => setVoices(availableVoices())
    refresh()
    speechSynthesis?.addEventListener?.('voiceschanged', refresh)
    return () => speechSynthesis?.removeEventListener?.('voiceschanged', refresh)
  }, [])

  const tryVoice = (name: string) => {
    setVoice(name)
    setVoiceName(name)
    // Hearing it is the only way to choose one.
    try {
      speechSynthesis.cancel()
      const sample = new SpeechSynthesisUtterance('Which case does the paper use to make that point?')
      const picked = voices.find((v) => v.name === name)
      if (picked) {
        sample.voice = picked
        sample.lang = picked.lang
      }
      sample.rate = 0.95
      speechSynthesis.speak(sample)
    } catch {
      /* no synthesis here; the picker still records the choice */
    }
  }

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
    onBack()
  }

  return (
    <div className="pane">
      <TopBar title="Examiner" onBack={onBack} />
      <div className="scroll pad">
        <p className="body dim" style={{ padding: '4px 0 16px' }}>
          Probe needs something to judge answers with. Without a model it falls back to matching the words it expected
          to hear — enough to demonstrate the flow, not enough to examine anyone.
        </p>

        <div className="stack gap-10">
          {PROVIDERS.map((option) => {
            const on = provider === option.id
            return (
              <button
                key={option.id}
                className={`card${on ? ' chosen' : ''}`}
                style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}
                onClick={() => choose(option.id)}
                aria-pressed={on}
              >
                <span className="grow stack gap-4">
                  <span className="row gap-8">
                    <span className="card-title">{option.label}</span>
                    <span className="chip">{option.free ? 'Free' : 'Paid'}</span>
                  </span>
                  <span className="meta dim">{option.blurb}</span>
                </span>
                <span className={`radio${on ? ' on' : ''}`} style={{ marginTop: 4 }}>
                  {on && <Icon name="check" size={13} color="var(--surface)" />}
                </span>
              </button>
            )
          })}
        </div>

        {needsKey && (
          <div className="stack gap-12" style={{ marginTop: 22 }}>
            <div className="rule" />
            <div className="stack gap-4" style={{ paddingTop: 8 }}>
              <p className="body-med">API key</p>
              <p className="meta dim">
                Get one at {info.keysUrl}. It stays in this browser and goes nowhere except {info.label}.
              </p>
            </div>
            <div className="row gap-8">
              <input
                className="field"
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
              <button className="btn quiet small" onClick={() => setReveal((value) => !value)}>
                {reveal ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="stack gap-4">
              <p className="body-med">Model</p>
              <input
                className="field"
                value={model}
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => {
                  setModel(event.target.value)
                  setCheck({ state: 'idle', note: '' })
                }}
              />
              <p className="micro dimmer">Free tiers rotate their model names. If a call 404s, this is why.</p>
            </div>

            <button className="btn quiet" onClick={test} disabled={check.state === 'testing' || !apiKey.trim()}>
              {check.state === 'testing' ? 'Asking it to judge an answer…' : 'Test this key'}
            </button>

            {check.state !== 'idle' && check.state !== 'testing' && (
              <div className="notice row" style={{ alignItems: 'flex-start' }}>
                <Icon name={check.state === 'ok' ? 'check' : 'close'} size={18} />
                <span className="meta grow">{check.note}</span>
              </div>
            )}
          </div>
        )}
        <div className="rule" style={{ margin: '26px 0 20px' }} />

        {/* ---- how it sounds, and how long it waits ---- */}

        <div className="stack gap-4">
          <p className="body-med">Voice</p>
          <p className="meta dim">
            Whichever ones this computer has. Tap to hear it — the first in the list is
            usually the least pleasant to be questioned by.
          </p>
        </div>
        {voices.length === 0 ? (
          <p className="meta dim" style={{ marginTop: 8 }}>
            No voices installed, so questions will appear as text only.
          </p>
        ) : (
          <div className="stack gap-10" style={{ marginTop: 10 }}>
            {voices.slice(0, 6).map((option) => {
              const on = (voice || voices[0].name) === option.name
              return (
                <button
                  key={option.name}
                  className={`card${on ? ' chosen' : ''}`}
                  style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}
                  onClick={() => tryVoice(option.name)}
                  aria-pressed={on}
                >
                  <span className="grow stack gap-4">
                    <span className="card-title">{option.name.replace(/^Microsoft |^Google /, '')}</span>
                    <span className="meta dim">
                      {option.lang}
                      {option.localService ? '' : ' · network voice, usually the better one'}
                    </span>
                  </span>
                  <span className={`radio${on ? ' on' : ''}`}>
                    {on && <Icon name="check" size={13} color="var(--surface)" />}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <div className="stack gap-4" style={{ marginTop: 22 }}>
          <p className="body-med">How long a pause counts as finished</p>
          <p className="meta dim">
            People stop to think, usually on the question they are least sure about. Below
            this, the examiner keeps listening rather than taking the silence for an answer.
          </p>
        </div>
        <div className="row gap-8" style={{ marginTop: 10 }}>
          {[1.5, 2.5, 4, 6].map((seconds) => (
            <button
              key={seconds}
              className={`btn${pause === seconds ? '' : ' quiet'}`}
              style={{ flex: 1, minWidth: 0 }}
              onClick={() => {
                setPause(seconds)
                setPauseSeconds(seconds)
              }}
              aria-pressed={pause === seconds}
            >
              {seconds}s
            </button>
          ))}
        </div>
        <p className="micro dimmer" style={{ marginTop: 8 }}>
          {pause === DEFAULT_PAUSE ? 'The default.' : `Changed from ${DEFAULT_PAUSE}s.`} Longer is
          safer for a nervous speaker; shorter keeps a confident one moving.
        </p>

        <div style={{ height: 24 }} />
      </div>

      <div className="dock">
        <button className="btn" onClick={save}>
          Use {info.label}
        </button>
      </div>
    </div>
  )
}
