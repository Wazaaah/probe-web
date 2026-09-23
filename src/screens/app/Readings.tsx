import { useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { citationsAmong } from '../../lib/documents'
import { UnreadableFile, readDocument } from '../../lib/doc'
import { loadReadings, readingsByWeek, rememberReadingIndex, saveReading, type Reading } from '../../lib/roster'
import type { SourceDoc } from '../../lib/claims'
import type { ProbeStore } from '../../lib/store'

const wordsIn = (text: string) => (text.match(/\S+/g) ?? []).length

/**
 * The reading list, built up week by week rather than set once.
 *
 * Nothing here ever gets archived: a submission carries no signal of which week it
 * answers, so a lecturer has to be able to pick an old reading just as easily as this
 * week's — a late submission, or a catch-up session, needs it there. The newest week
 * opens expanded; everything before it collapses but stays searchable.
 */
export function Readings({ store }: { store: ProbeStore }) {
  const [readings, setReadings] = useState<Reading[]>(readingsByWeek)
  const [open, setOpen] = useState<Set<string>>(() => new Set(readings[0] ? [readings[0].id] : []))
  const [week, setWeek] = useState('')
  const [docs, setDocs] = useState<SourceDoc[]>([])
  const [progress, setProgress] = useState<{ name: string; done: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const addFile = async (file: File) => {
    setError('')
    setProgress({ name: file.name, done: 0, total: 1 })
    try {
      const text = await readDocument(file, (done, total) => setProgress({ name: file.name, done, total }))
      setDocs((prev) => [...prev.filter((d) => d.name !== file.name), { name: file.name, text }])
    } catch (err) {
      setError(`${file.name}: ${err instanceof UnreadableFile ? err.message : 'could not be read in the browser.'}`)
    } finally {
      setProgress(null)
    }
  }

  const addToWeek = async () => {
    if (!week.trim() || docs.length === 0) return
    setSaving(true)
    const reading: Reading = { id: `${Date.now()}`, week: week.trim(), uploadedAt: Date.now(), docs, index: null }
    saveReading(reading)
    if (store.brain && docs.length > 1) {
      const built = await store.brain.indexDocuments(docs).catch(() => null)
      if (built) rememberReadingIndex(reading.id, built)
    }
    setReadings(readingsByWeek())
    setOpen((prev) => new Set([reading.id, ...prev]))
    setWeek('')
    setDocs([])
    setSaving(false)
  }

  return (
    <div className="pa-stack pa-gap-20">
      <div className="pa-stack pa-gap-6">
        <h1 className="pa-h1">Readings</h1>
        <p className="pa-lede">
          Readings are added week by week, not all at once, and none of them are ever
          removed.
        </p>
      </div>

      <div className="pa-card pa-stack pa-gap-14">
        <span className="pa-h3">Add this week's reading</span>
        <input
          className="pa-field"
          placeholder="e.g. Week 6, or the date"
          value={week}
          onChange={(event) => setWeek(event.target.value)}
          style={{ maxWidth: 280 }}
        />

        {docs.length > 0 && (
          <div className="pa-list">
            {docs.map((doc) => (
              <div key={doc.name} className="pa-list-row">
                <span className="pa-icon-chip"><Icon name="doc" size={16} /></span>
                <span className="pa-grow pa-stack pa-gap-4">
                  <span className="pa-body" style={{ fontWeight: 600 }}>{doc.name}</span>
                  <span className="pa-micro">{wordsIn(doc.text).toLocaleString()} words</span>
                </span>
                <button
                  className="pa-btn quiet"
                  onClick={() => setDocs((prev) => prev.filter((d) => d.name !== doc.name))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="pa-notice">
            <Icon name="close" size={16} color="var(--pa-bad)" />
            <span>{error}</span>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json,.html,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          hidden
          onChange={(event) => {
            // Copy files out of the FileList BEFORE clearing .value — clearing it empties
            // that same live FileList in place, so reading it after would always see zero.
            const files = event.target.files ? Array.from(event.target.files) : []
            event.target.value = ''
            for (const file of files) void addFile(file)
          }}
        />
        <button className="pa-dashed" onClick={() => fileRef.current?.click()} disabled={!!progress}>
          <Icon name="upload" size={20} color="var(--pa-accent)" />
          <span className="pa-body" style={{ fontWeight: 600 }}>
            {progress ? (progress.total > 1 ? `Reading page ${progress.done} of ${progress.total}…` : `Reading ${progress.name}…`) : 'Choose files'}
          </span>
          <span className="pa-micro">PDF, Word (.docx) or plain text. Add several at once if you like.</span>
        </button>

        <button className="pa-btn" style={{ alignSelf: 'flex-start' }} disabled={!week.trim() || docs.length === 0 || saving} onClick={() => void addToWeek()}>
          {saving ? 'Adding…' : 'Add to the reading list'}
        </button>
      </div>

      <div className="pa-stack pa-gap-10">
        {readings.length === 0 && <div className="pa-empty">No readings yet. Add this week's above.</div>}
        {readings.map((reading) => {
          const expanded = open.has(reading.id)
          const links = reading.docs.length > 1 ? citationsAmong(reading.docs) : []
          return (
            <div key={reading.id} className="pa-card pa-stack pa-gap-10">
              <button
                className="pa-between"
                style={{ width: '100%', cursor: 'pointer' }}
                onClick={() =>
                  setOpen((prev) => {
                    const next = new Set(prev)
                    if (next.has(reading.id)) next.delete(reading.id)
                    else next.add(reading.id)
                    return next
                  })
                }
              >
                <span className="pa-row pa-gap-8">
                  <span className="pa-h3">{reading.week}</span>
                  <span className="pa-chip">{reading.docs.length} reading{reading.docs.length === 1 ? '' : 's'}</span>
                </span>
                <Icon name="chev" size={16} color="var(--pa-ink-dim)" />
              </button>
              {expanded && (
                <div className="pa-list">
                  {reading.docs.map((doc) => {
                    const cites = links.filter((l) => l.from === doc.name).map((l) => l.to)
                    return (
                      <div key={doc.name} className="pa-list-row">
                        <span className="pa-icon-chip"><Icon name="doc" size={16} /></span>
                        <span className="pa-grow pa-stack pa-gap-4">
                          <span className="pa-body" style={{ fontWeight: 600 }}>{doc.name}</span>
                          <span className="pa-micro">
                            {wordsIn(doc.text).toLocaleString()} words
                            {cites.length > 0 && ` · cites ${cites.join(', ')}`}
                          </span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Every reading uploaded so far, newest week first — used by the exam screen to pick one. */
export const allReadings = (): Reading[] => loadReadings()
