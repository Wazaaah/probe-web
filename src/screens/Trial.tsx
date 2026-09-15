import { useState } from 'react'
import { Icon } from '../components/Icon'
import { TopBar } from '../components/ui'
import {
  annotate,
  clearSessions,
  exportSessions,
  loadSessions,
  saveSetup,
  summarise,
  trialSetup,
  type Preparation,
  type TrialSetup,
} from '../lib/trial'

/**
 * The console for running a few people through the same reading.
 *
 * Deliberately off to one side, at #trial, and invisible to anyone who does not know it
 * is there. Probe's ordinary behaviour — keep nothing, send nothing — is the right
 * behaviour, and this is the single exception: someone running a small trial on their own
 * device who needs the transcripts back afterwards.
 *
 * Two things here are load-bearing. Preparation is self-reported BEFORE the session and
 * never reaches the examiner, so it stays an independent measure rather than something
 * the questioning can drift towards. And the measures computed from a transcript are
 * shown to the organiser only, never to the participant: they are being validated, not
 * applied, and nobody should receive a mark from a number we are still checking.
 */

const PREPARATIONS: { id: Preparation; label: string; hint: string }[] = [
  { id: 'read', label: 'Read it properly', hint: 'Sat down with it, start to finish' },
  { id: 'skimmed', label: 'Skimmed it', hint: 'Knows roughly what is in it' },
  { id: 'unread', label: 'Not at all', hint: 'Going in cold, on purpose' },
]

export function Trial({ onLeave }: { onLeave: () => void }) {
  const existing = trialSetup()
  const [participant, setParticipant] = useState(existing?.participant ?? '')
  const [preparation, setPreparation] = useState<Preparation>(existing?.preparation ?? 'unsaid')
  const [sessions, setSessions] = useState(loadSessions())
  const [note, setNote] = useState('')
  const [armed, setArmed] = useState(Boolean(existing?.participant))

  const arm = () => {
    const setup: TrialSetup = { participant: participant.trim(), preparation, topic: '' }
    saveSetup(setup)
    setArmed(true)
    setSessions(loadSessions())
  }

  const disarm = () => {
    saveSetup(null)
    setArmed(false)
  }

  const latest = sessions[sessions.length - 1]

  return (
    <div className="pane">
      <TopBar title="Trial" onBack={onLeave} />
      <div className="scroll pad">
        <p className="body dim" style={{ padding: '4px 0 18px' }}>
          Everything happens on this device. Say who is about to go, hand them the machine,
          and export the lot at the end. Nothing is uploaded anywhere.
        </p>

        {/* ---- who is next ---------------------------------------------- */}

        <div className="stack gap-4">
          <p className="body-med">Who is next</p>
          <p className="meta dim">A code, not a name — P1, P2. It is what ends up in the file.</p>
        </div>
        <input
          className="field"
          value={participant}
          placeholder="P1"
          autoComplete="off"
          spellCheck={false}
          aria-label="Participant code"
          onChange={(event) => setParticipant(event.target.value)}
          style={{ marginTop: 10 }}
        />

        <div className="stack gap-4" style={{ marginTop: 22 }}>
          <p className="body-med">Ask them before they start: have you read it?</p>
          <p className="meta dim">The examiner never sees this. It is what the session gets checked against.</p>
        </div>
        <div className="stack gap-10" style={{ marginTop: 10 }}>
          {PREPARATIONS.map((option) => {
            const on = preparation === option.id
            return (
              <button
                key={option.id}
                className={`card${on ? ' chosen' : ''}`}
                style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}
                onClick={() => setPreparation(option.id)}
                aria-pressed={on}
              >
                <span className="grow stack gap-4">
                  <span className="card-title">{option.label}</span>
                  <span className="meta dim">{option.hint}</span>
                </span>
                <span className={`radio${on ? ' on' : ''}`} style={{ marginTop: 4 }}>
                  {on && <Icon name="check" size={13} color="var(--surface)" />}
                </span>
              </button>
            )
          })}
        </div>

        <div className="row gap-8" style={{ marginTop: 16 }}>
          <button
            className="btn"
            onClick={arm}
            disabled={!participant.trim() || preparation === 'unsaid'}
          >
            {armed ? 'Update' : 'Start recording'}
          </button>
          {armed && (
            <button className="btn quiet" onClick={disarm}>
              Stop
            </button>
          )}
        </div>

        {armed && (
          <div className="notice row" style={{ marginTop: 14 }}>
            <span className="meta">
              Recording <strong>{participant.trim()}</strong>. Go back, pick the reading, and run
              the session exactly as normal.
            </span>
          </div>
        )}

        <div className="rule" style={{ margin: '28px 0 22px' }} />

        {/* ---- what has been collected ---------------------------------- */}

        <div className="stack gap-4">
          <p className="body-med">Collected · {sessions.length}</p>
          {sessions.length === 0 && (
            <p className="meta dim">Nothing yet. Finish a session and it appears here.</p>
          )}
        </div>

        {sessions.length > 0 && (
          <>
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <pre
                className="micro"
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  lineHeight: 1.7,
                  margin: 0,
                  whiteSpace: 'pre',
                }}
              >
                {summarise(sessions)}
              </pre>
            </div>
            <p className="micro dimmer" style={{ marginTop: 8 }}>
              gYield is new grounded detail a probe pulled out; docEcho is how much was read
              back off the page; silence is the median pause before answering. All being
              checked, none of it applied to anyone's result.
            </p>

            {latest && (
              <div className="stack gap-4" style={{ marginTop: 20 }}>
                <p className="meta dim">Anything worth remembering about {latest.participant}?</p>
                <div className="row gap-8">
                  <input
                    className="field"
                    value={note}
                    placeholder="Mic kept cutting out; very nervous; …"
                    autoComplete="off"
                    onChange={(event) => setNote(event.target.value)}
                  />
                  <button
                    className="btn quiet small"
                    disabled={!note.trim()}
                    onClick={() => {
                      annotate(latest.startedAt, note.trim())
                      setNote('')
                      setSessions(loadSessions())
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            <div className="row gap-8" style={{ marginTop: 22 }}>
              <button className="btn" onClick={() => exportSessions(sessions)}>
                Export JSON
              </button>
              <button
                className="btn quiet"
                onClick={() => {
                  if (
                    window.confirm(
                      'Delete every recorded session on this device? Export first — this cannot be undone.',
                    )
                  ) {
                    clearSessions()
                    setSessions([])
                  }
                }}
              >
                Clear
              </button>
            </div>
            <p className="meta dim" style={{ marginTop: 10 }}>
              Export before clearing, and before anything clears this browser's data. The
              sessions live in this tab's storage and nowhere else.
            </p>
          </>
        )}

        <div className="spacer-48" />
      </div>
    </div>
  )
}
