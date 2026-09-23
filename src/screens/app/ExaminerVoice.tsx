import { useEffect, useState } from 'react'
import {
  DEFAULT_PAUSE,
  MAX_PAUSE,
  availableVoices,
  chosenVoiceName,
  pauseSeconds,
  setPauseSeconds,
  setVoiceName,
} from '../../lib/voice'

/**
 * How the exam sounds, and how long it waits — the two things worth adjusting per
 * meeting, since the right pause depends on the room and the student, not the course.
 * Deliberately just this: the model and the key live in Admin, not here.
 */
export function ExaminerVoice() {
  const [voice, setVoice] = useState(chosenVoiceName)
  const [pause, setPause] = useState(pauseSeconds)
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

  return (
    <div className="pa-stack pa-gap-20">
      <div className="pa-stack pa-gap-6">
        <h1 className="pa-h1">Examiner voice</h1>
        <p className="pa-lede">Set before sitting down with a student. Nothing here affects who judges the answers.</p>
      </div>

      <div className="pa-card pa-stack pa-gap-12">
        <div className="pa-stack pa-gap-4">
          <span className="pa-h3">Voice</span>
          <span className="pa-meta">Whichever ones this computer has. Click one to hear it.</span>
        </div>
        {voices.length === 0 ? (
          <p className="pa-meta">No voices installed, so questions will appear as text only.</p>
        ) : (
          <div className="pa-grid">
            {voices.slice(0, 8).map((option) => {
              const on = (voice || voices[0].name) === option.name
              return (
                <button
                  key={option.name}
                  className="pa-card pa-row"
                  style={{ borderColor: on ? 'var(--pa-accent)' : undefined, cursor: 'pointer', padding: '12px 14px' }}
                  onClick={() => tryVoice(option.name)}
                  aria-pressed={on}
                >
                  <span className="pa-grow pa-stack pa-gap-4" style={{ alignItems: 'flex-start' }}>
                    <span className="pa-body" style={{ fontWeight: 600 }}>
                      {option.name.replace(/^Microsoft |^Google /, '')}
                    </span>
                    <span className="pa-micro">
                      {option.lang}
                      {option.localService ? '' : ' · network voice'}
                    </span>
                  </span>
                  {on && <span className="pa-chip accent">In use</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="pa-card pa-stack pa-gap-12">
        <div className="pa-stack pa-gap-4">
          <span className="pa-h3">How long a pause counts as finished</span>
          <span className="pa-meta">
            People stop to think, usually on the question they are least sure about. Below
            this, the examiner keeps listening rather than taking the silence for an answer.
          </span>
        </div>
        <div className="pa-row pa-gap-12">
          <input
            type="range"
            min={1}
            max={MAX_PAUSE}
            step={0.5}
            value={pause}
            onChange={(event) => {
              const seconds = Number(event.target.value)
              setPause(seconds)
              setPauseSeconds(seconds)
            }}
            style={{ flex: 1 }}
            aria-label="Pause before an answer counts as finished, in seconds"
          />
          <span className="pa-body" style={{ fontWeight: 600, minWidth: 42, textAlign: 'right' }}>
            {pause}s
          </span>
        </div>
        <span className="pa-micro">
          {pause === DEFAULT_PAUSE ? 'The default.' : `Changed from ${DEFAULT_PAUSE}s.`} Longer is safer
          for a nervous speaker; shorter keeps a confident one moving.
        </span>
      </div>
    </div>
  )
}
