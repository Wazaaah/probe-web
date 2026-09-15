/**
 * The examiner's mouth and ears, both the browser's own.
 *
 * The order matters: it speaks the question, and only once it has stopped speaking does
 * the microphone open. Nothing here decides *what* to ask — that is the Examiner's job,
 * driven by what came back.
 */

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: any) => void) | null
  onerror: ((event: any) => void) | null
  onend: (() => void) | null
}

type RecognitionCtor = new () => SpeechRecognitionLike

const Recognition: RecognitionCtor | undefined =
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition

export interface ListenHandlers {
  onPartial: (text: string) => void
  onFinal: (text: string) => void
  onUnavailable: (reason: string) => void
}

/* -- how long a thought is allowed to pause ------------------------------- */

const PAUSE_KEY = 'probe.voice.pause'
const VOICE_KEY = 'probe.voice.name'

/**
 * Seconds of silence before an answer is taken as finished.
 *
 * The browser's recogniser ends a turn at the first real pause, which is wrong for an
 * examination: people stop to think, especially on the question they are least sure
 * about, and cutting them off there loses exactly the part worth hearing. So the
 * recogniser runs continuously and the decision about when someone has finished is made
 * here, by a timer that every new word resets.
 *
 * Two and a half seconds is a long gap in conversation and a short one in an oral exam.
 * It is settable because the right number depends on the room, the speaker and how hard
 * the question was.
 */
export const DEFAULT_PAUSE = 2.5

export function pauseSeconds(): number {
  try {
    const stored = Number(localStorage.getItem(PAUSE_KEY))
    return Number.isFinite(stored) && stored >= 1 && stored <= 10 ? stored : DEFAULT_PAUSE
  } catch {
    return DEFAULT_PAUSE
  }
}

export function setPauseSeconds(seconds: number): void {
  try {
    localStorage.setItem(PAUSE_KEY, String(Math.min(10, Math.max(1, seconds))))
  } catch {
    /* private browsing: the default stands for this session */
  }
}

/* -- which voice does the asking ------------------------------------------ */

/**
 * The browser hands back whatever the operating system has installed, in no useful order,
 * and the first one is often the worst one — a flat, clipped diagnostic voice that makes
 * a question sound like an error message. Nobody wants to be examined by that.
 *
 * So prefer the ones that are actually pleasant to be asked a question by: the online
 * neural voices where they exist, then the better local ones, then anything English, then
 * whatever there is. And let it be overridden, because taste in voices is not something
 * to be argued with.
 */
const LIKED = [
  'google uk english female',
  'google uk english male',
  'google us english',
  'microsoft libby',
  'microsoft sonia',
  'microsoft aria',
  'microsoft ryan',
  'microsoft guy',
  'samantha',
  'daniel',
  'karen',
]

export function availableVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  const all = speechSynthesis.getVoices()
  const english = all.filter((v) => v.lang.toLowerCase().startsWith('en'))
  const pool = english.length ? english : all
  return [...pool].sort((a, b) => rankVoice(b) - rankVoice(a))
}

function rankVoice(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase()
  const liked = LIKED.findIndex((wanted) => name.includes(wanted))
  if (liked >= 0) return 100 - liked
  // A network voice is almost always the better-sounding one.
  if (!voice.localService) return 40
  if (voice.default) return 20
  return 10
}

