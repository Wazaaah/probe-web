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

export class Voice {
  private recogniser: SpeechRecognitionLike | null = null
  private readonly synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null
  private spoken: (() => void) | null = null
  private watchdog = 0

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
    utterance.rate = 0.98
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
    recogniser.continuous = false

    let last = ''
    let settled = false
    const settle = (text: string) => {
      if (settled) return
      settled = true
      onFinal(text)
    }

    recogniser.onresult = (event: any) => {
      let text = ''
      for (let i = 0; i < event.results.length; i += 1) text += event.results[i][0].transcript
      last = text
      if (event.results[event.results.length - 1].isFinal) settle(text)
      else onPartial(text)
    }
    recogniser.onerror = (event: any) => {
      // Silence is an answer too — hand back whatever was caught.
      if (event.error === 'no-speech' || event.error === 'aborted') settle(last)
      else {
        settled = true
        onUnavailable(event.error ?? 'error')
      }
    }
    recogniser.onend = () => settle(last)

    try {
      recogniser.start()
    } catch {
      onUnavailable('busy')
    }
  }

  stopListening(): void {
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
