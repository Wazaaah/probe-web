import { useRef, useState } from 'react'
import { BrainSetup } from './BrainSetup'
import { Session } from './Session'
import { Trial } from './Trial'
import { Review } from './Review'
import { TopBar } from '../components/ui'
import { Icon } from '../components/Icon'
import { UnreadableFile, readDocument } from '../lib/doc'
import {
  addSource,
  readingDocs,
  readingIndex,
  recorder,
  removeSource,
  rememberIndex,
  rememberWork,
  workingText,
} from '../lib/trial'
import type { Examiner } from '../lib/examiner'
import type { ProbeStore } from '../lib/store'
import type { SourceDoc } from '../lib/claims'
import type { QuestionPath } from '../data/types'

/**
 * Probe with everything that is not this experiment taken out.
 *
 * The shipped app opens on a choice between two roles, because the product is one person
 * examining another's work. None of that applies to an afternoon spent finding out
 * whether the judging works: there is one machine and five people taking turns at it. A
 * role chooser, a pairing code, an inbox and a library are all things a participant has
 * to be walked past before answering a question, and each is a chance for the session to
 * start badly.
 *
 * The reading list is genuinely a list — a course reads more than one thing, and treating
 * it as a single document meant the second, third and tenth reading simply were not
 * there. Each person still brings a short passage they wrote about it. The questions come
 * from what THEY wrote and can only be answered out of the reading(s) — which is the
 * point, and the reason a paragraph produced by someone who never opened the source is
 * the case worth catching.
 *
 * Questions are therefore built per participant and differ between them. That is correct
 * and costs nothing here: the comparison at the end is each transcript against a blind
 * human read of that same transcript, which never required two people to have been asked
 * the same thing.
 */

type Stage = 'brain' | 'reading' | 'indexing' | 'console' | 'building' | 'session' | 'recorded' | 'review'

/**
 * Whether the examiner has been set up at least once.
 *
 * Not the same question as "is there a model configured": the in-page option is a
 * legitimate choice and leaves `store.brain` null, so booting on that would trap anyone
 * who picked it on the setup screen forever, reload after reload.
 */
const READY = 'probe.trial.ready'

const settled = (): boolean => {
  try {
    return localStorage.getItem(READY) === 'yes'
  } catch {
    return false
  }
}

const settle = (): void => {
  try {
    localStorage.setItem(READY, 'yes')
  } catch {
    /* private browsing: setup is asked for again next reload, which is survivable */
  }
}

/** Rough word count, for showing someone what they just uploaded. */
const wordsIn = (text: string) => (text.match(/\S+/g) ?? []).length