export function chosenVoiceName(): string {
  try {
    return localStorage.getItem(VOICE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function setVoiceName(name: string): void {
  try {
    if (name) localStorage.setItem(VOICE_KEY, name)
    else localStorage.removeItem(VOICE_KEY)
  } catch {
    /* private browsing */
  }
}

function pickVoice(): SpeechSynthesisVoice | null {
  const all = availableVoices()
  if (!all.length) return null
  const wanted = chosenVoiceName()
  return all.find((v) => v.name === wanted) ?? all[0]
}

export class Voice {
  private recogniser: SpeechRecognitionLike | null = null
  private readonly synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null
  private spoken: (() => void) | null = null
  private watchdog = 0
  private hush = 0

  /** Chrome and Edge have recognition; Firefox does not, so the session offers typing. */
  readonly canHear = !!Recognition
  readonly canSpeak = !!this.synth

  /**
   * Speaks, then hands back.
   *
   * Speech synthesis is unreliable in a way that matters here: with no installed voice,
   * a blocked autoplay policy or a backgrounded tab it can accept an utterance and then
   * never fire an event at all. An examination that waits forever for that is broken, so
   * a timer sized to the sentence hands control back regardless.
   */
  speak(text: string, done: () => void): void {
    this.stopSpeaking()
    if (!this.synth) {
      done()
      return
    }

    const finish = () => {
      if (this.spoken !== finish) return
      this.spoken = null
      window.clearTimeout(this.watchdog)
      done()
    }
    this.spoken = finish

    const utterance = new SpeechSynthesisUtterance(text)
    const voice = pickVoice()
    if (voice) {
      utterance.voice = voice
      utterance.lang = voice.lang
    }
    // Slightly under natural pace: a question asked too briskly gets asked again.
    utterance.rate = 0.95
    utterance.pitch = 1
    utterance.onend = finish
    utterance.onerror = finish
    // Roughly speaking pace, with enough slack that a real voice is never cut short.
    this.watchdog = window.setTimeout(finish, 3000 + text.length * 90)
    this.synth.speak(utterance)
  }

  /** Silences the current utterance without handing control back. */
  stopSpeaking(): void {
    this.spoken = null
    window.clearTimeout(this.watchdog)
    this.synth?.cancel()
  }

  /**
   * Opens the microphone and keeps it open until they have actually stopped.
   *
   * `continuous` plus a silence timer, rather than letting the recogniser decide: on its
   * own it ends the turn at the first pause, which in an examination is usually somebody
   * thinking rather than somebody finishing.
   */
  listen({ onPartial, onFinal, onUnavailable }: ListenHandlers): void {
    if (!Recognition) {
      onUnavailable('unsupported')
      return
    }
    this.stopListening()

    const recogniser = new Recognition()
    this.recogniser = recogniser
    recogniser.lang = navigator.language || 'en-GB'
    recogniser.interimResults = true
    recogniser.continuous = true

    const grace = pauseSeconds() * 1000
    let settled = false
    /** Everything the recogniser has committed to so far this turn. */
    let banked = ''
    /** The in-flight phrase, not yet final. */
    let pending = ''

    const heard = () => `${banked}${pending}`.replace(/\s+/g, ' ').trim()

    const settle = () => {
      if (settled) return
      settled = true
      window.clearTimeout(this.hush)
      onFinal(heard())
    }

    /** Every new word pushes the finish line back. */
    const waitForMore = () => {
      window.clearTimeout(this.hush)
      this.hush = window.setTimeout(settle, grace)
    }

    recogniser.onresult = (event: any) => {
      banked = ''
      pending = ''
      for (let i = 0; i < event.results.length; i += 1) {
        const chunk = event.results[i][0].transcript
        if (event.results[i].isFinal) banked += chunk
        else pending += chunk
      }
      onPartial(heard())
      waitForMore()
    }

    recogniser.onerror = (event: any) => {
      // Silence is an answer too — hand back whatever was caught.
      if (event.error === 'no-speech' || event.error === 'aborted') settle()
      else {
        settled = true
        window.clearTimeout(this.hush)
        onUnavailable(event.error ?? 'error')
      }
    }

    // Chrome stops the stream on its own every so often. If they have not finished, start
    // it again and keep the transcript, rather than ending their answer for them.
    recogniser.onend = () => {
      if (settled || this.recogniser !== recogniser) return
      try {
        recogniser.start()
      } catch {
        settle()
      }
    }

    try {
      recogniser.start()
      waitForMore()
    } catch {
      onUnavailable('busy')
    }
  }

  /** Take what has been said so far and move on, without waiting out the pause. */
  finishTurn(): void {
    if (!this.recogniser) return
    try {
      this.recogniser.stop()
    } catch {
      /* already stopping; the silence timer still fires */
    }
  }

  stopListening(): void {
    window.clearTimeout(this.hush)
    if (!this.recogniser) return
    const recogniser = this.recogniser
    this.recogniser = null
    recogniser.onend = null
    recogniser.onresult = null
    recogniser.onerror = null
    try {
      recogniser.abort()
    } catch {
      /* already stopped */
    }
  }

  dispose(): void {
    this.stopListening()
    this.stopSpeaking()
  }
}
