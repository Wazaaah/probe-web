import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Session } from '../Session'
import { Examiner } from '../../lib/examiner'
import { UnreadableFile, readDocument } from '../../lib/doc'
import { boundaryLine, boundaryOf, studentReportText } from '../../lib/report'
import { downloadReport, readingsByWeek, saveExam, updateExamGrade, type ExamRecord, type Reading } from '../../lib/roster'
import { studentFromFilename, type Student } from '../../lib/student'
import type { QuestionPath } from '../../data/types'
import type { ProbeStore } from '../../lib/store'

type Stage = 'setup' | 'building' | 'session' | 'report'

/**
 * One student, one meeting, one reading picked by hand — because a submission carries no
 * signal of which week it answers, so nothing here can guess that for the lecturer.
 * Ends by showing the boundary report directly, never a score, never hidden: the report
 * belongs to the lecturer, who decides from there whether and how a student sees it.
 */
export function RunExam({ store }: { store: ProbeStore }) {
  const [readings] = useState<Reading[]>(readingsByWeek)
  const [readingId, setReadingId] = useState(readings[0]?.id ?? '')
  const reading = readings.find((r) => r.id === readingId) ?? null

  const [file, setFile] = useState<File | null>(null)
  const [work, setWork] = useState('')
  const [student, setStudent] = useState<Student | null>(null)
  const [manualName, setManualName] = useState('')
  const [manualIndex, setManualIndex] = useState('')
  const [reading2, setReading2] = useState(false)
  const [error, setError] = useState('')

  const [stage, setStage] = useState<Stage>('setup')
  const [path, setPath] = useState<QuestionPath | null>(null)
  const [record, setRecord] = useState<ExamRecord | null>(null)
  const [downloaded, setDownloaded] = useState(false)
  const [regrading, setRegrading] = useState(false)

  const takeFile = async (picked: File) => {
    setError('')
    setReading2(true)
    setFile(picked)
    const parsed = studentFromFilename(picked.name)
    setStudent(parsed)
    if (!parsed) {
      setManualName('')
      setManualIndex('')
    }
    try {
      setWork(await readDocument(picked))
    } catch (err) {
      setError(err instanceof UnreadableFile ? err.message : 'That file could not be read in the browser.')
      setFile(null)
    } finally {
      setReading2(false)
    }
  }

  const identified = student ?? (manualName.trim() && manualIndex.trim() ? { name: manualName.trim(), indexNumber: manualIndex.trim() } : null)
  const ready = Boolean(reading && work.trim() && identified)

  const begin = async () => {
    if (!reading || !identified) return
    setStage('building')
    const paths = store.brain
      ? await store.brain.buildPaths('their passage', work, { sources: reading.docs, index: reading.index })
      : null
    const first = paths?.[0] ?? null
    if (!first) {
      setError('Could not write questions from that passage. Check the model settings, or try a different file.')
      setStage('setup')
      return
    }
    setPath(first)
    setStage('session')
  }

  const finish = async (examiner: Examiner) => {
    if (!reading || !identified) return
    setStage('building')
    const startedAt = Date.now()
    const [summary, grade] = await Promise.all([
      path && store.brain ? store.brain.summarise(path, examiner.answers).catch(() => null) : null,
      store.brain ? store.brain.grade(examiner.answers, reading.docs, work).catch(() => null) : null,
    ])
    const finished: ExamRecord = {
      id: `${startedAt}`,
      readingId: reading.id,
      student: identified,
      submittedAs: file?.name ?? '',
      work,
      startedAt,
      endedAt: Date.now(),
      answers: examiner.answers,
      score: summary?.score ?? examiner.score(),
      grade,
    }
    saveExam(finished)
    setRecord(finished)
    setStage('report')
  }

  /** The transcript is already there — a failed check can be retried without putting the
   *  student through the exam again. */
  const retryGrade = async () => {
    if (!record || !reading || !store.brain) return
    setRegrading(true)
    const grade = await store.brain.grade(record.answers, reading.docs, record.work).catch(() => null)
    const next = grade ?? record.grade
    const score = grade && !grade.checkFailed ? grade.score : record.score
    if (next) updateExamGrade(record.id, next, score)
    setRecord({ ...record, grade: next, score })
    setRegrading(false)
  }

  const reset = () => {
    setFile(null)
    setWork('')
    setStudent(null)
    setManualName('')
    setManualIndex('')
    setPath(null)
    setRecord(null)
    setDownloaded(false)
    setStage('setup')
  }

  if (stage === 'session' && path && reading) {
    return (
      <Session
        path={path}
        brain={store.brain}
        ground={{ work, docs: reading.docs, index: reading.index }}
        onStart={() => {}}
        onPause={() => setStage('setup')}
        onFinish={(examiner) => void finish(examiner)}
      />
    )
  }

  if (stage === 'building') {
    return (
      <div className="pa-stack pa-gap-8" style={{ alignItems: 'center', padding: '60px 0', textAlign: 'center' }}>
        <p className="pa-h2">{record === null && path === null ? 'Reading the submission' : 'Writing the report'}</p>
        <p className="pa-lede">A few seconds.</p>
      </div>
    )
  }

  if (stage === 'report' && record) {
    const boundary = boundaryOf(record.grade)
    const text = studentReportText(record.student.name, record.student.indexNumber, reading?.week ?? '', boundary)
    return (
      <div className="pa-stack pa-gap-20">
        <div className="pa-stack pa-gap-6">
          <h1 className="pa-h1">{record.student.name}</h1>
          <p className="pa-lede">{record.student.indexNumber} · {reading?.week}</p>
        </div>
        <div className="pa-card pa-stack pa-gap-10" style={boundary.checkFailed ? { borderColor: 'var(--pa-bad)' } : undefined}>
          <span className="pa-body" style={{ fontWeight: 600, color: boundary.checkFailed ? 'var(--pa-bad)' : undefined }}>
            {boundaryLine(boundary)}
          </span>
          {boundary.held.length > 0 && <span className="pa-meta">Held: {boundary.held.slice(0, 4).join(' · ')}</span>}
          {boundary.unsupported.length > 0 && <span className="pa-meta">Not borne out: {boundary.unsupported.slice(0, 4).join(' · ')}</span>}
          {boundary.wrong.length > 0 && <span className="pa-meta">Contradicted: {boundary.wrong.slice(0, 4).join(' · ')}</span>}
          <button
            className={boundary.checkFailed ? 'pa-btn' : 'pa-btn quiet'}
            style={{ alignSelf: 'flex-start' }}
            disabled={regrading}
            onClick={() => void retryGrade()}
          >
            {regrading ? 'Re-grading…' : boundary.checkFailed ? 'Retry grading' : 'Re-grade'}
          </button>
        </div>
        {!boundary.checkFailed && (
          <div className="pa-row pa-gap-10">
            <button
              className="pa-btn"
              onClick={() => {
                downloadReport(`${record.student.indexNumber}-${record.student.name.replace(/\s+/g, '-')}.txt`, text)
                setDownloaded(true)
              }}
            >
              Download report
            </button>
            <button className="pa-btn quiet" onClick={reset}>
              Run another exam
            </button>
          </div>
        )}
        {boundary.checkFailed && (
          <button className="pa-btn quiet" style={{ alignSelf: 'flex-start' }} onClick={reset}>
            Run another exam
          </button>
        )}
        {downloaded && <span className="pa-meta">Downloaded. Distribute it however this course does.</span>}
      </div>
    )
  }

  return (
    <div className="pa-stack pa-gap-20">
      <div className="pa-stack pa-gap-6">
        <h1 className="pa-h1">Run an exam</h1>
        <p className="pa-lede">One student, sitting down now. Pick which reading their submission answers, then upload their file.</p>
      </div>

      <div className="pa-card pa-stack pa-gap-16">
        <div className="pa-stack pa-gap-4">
          <span className="pa-h3">Which reading?</span>
          {readings.length === 0 ? (
            <span className="pa-meta">No readings uploaded yet. Add one under Readings first.</span>
          ) : (
            <select className="pa-field" value={readingId} onChange={(event) => setReadingId(event.target.value)} style={{ maxWidth: 320 }}>
              {readings.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.week} ({r.docs.length} reading{r.docs.length === 1 ? '' : 's'})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="pa-stack pa-gap-4">
          <span className="pa-h3">Their submission</span>
          <span className="pa-meta">Saved as IndexNumber_First_Last. Their name and index number come straight off the filename.</span>
          <label className="pa-dashed" style={{ marginTop: 6 }}>
            <input
              type="file"
              hidden
              accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json,.html,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => {
                const picked = event.target.files?.[0] ?? null
                event.target.value = ''
                if (picked) void takeFile(picked)
              }}
            />
            <Icon name="upload" size={20} color="var(--pa-accent)" />
            <span className="pa-body" style={{ fontWeight: 600 }}>
              {reading2 ? 'Reading…' : file ? file.name : 'Upload their submission'}
            </span>
          </label>
        </div>

        {file && !student && (
          <div className="pa-notice" style={{ background: 'var(--pa-bg)', color: 'var(--pa-ink)' }}>
            <Icon name="close" size={16} color="var(--pa-warn)" />
            <span className="pa-stack pa-gap-8" style={{ width: '100%' }}>
              <span>Couldn't find a name and index number in that filename. Enter them by hand.</span>
              <span className="pa-row pa-gap-8">
                <input className="pa-field" placeholder="Full name" value={manualName} onChange={(e) => setManualName(e.target.value)} />
                <input className="pa-field" placeholder="Index number" value={manualIndex} onChange={(e) => setManualIndex(e.target.value)} />
              </span>
            </span>
          </div>
        )}

        {student && (
          <div className="pa-row pa-gap-8">
            <span className="pa-avatar">{student.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}</span>
            <span className="pa-stack pa-gap-4">
              <span className="pa-body" style={{ fontWeight: 600 }}>{student.name}</span>
              <span className="pa-micro">{student.indexNumber}</span>
            </span>
          </div>
        )}

        {error && (
          <div className="pa-notice">
            <Icon name="close" size={16} color="var(--pa-bad)" />
            <span>{error}</span>
          </div>
        )}

        <button className="pa-btn" style={{ alignSelf: 'flex-start' }} disabled={!ready} onClick={() => void begin()}>
          Begin
        </button>
      </div>
    </div>
  )
}
