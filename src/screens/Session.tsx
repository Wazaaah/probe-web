import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { Examiner } from '../lib/examiner'
import { Voice } from '../lib/voice'
import type { Brain } from '../lib/brain'
import type { QuestionPath } from '../data/types'
import { SESSION_INTRO } from '../data/sample'

type OrbState = 'listening' | 'thinking' | 'speaking'

/**
 * The examiner, drawn as a ring of 64 spokes around a core.
 *
 * Each state has its own signature: listening ripples with a travelling envelope,
 * thinking flattens to a still ring with one orbiting mote, speaking swells and rotates.
 * Canvas rather than 64 elements, so it costs one paint per frame.
 */
function Orb({ state, onTap }: { state: OrbState; onTap: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const size = 208
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    const start = performance.now()
    let frame = 0

    const draw = (now: number) => {
      const phase = (now - start) / 90
      const cx = size / 2
      const cy = size / 2
      const inner = 58
      const core = 52
      ctx.clearRect(0, 0, size, size)

      // The halo is cast outward only; the core stays as dark as the page behind it.
      if (state !== 'thinking') {
        const spread = state === 'speaking' ? 40 : 24
        const strength = state === 'speaking' ? 0.12 : 0.08
        const gradient = ctx.createRadialGradient(cx, cy, core, cx, cy, core + spread)
        gradient.addColorStop(0, `rgba(255,255,255,${strength})`)
        gradient.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(cx, cy, core + spread, 0, Math.PI * 2)
        ctx.fill()
      }

      const spin = state === 'speaking' ? ((now - start) / 6000) * Math.PI * 2 : 0
      ctx.strokeStyle = `rgba(255,255,255,${state === 'listening' ? 0.85 : state === 'thinking' ? 0.5 : 0.95})`
      ctx.lineWidth = 1.5
      for (let i = 0; i < 64; i += 1) {
        const angle = (i * Math.PI * 2) / 64 + spin
        let length: number
        if (state === 'listening') {
          const envelope = 0.35 + 0.65 * Math.abs(Math.sin(phase * 0.34 + i * 0.11))
          length = 5 + 30 * envelope * Math.abs(Math.sin(i * 1.7 + phase * 0.55))
        } else if (state === 'thinking') {
          length = 11
        } else {
          length = 12 + 22 * (0.5 + 0.5 * Math.sin(i * 0.196 + phase * 0.22))
        }
        const dx = -Math.sin(angle)
        const dy = Math.cos(angle)
        ctx.beginPath()
        ctx.moveTo(cx + dx * inner, cy + dy * inner)
        ctx.lineTo(cx + dx * (inner + length), cy + dy * (inner + length))
        ctx.stroke()
      }

      if (state === 'speaking') {
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(cx, cy, core, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.strokeStyle =
        state === 'speaking' ? '#ffffff' : state === 'thinking' ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.6)'
      ctx.beginPath()
      ctx.arc(cx, cy, core - 0.75, 0, Math.PI * 2)
      ctx.stroke()

      if (state === 'thinking') {
        const angle = ((now - start) / 1400) * Math.PI * 2 - Math.PI / 2
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(cx + Math.cos(angle) * 96, cy + Math.sin(angle) * 96, 1.5, 0, Math.PI * 2)
        ctx.fill()
      }

      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [state])

  return (
    <canvas
      ref={ref}
      onClick={onTap}
      role="button"
      aria-label="Repeat the question"
    />
  )
}

/**
 * The examination.
 *
 * Everything on screen is live: the question is whatever was just asked, the transcript
 * is what the recogniser heard, and the rail moves when a question is actually done.
 */
export function Session({
  path,
  brain,
  onFinish,
  onPause,
  onStart,
}: {
  path: QuestionPath
  brain: Brain | null
  onFinish: (examiner: Examiner) => void
  onPause: () => void
  onStart: () => void
}) {
  const voice = useMemo(() => new Voice(), [])
  const examiner = useMemo(() => new Examiner(path.script), [path])

  const [orb, setOrb] = useState<OrbState>('speaking')
  const [question, setQuestion] = useState('')
  const [heard, setHeard] = useState('')
  const [index, setIndex] = useState(0)
  const [pressing, setPressing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [muted, setMuted] = useState(false)
  // Recognition can exist and still be unusable — permission refused, no input device.
  // Rather than leave the learner with no way to answer, the session switches to typing.
  const [micBlocked, setMicBlocked] = useState(false)
  // And sometimes it works but the room is wrong for it: an open office, a quiet carriage.
  const [preferTyping, setPreferTyping] = useState(false)
  const [typed, setTyped] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [hold, setHold] = useState(0)

  const alive = useRef(true)
  const holdTimer = useRef<number | null>(null)
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const typingRef = useRef(false)
  // The microphone callback outlives the render that opened it, so it reaches the
  // current submit through a ref rather than closing over a stale one.
  const submitRef = useRef<(said: string) => void>(() => {})

  useEffect(() => {
    // Re-armed on every run, not just the first: the teardown below is what stops the
    // examination, and leaving it latched off would silently freeze the next one.
    alive.current = true
    const tick = window.setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => {
      window.clearInterval(tick)
      alive.current = false
      voice.dispose()
      if (holdTimer.current) window.clearInterval(holdTimer.current)
    }
  }, [voice])

  const openMic = useCallback(() => {
    if (!alive.current) return
    setOrb('listening')
    if (mutedRef.current || typingRef.current || !voice.canHear) {
      setRecording(false)
      return
    }
    setRecording(true)
    voice.listen({
      onPartial: setHeard,
      onFinal: (said) => {
        setRecording(false)
        submitRef.current(said)
      },
      onUnavailable: (reason) => {
        setRecording(false)
        if (reason !== 'busy') setMicBlocked(true)
      },
    })
  }, [voice])

  const ask = useCallback(
    (text: string, preamble?: string) => {
      if (!alive.current) return
      setQuestion(text)
      setHeard('')
      setOrb('speaking')
      voice.speak(preamble ? `${preamble} ${text}` : text, openMic)
    },
    [openMic, voice],
  )

  const submit = useCallback(
    async (said: string) => {
      if (!said.trim()) {
        openMic()
        return
      }
      setHeard(said)
      setRecording(false)
      setOrb('thinking')

      const node = examiner.node
      let verdict = node && brain ? await brain.judge(path, node, said, examiner.probedHere) : null
      if (!verdict) {
        // A dropped call must never stall a live examination.
        await new Promise((resolve) => setTimeout(resolve, 700))
        verdict = examiner.localVerdict(said)
      }

      const move = examiner.apply(said, verdict)
      if (!alive.current) return
      if (move) {
        setIndex(move.index)
        setPressing(move.probe)
        ask(move.question)
      } else {
        voice.stopListening()
        onFinish(examiner)
      }
    },
    [ask, brain, examiner, onFinish, openMic, path, voice],
  )
  submitRef.current = submit

  useEffect(() => {
    const first = examiner.opening()
    if (first) {
      onStart()
      ask(first.question, SESSION_INTRO)
    }
    // Opens once, deliberately: re-running would restart the examination.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startHold = () => {
    if (holdTimer.current) return
    holdTimer.current = window.setInterval(() => {
      setHold((value) => {
        if (value >= 1) {
          if (holdTimer.current) window.clearInterval(holdTimer.current)
          holdTimer.current = null
          voice.dispose()
          onFinish(examiner)
          return 1
        }
        return value + 1 / 15
      })
    }, 40)
  }

  const endHold = () => {
    if (holdTimer.current) {
      window.clearInterval(holdTimer.current)
      holdTimer.current = null
    }
    setHold(0)
  }

  const typing = !voice.canHear || micBlocked || preferTyping
  typingRef.current = typing
  const total = Math.max(examiner.total, 1)
  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`
  const label = muted
    ? 'Muted'
    : orb === 'speaking'
      ? 'Asking'
      : orb === 'thinking'
        ? 'Considering your answer'
        : recording
          ? 'Listening'
          : 'Your turn'

  return (
    <div className="session">
      <div className="between" style={{ padding: '4px 16px' }}>
        <span className="row gap-10">
          <span className="micro dim">{clock}</span>
          {recording && (
            <span className="recording">
              <span className="dot" />
              Recording
            </span>
          )}
        </span>
        <span className="micro dim">
          Question {Math.min(index + 1, total)} of {total}
        </span>
      </div>

      <div className="rail">
        <div className="line" />
        <div className="nodes">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`node${i < index ? ' done' : i === index ? ' now' : ''}`} />
          ))}
        </div>
        {pressing && (
          <div
            className="spur"
            style={{ left: `calc(16px + (100% - 32px) * ${total > 1 ? index / (total - 1) : 0} - 12px)` }}
          >
            <span className="stem" />
            <span className="row gap-8">
              <span className="ring" />
              <span className="micro" style={{ color: 'var(--ink-600)', whiteSpace: 'nowrap' }}>
                Going deeper
              </span>
            </span>
          </div>
        )}
      </div>

      <div className="session-body">
        <p className={`question${orb === 'listening' ? ' receded' : ''}`}>{question}</p>

        <div className="orb-wrap">
          <Orb
            state={orb}
            onTap={() => {
              voice.stopListening()
              ask(question)
            }}
          />
          <span className="orb-label">{label}</span>
        </div>
      </div>

      {/* What you said sits directly above the controls, never inside the scroll. */}
      <div style={{ flex: 'none', padding: '0 16px 12px' }}>
        {!typing ? (
          <div className="heard">
            <p className="body" style={{ color: heard ? 'var(--surface)' : 'var(--ink-700)' }}>
              {heard || (recording ? 'Listening…' : '')}
            </p>
            <span className="fade" />
          </div>
        ) : (
          <div className="stack gap-8">
            <p className="micro dim">
              {!voice.canHear
                ? 'This browser has no speech recognition — type your answer instead.'
                : micBlocked
                  ? 'The microphone is not available — type your answer instead.'
                  : 'Typing. The examiner still reads it as if you had said it.'}
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (!typed.trim()) return
                const value = typed
                setTyped('')
                void submit(value)
              }}
            >
              <input
                className="field"
                placeholder="Your answer"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
            </form>
          </div>
        )}
      </div>

      <div className="session-dock">
        <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
          <button
            className={`round${muted ? ' on' : ''}`}
            aria-label={muted ? 'Unmute' : 'Mute'}
            disabled={typing}
            style={typing ? { opacity: 0.4, cursor: 'default' } : undefined}
            onClick={() => {
              const next = !muted
              setMuted(next)
              mutedRef.current = next
              if (next) {
                voice.stopListening()
                setRecording(false)
              } else {
                openMic()
              }
            }}
          >
            <Icon name={muted ? 'micOff' : 'mic'} size={24} />
          </button>
          <button
            className="round"
            aria-label="Pause"
            onClick={() => {
              voice.dispose()
              onPause()
            }}
          >
            <Icon name="pause" size={24} />
          </button>
          {voice.canHear && !micBlocked && (
            <button
              className={`round${preferTyping ? ' on' : ''}`}
              aria-label={preferTyping ? 'Answer out loud' : 'Type the answer'}
              onClick={() => {
                const next = !preferTyping
                setPreferTyping(next)
                if (next) {
                  voice.stopListening()
                  setRecording(false)
                  setOrb('listening')
                } else {
                  openMic()
                }
              }}
            >
              <Icon name={preferTyping ? 'wave' : 'doc'} size={22} />
            </button>
          )}
        </div>

        <div
          className="hold"
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onPointerCancel={endHold}
        >
          <span className="fill" style={{ width: `${hold * 100}%` }} />
          <span className="lbl">{hold >= 0.8 ? 'Release to end' : 'Hold to end session'}</span>
        </div>
      </div>
    </div>
  )
}
