import { useMemo, useState } from 'react'
import type { Brain } from '../lib/brain'
import {
  agreementWith,
  boutCount,
  pairsOf,
  rank,
  settle,
  transcriptOf,
  type Bout,
  type Ranked,
} from '../lib/ranking'
import { TopBar } from '../components/ui'
import {
  agreement,
  blindOrder,
  blindTranscript,
  clearReviews,
  compare,
  comparisonTable,
  loadReviews,
  loadSessions,
  saveReview,
} from '../lib/trial'

/**
 * Reading the transcripts back without knowing whose they are.
 *
 * The point of the trial is a comparison, and a comparison needs a column that is neither
 * the app's score nor what the participant said about themselves. That column is your own
 * judgment — but only if it is given blind. Knowing that this one is the person who did
 * not do the reading means finding bluffing in it whether or not any is there, and then
 * the whole exercise measures nothing but your expectations.
 *
 * So: shuffled, unlabelled, one at a time, no score shown, no way back to change an
 * earlier answer once seen. Then everything is revealed at once.
 */
export function Review({ onLeave, brain }: { onLeave: () => void; brain: Brain | null }) {
  const sessions = useMemo(() => loadSessions(), [])
  const ordered = useMemo(() => blindOrder(sessions), [sessions])

  const [reviews, setReviews] = useState(loadReviews())
  const [at, setAt] = useState(() => {
    const done = new Set(loadReviews().map((r) => r.at))
    const next = blindOrder(sessions).findIndex((s) => !done.has(s.startedAt))
    return next < 0 ? blindOrder(sessions).length : next
  })
  const [rating, setRating] = useState(0)
  const [note, setNote] = useState('')
  const [table, setTable] = useState<Ranked[] | null>(null)
  const [running, setRunning] = useState(false)
  const [ties, setTies] = useState(0)

  /**
   * Rank the field by comparing transcripts to each other rather than scoring them.
   *
   * Every pair is asked twice with the transcripts swapped. A judge shown the same two
   * answers in the other order does not always say the same thing, and taking the first
   * reply would bake that position bias into the order. Pairs that contradict themselves
   * are counted as ties, because that is what "A beats B and B beats A" actually means.
   */
  const tournament = async () => {
    if (!brain || sessions.length < 2) return
    setRunning(true)
    const bouts: Bout[] = []
    for (const [x, y] of pairsOf(sessions)) {
      const left = transcriptOf(x)
      const right = transcriptOf(y)
      const [first, second] = await Promise.all([
        brain.compare(left, right).catch(() => null),
        brain.compare(right, left).catch(() => null),
      ])
      bouts.push(settle(x.participant, y.participant, first, second))
    }
    setTies(bouts.filter((b) => !b.winner).length)
    setTable(rank(sessions.map((s) => s.participant), bouts))
    setRunning(false)
  }

  const current = ordered[at] ?? null
  const finished = at >= ordered.length

  const commit = () => {
    if (!current || !rating) return
    saveReview({ at: current.startedAt, rating, note: note.trim() })
    setReviews(loadReviews())
    setRating(0)
    setNote('')
    setAt((i) => i + 1)
  }

  if (!sessions.length) {
    return (
      <div className="pane">
        <TopBar title="Blind review" onBack={onLeave} />
        <div className="scroll pad">
          <p className="body dim" style={{ paddingTop: 8 }}>
            No sessions recorded yet. Run some people through first.
          </p>
        </div>
      </div>
    )
  }

  /* -- the reveal --------------------------------------------------------- */

  if (finished) {
    const rows = compare(sessions, reviews)
    const rho = agreement(rows)
    return (
      <div className="pane">
        <TopBar title="Compared" onBack={onLeave} />
        <div className="scroll pad">
          <p className="body dim" style={{ padding: '4px 0 16px' }}>
            Your blind read beside what the app said and what each person told you beforehand.
          </p>

          <div style={{ overflowX: 'auto' }}>
            <pre
              className="micro"
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                lineHeight: 1.7,
                margin: 0,
                whiteSpace: 'pre',
              }}
            >
              {comparisonTable(rows)}
            </pre>
          </div>

          <div className="notice row" style={{ marginTop: 18 }}>
            <span className="meta">
              {rho == null ? (
                <>Rate at least three transcripts before a correlation means anything.</>
              ) : (
                <>
                  The app ranked people <strong>{describeRho(rho)}</strong> the way you did
                  {' '}(Spearman {rho.toFixed(2)}).{' '}
                  {rho < 0.5
                    ? 'Where it disagreed is the finding — read those rows.'
                    : 'The rows with the largest gap are still the ones worth reading.'}
                </>
              )}
            </span>
          </div>

          {rows.some((r) => r.note) && (
            <div className="stack gap-10" style={{ marginTop: 22 }}>
              <p className="body-med">What you said at the time</p>
              {rows
                .filter((r) => r.note)
                .map((r) => (
                  <div key={r.participant} className="card flat" style={{ alignItems: 'flex-start' }}>
                    <span className="meta">
                      <strong>{r.participant}</strong> · said {r.preparation} · you {r.rating}/5 · app{' '}
                      {r.app ?? '—'}
                    </span>
                    <span className="meta dim">{r.note}</span>
                  </div>
                ))}
            </div>
          )}

          <div className="rule" style={{ margin: '28px 0 22px' }} />

          <div className="stack gap-4">
            <p className="body-med">Or let it rank them by comparison</p>
            <p className="meta dim">
              Instead of scoring each transcript alone, it puts two side by side and picks
              the one that shows more evidence of reading. Every pair is asked twice, with
              the order swapped. In testing this was the most reliable of the judges.
            </p>
          </div>

          {!table && (
            <button
              className="btn"
              onClick={() => void tournament()}
              disabled={!brain || sessions.length < 2 || running}
              style={{ marginTop: 12 }}
            >
              {running ? 'Comparing…' : `Rank them (${boutCount(sessions.length)} comparisons)`}
            </button>
          )}
          {!brain && (
            <p className="meta dim" style={{ marginTop: 8 }}>
              Needs a model — set one under Examiner settings.
            </p>
          )}

          {table && (
            <>
              <div style={{ overflowX: 'auto', marginTop: 14 }}>
                <pre
                  className="micro"
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    lineHeight: 1.7,
                    margin: 0,
                    whiteSpace: 'pre',
                  }}
                >
                  {rankingTable(table, rows)}
                </pre>
              </div>
              {(() => {
                const spearman = agreementWith(
                  table.map((t) => t.participant),
                  new Map(
                    rows
                      .filter((r) => r.rating != null)
                      .slice()
                      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
                      .map((r, i) => [r.participant, i + 1] as [string, number]),
                  ),
                )
                return (
                  <div className="notice row" style={{ marginTop: 14 }}>
                    <span className="meta">
                      {spearman == null
                        ? 'Rate at least three transcripts to compare the two orderings.'
                        : `Its order against yours: Spearman ${spearman.toFixed(2)}.`}
                      {ties > 0 && ` ${ties} pair${ties === 1 ? '' : 's'} it could not separate — it said both ways round.`}
                    </span>
                  </div>
                )
              })()}
            </>
          )}

          <div className="row gap-8" style={{ marginTop: 24 }}>
            <button
              className="btn quiet"
              onClick={() => {
                if (window.confirm('Clear your ratings and read them all again from scratch?')) {
                  clearReviews()
                  setReviews([])
                  setTable(null)
                  setAt(0)
                }
              }}
            >
              Rate again
            </button>
          </div>
          <div className="spacer-48" />
        </div>
      </div>
    )
  }

  /* -- one transcript ----------------------------------------------------- */

  return (
    <div className="pane">
      <TopBar title={`Transcript ${at + 1} of ${ordered.length}`} onBack={onLeave} />
      <div className="scroll pad">
        <p className="meta dim" style={{ paddingTop: 4 }}>
          You are not being told who this is, what they said about their preparation, or what the
          app scored them. That is deliberate.
        </p>

        <div className="card flat" style={{ marginTop: 14, alignItems: 'stretch' }}>
          <pre
            className="meta"
            style={{
              whiteSpace: 'pre-wrap',
              margin: 0,
              lineHeight: 1.65,
              fontFamily: 'inherit',
            }}
          >
            {blindTranscript(current!)}
          </pre>
        </div>

        <div className="stack gap-4" style={{ marginTop: 24 }}>
          <p className="body-med">Does this person understand the reading?</p>
          <p className="meta dim">1 — none of it. 5 — properly, and could be pushed further.</p>
        </div>

        <div className="row gap-8" style={{ marginTop: 10 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className={`btn${rating === n ? '' : ' quiet'}`}
              style={{ flex: 1, minWidth: 0 }}
              onClick={() => setRating(n)}
              aria-pressed={rating === n}
            >
              {n}
            </button>
          ))}
        </div>

        <input
          className="field"
          value={note}
          placeholder="What made you say that? (optional)"
          autoComplete="off"
          onChange={(event) => setNote(event.target.value)}
          style={{ marginTop: 14 }}
        />

        <button className="btn" onClick={commit} disabled={!rating} style={{ marginTop: 16 }}>
          {at + 1 === ordered.length ? 'Rate and reveal' : 'Next transcript'}
        </button>
        <p className="meta dim" style={{ marginTop: 10 }}>
          No going back — a rating you can revise after seeing the next one is not blind.
        </p>
        <div className="spacer-48" />
      </div>
    </div>
  )
}

/** The tournament result beside the blind ratings, for reading on the spot. */
function rankingTable(table: Ranked[], rows: { participant: string; rating: number | null; preparation: string; authorship: string }[]): string {
  const head = ['rank', 'who', 'won', 'tied', 'lost', 'you (1-5)', 'read it', 'wrote it']
  const body = table.map((t, i) => {
    const row = rows.find((r) => r.participant === t.participant)
    return [
      String(i + 1),
      t.participant,
      String(t.wins),
      String(t.ties),
      String(t.losses),
      row?.rating == null ? '—' : String(row.rating),
      row?.preparation ?? '—',
      row?.authorship ?? '—',
    ]
  })
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)))
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ')
  return [line(head), widths.map((w) => '-'.repeat(w)).join('  '), ...body.map(line)].join('\n')
}

/** Plain words for a correlation, because a number alone tells you nothing at this size. */
function describeRho(rho: number): string {
  if (rho >= 0.8) return 'almost exactly'
  if (rho >= 0.5) return 'broadly'
  if (rho >= 0.2) return 'loosely'
  if (rho > -0.2) return 'not really at all'
  return 'close to backwards from'
}