export function TrialApp({ store }: { store: ProbeStore }) {
  const [docs, setDocs] = useState<SourceDoc[]>(() => readingDocs())
  const [reading, setReading] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteName, setPasteName] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [readingError, setReadingError] = useState('')
  const [stage, setStage] = useState<Stage>(() => {
    if (!settled()) return 'brain'
    return readingDocs().length ? 'console' : 'reading'
  })
  const [path, setPath] = useState<QuestionPath | null>(null)
  const [failed, setFailed] = useState('')
  const startedAt = useRef(Date.now())
  const fileRef = useRef<HTMLInputElement>(null)

  /**
   * Build this participant's questions from their own passage, against the reading list.
   *
   * Done when they sit down rather than up front, because the questions depend on what
   * they wrote. It takes a few seconds and the screen says so — a participant staring at
   * a blank pane assumes the thing has crashed.
   */
  const begin = async (work: string) => {
    rememberWork(work)
    setFailed('')
    setStage('building')
    const paths = store.brain
      ? await store.brain.buildPaths('their passage', work, { sources: readingDocs(), index: readingIndex() })
      : null
    const first = paths?.[0] ?? null
    if (!first) {
      setFailed('Could not write questions from that passage. Check the examiner key, or try a longer passage.')
      setStage('console')
      return
    }
    setPath(first)
    setStage('session')
  }

  /**
   * The score is computed and kept, but the participant is not shown it.
   *
   * It comes from the judge this whole exercise exists to test, and we already know it
   * ranks a confident bluffer above an honest hesitant student. Showing someone a mark
   * from it would be unfair to them and would colour the next thing they say.
   */
  const finish = async (examiner: Examiner) => {
    const local = examiner.score()
    setStage('recorded')

    // Both scores are taken. The holistic one is what ships; the claim count is what the
    // testing says should replace it. Recording them side by side is the only way to find
    // out which tracks a human reading of the same transcript.
    const [summary, grade] = await Promise.all([
      path && store.brain ? store.brain.summarise(path, examiner.answers).catch(() => null) : null,
      store.brain ? store.brain.grade(examiner.answers, readingDocs(), workingText()).catch(() => null) : null,
    ])
    recorder.finish(examiner.answers, summary?.score ?? local, grade)
  }

  /** Add one file to the reading list. One bad file in a batch must not lose the rest. */
  const addFile = async (file: File) => {
    setReadingError('')
    try {
      const text = await readDocument(file)
      const doc = { name: file.name, text }
      addSource(doc)
      setDocs(readingDocs())
    } catch (error) {
      setReadingError(
        `${file.name}: ${error instanceof UnreadableFile ? error.message : 'could not be read in the browser.'}`,
      )
    }
  }

  const addFiles = async (files: FileList) => {
    setReading(true)
    for (const file of Array.from(files)) await addFile(file)
    setReading(false)
  }

  /**
   * Build (or extend) the topic index, then move on.
   *
   * Only new readings are summarised — `store.brain.indexDocuments` skips anything
   * already in the index it was handed — so adding an eleventh reading to a list of ten
   * does not re-summarise the other ten.
   */
  const proceedToConsole = async () => {
    if (!store.brain || docs.length < 2) {
      setStage('console')
      return
    }
    setStage('indexing')
    const built = await store.brain.indexDocuments(docs, readingIndex() ?? []).catch(() => readingIndex() ?? [])
    rememberIndex(built)
    setStage('console')
  }

  if (stage === 'brain')
    return (
      <BrainSetup
        store={store}
        onBack={() => {
          settle()
          setStage(readingDocs().length ? 'console' : 'reading')
        }}
      />
    )

  if (stage === 'reading')
    return (
      <div className="pane">
        <TopBar title="The reading list" onBack={() => setStage(docs.length ? 'console' : 'brain')} />
        <div className="scroll pad">
          <p className="body dim" style={{ padding: '4px 0 18px' }}>
            Upload what everybody was set — the source itself, not an essay about it. One
            file or several; each person brings their own passage about it when they sit
            down.
          </p>

          {docs.length > 0 && (
            <div className="stack gap-10" style={{ marginBottom: 18 }}>
              {docs.map((doc) => (
                <div key={doc.name} className="card flat" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <span className="grow stack gap-4">
                    <span className="card-title">{doc.name}</span>
                    <span className="micro dimmer">{wordsIn(doc.text).toLocaleString()} words</span>
                  </span>
                  <button
                    className="icon-btn"
                    aria-label={`Remove ${doc.name}`}
                    onClick={() => {
                      removeSource(doc.name)
                      setDocs(readingDocs())
                    }}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {readingError && (
            <div className="notice row" style={{ alignItems: 'flex-start', marginBottom: 14 }}>
              <Icon name="close" size={18} />
              <span className="meta grow">{readingError}</span>
            </div>
          )}

          {pasteOpen ? (
            <div className="stack gap-12">
              <input
                className="field"
                placeholder="What is it called?"
                value={pasteName}
                onChange={(event) => setPasteName(event.target.value)}
              />
              <textarea
                className="field"
                placeholder="Paste the text here"
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
              />
              <button
                className="btn"
                disabled={pasteText.trim().length < 80}
                onClick={() => {
                  addSource({ name: pasteName.trim() || `Reading ${docs.length + 1}`, text: pasteText })
                  setDocs(readingDocs())
                  setPasteName('')
                  setPasteText('')
                  setPasteOpen(false)
                }}
              >
                Add to the list
              </button>
              <button className="btn ghost" onClick={() => setPasteOpen(false)}>
                Choose files instead
              </button>
            </div>
          ) : (
            <div className="stack gap-12">
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".pdf,.txt,.md,.markdown,.csv,.json,.html,text/plain,application/pdf"
                hidden
                onChange={(event) => {
                  const files = event.target.files
                  event.target.value = ''
                  if (files?.length) void addFiles(files)
                }}
              />
              <button
                className="card dashed"
                style={{ alignItems: 'center', gap: 8, padding: '32px 16px' }}
                onClick={() => fileRef.current?.click()}
                disabled={reading}
              >
                <span className="tile lg">
                  <Icon name={reading ? 'spark' : 'upload'} size={22} />
                </span>
                <span className="body-med">{reading ? 'Reading…' : docs.length ? 'Add more' : 'Choose files'}</span>
                <span className="micro dimmer">PDF or plain text — select several at once if you like</span>
              </button>
              <button className="btn quiet" onClick={() => setPasteOpen(true)}>
                Paste text instead
              </button>
            </div>
          )}

          {docs.length > 0 && (
            <button className="btn" style={{ marginTop: 20 }} onClick={() => void proceedToConsole()}>
              Done — {docs.length} reading{docs.length === 1 ? '' : 's'}
            </button>
          )}

          <div className="spacer-48" />
        </div>
      </div>
    )

  if (stage === 'indexing')
    return (
      <div className="pane">
        <div className="scroll pad" style={{ display: 'grid', placeItems: 'center', minHeight: '70vh' }}>
          <div className="stack gap-12" style={{ textAlign: 'center', maxWidth: 340 }}>
            <p className="display">Connecting the readings</p>
            <p className="body dim">
              A line on what each one covers, so a question can reach across them when it is
              genuinely relevant. A few seconds per reading.
            </p>
          </div>
        </div>
      </div>
    )

  if (stage === 'review') return <Review onLeave={() => setStage('console')} brain={store.brain} />

  if (stage === 'building')
    return (
      <div className="pane">
        <div className="scroll pad" style={{ display: 'grid', placeItems: 'center', minHeight: '70vh' }}>
          <div className="stack gap-12" style={{ textAlign: 'center', maxWidth: 340 }}>
            <p className="display">Reading it</p>
            <p className="body dim">Working out what to ask about this passage. A few seconds.</p>
          </div>
        </div>
      </div>
    )

  if (stage === 'session' && path)
    return (
      <div className="frame bare">
        <Session
          path={path}
          brain={store.brain}
          onStart={() => {
            startedAt.current = Date.now()
            recorder.begin()
          }}
          onPause={() => setStage('console')}
          onFinish={(examiner) => void finish(examiner)}
        />
      </div>
    )

  /**
   * What the participant sees when it is over. Deliberately nothing: no score, no
   * breakdown, no verdict. They answered questions and that is the end of their part.
   */
  if (stage === 'recorded')
    return (
      <div className="pane">
        <div className="scroll pad" style={{ display: 'grid', placeItems: 'center', minHeight: '70vh' }}>
          <div className="stack gap-12" style={{ textAlign: 'center', maxWidth: 320 }}>
            <p className="display">Done</p>
            <p className="body dim">Thank you — that is recorded. Please hand the machine back.</p>
            <button className="btn" onClick={() => setStage('console')}>
              Next participant
            </button>
          </div>
        </div>
      </div>
    )

  return (
    <Trial
      onLeave={() => setStage('reading')}
      onReview={() => setStage('review')}
      onBegin={(work) => void begin(work)}
      readingNames={docs.map((d) => d.name)}
      error={failed}
      onChangeReading={() => setStage('reading')}
      onChangeBrain={() => setStage('brain')}
    />
  )
}
