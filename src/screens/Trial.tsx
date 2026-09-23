import { useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { TopBar } from '../components/ui'
import { UnreadableFile, readDocument } from '../lib/doc'
import {
  annotate,
  clearSessions,
  exportSessions,
  loadSessions,
  readingDocs,
  saveSetup,
  trialSetup,
  type Authorship,
  type Preparation,
  type TrialSetup,
} from '../lib/trial'
import { boundaryLine, boundaryOf, classReport } from '../lib/report'

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

/**
 * Who wrote the passage, asked separately from whether they read the paper.
 *
 * These are different questions and collapsing them tests the wrong thing. Someone who
 * read the paper and had a model write up their view still knows the material and an oral
 * examination should pass them; someone who read nothing and produced the same paragraph
 * should not. Probe is supposed to tell those two apart. If it cannot, it is detecting
 * authorship rather than understanding, and that is worth finding out on five people
 * rather than on a cohort.
 */
const AUTHORSHIP: { id: Authorship; label: string; hint: string }[] = [
  { id: 'own', label: 'They wrote it', hint: 'Their own words, start to finish' },
  { id: 'assisted', label: 'With AI help', hint: 'Drafted or tidied with a model' },
  { id: 'ai', label: 'AI wrote it', hint: 'Start to finish, barely touched' },
]

const PREPARATIONS: { id: Preparation; label: string; hint: string }[] = [
  { id: 'read', label: 'Read it properly', hint: 'Sat down with it, start to finish' },
  { id: 'skimmed', label: 'Skimmed it', hint: 'Knows roughly what is in it' },
  { id: 'unread', label: 'Not at all', hint: 'Going in cold, on purpose' },
]

export function Trial({
  onLeave,
  onReview,
  onBegin,
  readingNames = [],
  error = '',
  onChangeReading,
  onChangeBrain,
}: {
  onLeave: () => void
  onReview: () => void
  /** Present only in the trial build, where the console also starts the session. */
  onBegin?: (work: string) => void
  readingNames?: string[]
  error?: string
  onChangeReading?: () => void
  onChangeBrain?: () => void
}) {
  const existing = trialSetup()
  const [participant, setParticipant] = useState(existing?.participant ?? '')
  const [preparation, setPreparation] = useState<Preparation>(existing?.preparation ?? 'unsaid')
  const [authorship, setAuthorship] = useState<Authorship>(existing?.authorship ?? 'unsaid')
  const [sessions, setSessions] = useState(loadSessions())
  const [note, setNote] = useState('')
  const [work, setWork] = useState('')
  const [armed, setArmed] = useState(Boolean(existing?.participant))
  const [reading, setReading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const readingLabel = readingNames.length <= 1 ? readingNames[0] || 'the reading' : `the ${readingNames.length} readings`

  const takeFile = async (file: File) => {
    setUploadError('')
    setReading(true)
    try {
      setWork(await readDocument(file))
    } catch (err) {
      setUploadError(err instanceof UnreadableFile ? err.message : 'That file could not be read in the browser.')
    } finally {
      setReading(false)
    }
  }

  const words = work.trim() ? work.trim().split(/\s+/).length : 0
  const ready = Boolean(participant.trim()) && preparation !== 'unsaid' && authorship !== 'unsaid' && words >= 40

  const arm = () => {
    const setup: TrialSetup = { participant: participant.trim(), preparation, authorship, topic: '' }
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

        <div className="stack gap-4" style={{ marginTop: 24 }}>
          <p className="body-med">And who wrote the passage?</p>
          <p className="meta dim">
            Separate question. Reading the paper and writing the words are different things,
            and Probe is supposed to care about the first.
          </p>
        </div>
        <div className="stack gap-10" style={{ marginTop: 10 }}>
          {AUTHORSHIP.map((option) => {
            const on = authorship === option.id
            return (
              <button
                key={option.id}
                className={`card${on ? ' chosen' : ''}`}
                style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}
                onClick={() => setAuthorship(option.id)}
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

        {!onBegin && (
          <div className="row gap-8" style={{ marginTop: 16 }}>
            <button
              className="btn"
              onClick={arm}
              disabled={!participant.trim() || preparation === 'unsaid' || authorship === 'unsaid'}
            >
              {armed ? 'Update' : 'Start recording'}
            </button>
            {armed && (
              <button className="btn quiet" onClick={disarm}>
                Stop
              </button>
            )}
          </div>
        )}

        {onBegin && (
          <>
            <div className="stack gap-4" style={{ marginTop: 24 }}>
              <p className="body-med">What they wrote about it</p>
              <p className="meta dim">
                Their passage on {readingLabel}. Upload it or paste it — the questions come
                from this, and can only be answered out of the reading, which is the point.
              </p>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,.markdown,.csv,.json,.html,text/plain,application/pdf"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void takeFile(file)
              }}
            />
            <button
              className="btn quiet"
              onClick={() => fileRef.current?.click()}
              disabled={reading}
              style={{ marginTop: 10 }}
            >
              {reading ? 'Reading…' : work ? 'Upload a different file' : 'Upload their passage'}
            </button>
            {uploadError && (
              <p className="meta" style={{ marginTop: 6, color: 'var(--alarm, inherit)' }}>
                {uploadError}
              </p>
            )}

            <textarea
              className="field"
              value={work}
              rows={6}
              placeholder="Or paste their paragraph about the reading here…"
              onChange={(event) => setWork(event.target.value)}
              style={{ marginTop: 10 }}
            />
            <p className="micro dimmer" style={{ marginTop: 6 }}>
              {words < 40
                ? `${words} words — about 150 to 250 works best`
                : `${words} words`}
            </p>

            {error && (
              <div className="notice row" style={{ marginTop: 12 }}>
                <span className="meta">{error}</span>
              </div>
            )}

            <button
              className="btn"
              onClick={() => {
                arm()
                onBegin(work.trim())
              }}
              disabled={!ready}
              style={{ marginTop: 14 }}
            >
              Begin the session
            </button>
            <p className="meta dim" style={{ marginTop: 8 }}>
              {ready
                ? `Starts the examination and records it as ${participant.trim()}. Hand the machine over once it begins.`
                : 'Needs a code, both answers above, and about forty words of their writing.'}
            </p>
          </>
        )}

        {armed && !onBegin && (
          <div className="notice row" style={{ marginTop: 14 }}>
            <span className="meta">
              Recording <strong>{participant.trim()}</strong>. Go back and run the session as normal.
            </span>
          </div>
        )}

        {(onChangeReading || onChangeBrain) && (
          <div className="row gap-8" style={{ marginTop: 16, flexWrap: 'wrap' }}>
            {onChangeReading && (
              <button className="btn quiet small" onClick={onChangeReading}>
                Change reading
              </button>
            )}
            {onChangeBrain && (
              <button className="btn quiet small" onClick={onChangeBrain}>
                Examiner settings
              </button>
            )}
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

            <div className="stack gap-4" style={{ marginTop: 26 }}>
              <p className="body-med">Where each one stopped</p>
              <p className="meta dim">
                What they said about the reading that it bears out, and what it does not. Not
                a mark — the thing a student can act on and a lecturer can teach to.
              </p>
            </div>
            <div className="stack gap-10" style={{ marginTop: 10 }}>
              {sessions.map((session) => {
                const b = boundaryOf(session.grade)
                return (
                  <div key={session.startedAt} className="card flat" style={{ alignItems: 'flex-start', gap: 6 }}>
                    <span className="row gap-8">
                      <span className="card-title">{session.participant}</span>
                      <span className="chip">{session.preparation}</span>
                      <span className="chip">{session.authorship ?? 'unsaid'}</span>
                    </span>
                    <span className="meta">{boundaryLine(b)}</span>
                    {b.held.length > 0 && (
                      <span className="micro dim">Held: {b.held.slice(0, 3).join(' · ')}</span>
                    )}
                    {b.unsupported.length > 0 && (
                      <span className="micro dim">Not borne out: {b.unsupported.slice(0, 3).join(' · ')}</span>
                    )}
                    {b.wrong.length > 0 && (
                      <span className="micro dim">Contradicted by the reading: {b.wrong.slice(0, 2).join(' · ')}</span>
                    )}
                  </div>
                )
              })}
            </div>

            {sessions.length > 1 && (
              <>
                <div className="stack gap-4" style={{ marginTop: 26 }}>
                  <p className="body-med">Across the class</p>
                  <p className="meta dim">
                    Grouped by which part of the reading each claim was checked against, so the
                    topics come out of the exchanges rather than from anyone labelling them.
                    Nobody is named.
                  </p>
                </div>
                {(() => {
                  const report = classReport(sessions, readingDocs())
                  if (!report.students) {
                    return (
                      <p className="meta dim" style={{ marginTop: 10 }}>
                        Nothing checkable has been said about the reading yet.
                      </p>
                    )
                  }
                  return (
                    <div className="stack gap-12" style={{ marginTop: 12 }}>
                      {report.shared.length > 0 && (
                        <div className="card flat" style={{ alignItems: 'flex-start', gap: 6 }}>
                          <span className="card-title">Believed by more than one of them, and not in the reading</span>
                          {report.shared.slice(0, 4).map((claim) => (
                            <span key={claim.text} className="meta">
                              <strong>{claim.students} of {report.students}</strong> — {claim.text}
                            </span>
                          ))}
                          <span className="micro dimmer">
                            The same wrong idea in several heads usually comes from the teaching
                            rather than the reading.
                          </span>
                        </div>
                      )}

                      <div className="card flat" style={{ alignItems: 'flex-start', gap: 8 }}>
                        <span className="card-title">
                          Thinnest parts of the reading{readingNames.length > 1 ? 's' : ''}
                        </span>
                        {report.topics.slice(0, 4).map((topic) => (
                          <span key={topic.passage} className="stack gap-4" style={{ width: '100%' }}>
                            <span className="meta">
                              <strong>{topic.held} of {report.students}</strong> said something about this the
                              reading bears out
                              {topic.missed > 0 && ` · ${topic.missed} tried and missed`}
                              {topic.silent > 0 && ` · ${topic.silent} never went near it`}
                              {readingNames.length > 1 && topic.docName && ` — ${topic.docName}`}
                            </span>
                            <span className="micro dimmer">“{topic.excerpt}…”</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </>
            )}

            <div className="rule" style={{ margin: '26px 0 22px' }} />

            <div className="stack gap-4">
              <p className="body-med">Read them back blind</p>
              <p className="meta dim">
                Shuffled, with the codes, self-reports and scores hidden, so your own read of
                each transcript counts as an independent judgment. Everything is revealed side
                by side at the end.
              </p>
            </div>
            <button className="btn" onClick={onReview} style={{ marginTop: 10 }}>
              Start blind review
            </button>

            <div className="rule" style={{ margin: '24px 0 20px' }} />

            <div className="row gap-8">
              <button className="btn quiet" onClick={() => exportSessions(sessions)}>
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
