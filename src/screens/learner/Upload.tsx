import { useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { TopBar } from '../../components/ui'
import { UnreadableFile, readDocument } from '../../lib/doc'
import { SEED_PATHS } from '../../data/sample'
import type { Brain } from '../../lib/brain'
import type { QuestionPath } from '../../data/types'

type Stage = 'pick' | 'paste' | 'reading' | 'thinking' | 'failed'

const STEPS = ['Reading the document', 'Finding what can be attacked', 'Writing four angles']

/**
 * Turning a document into four angles.
 *
 * The learner never sees what comes out of this — the four angles go straight to the
 * reviewer, who picks one. That asymmetry is the product, so it is stated on the screen.
 */
export function Upload({
  brain,
  onSent,
  onBack,
}: {
  brain: Brain | null
  onSent: (document: string, paths: QuestionPath[]) => void
  onBack: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>('pick')
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [pasted, setPasted] = useState('')
  const [problem, setProblem] = useState('')

  const build = async (documentName: string, text: string) => {
    setName(documentName)
    setStage('thinking')
    setStep(1)

    if (!brain) {
      // Without a model there is nothing to write angles with, so the seeded four stand
      // in — the handoff still demonstrates end to end.
      await new Promise((resolve) => setTimeout(resolve, 900))
      onSent(documentName, SEED_PATHS)
      return
    }

    const paths = await brain.buildPaths(documentName, text)
    setStep(2)
    if (!paths) {
      setProblem('The examiner could not write angles for that. Check the key under Examiner, or try a shorter document.')
      setStage('failed')
      return
    }
    onSent(documentName, paths)
  }

  const take = async (file: File) => {
    setName(file.name)
    setStage('reading')
    setStep(0)
    try {
      const text = await readDocument(file)
      await build(file.name, text)
    } catch (error) {
      setProblem(error instanceof UnreadableFile ? error.message : 'That file could not be read in the browser.')
      setStage('failed')
    }
  }

  if (stage === 'reading' || stage === 'thinking') {
    return (
      <div className="pane">
        <TopBar title="" rule={false} />
        <div className="scroll pad stack" style={{ justifyContent: 'center', textAlign: 'center' }}>
          <div className="stack gap-20" style={{ alignItems: 'center', padding: '0 8px' }}>
            <span className="tile lg solid shimmer" style={{ width: 64, height: 64, borderRadius: 20 }}>
              <Icon name="spark" size={26} color="var(--surface)" />
            </span>
            <div className="stack gap-8">
              <p className="title">{STEPS[step]}</p>
              <p className="meta dim">{name}</p>
            </div>
            <div className="stack gap-10" style={{ width: '100%', maxWidth: 260 }}>
              <div className="track">
                <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
              </div>
              <p className="micro dimmer">
                {brain ? 'Nothing leaves this browser except the text.' : 'No model configured — using the sample angles.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pane">
      <TopBar title="New document" onBack={onBack} />
      <div className="scroll pad">
        <p className="body dim" style={{ padding: '4px 0 20px' }}>
          Probe reads it, writes four ways of attacking it, and sends all four to your reviewer. They choose one. You
          only ever see the one they chose.
        </p>

        {stage === 'failed' && (
          <div className="notice row" style={{ alignItems: 'flex-start', marginBottom: 16 }}>
            <Icon name="close" size={18} />
            <span className="meta grow">{problem}</span>
          </div>
        )}

        {stage === 'paste' ? (
          <div className="stack gap-12">
            <input
              className="field"
              placeholder="What is it called?"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <textarea
              className="field"
              placeholder="Paste the text here"
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
            />
            <button
              className="btn"
              disabled={pasted.trim().length < 80}
              onClick={() => void build(name.trim() || 'Pasted document', pasted)}
            >
              Send it for angles
            </button>
            <button className="btn ghost" onClick={() => setStage('pick')}>
              Choose a file instead
            </button>
          </div>
        ) : (
          <div className="stack gap-12">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,.markdown,.csv,.json,.html,text/plain,application/pdf"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void take(file)
              }}
            />
            <button
              className="card dashed"
              style={{ alignItems: 'center', gap: 8, padding: '32px 16px' }}
              onClick={() => fileRef.current?.click()}
            >
              <span className="tile lg">
                <Icon name="upload" size={22} />
              </span>
              <span className="body-med">Choose a file</span>
              <span className="micro dimmer">PDF or plain text</span>
            </button>
            <button className="btn quiet" onClick={() => setStage('paste')}>
              Paste text instead
            </button>
            <p className="micro dimmer" style={{ textAlign: 'center' }}>
              A scanned PDF has no text to read. Paste it in and it works the same.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
