import type { Handoff } from '../data/types'

/**
 * The wire between the two browsers.
 *
 * A pairing code becomes a pub/sub topic on ntfy.sh: plain HTTPS, no account and no
 * keys, which is what makes "open the same link and type the same code" enough. The
 * browser subscribes with EventSource, so reconnection is the platform's problem.
 *
 * It is a prototype transport. The topic is public to anyone who guesses the code, so
 * the code is the only thing keeping a session private — a real build wants your own
 * backend behind auth.
 */

const HOST = 'https://ntfy.sh'
/** Enough history that a browser opened second still sees where things got to. */
const BACKFILL = '15m'
/**
 * ntfy turns anything past roughly 4 KB into a file attachment rather than a message,
 * which would silently break every subscriber. A generated set of four question paths
 * is comfortably larger than that, so state is sent in pieces and put back together on
 * the other side.
 */
const CHUNK = 2800

export type LinkState = 'offline' | 'connecting' | 'online'

export function topicFor(code: string): string {
  return 'probe-pair-' + code.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

interface Envelope {
  event?: string
  message?: string
}

/** One piece of one state. `i` of `n`, all sharing an `id`. */
interface Piece {
  v: 1
  id: string
  i: number
  n: number
  d: string
}

function isPiece(value: unknown): value is Piece {
  const piece = value as Piece
  return (
    !!piece &&
    typeof piece === 'object' &&
    piece.v === 1 &&
    typeof piece.id === 'string' &&
    typeof piece.d === 'string' &&
    Number.isInteger(piece.i) &&
    Number.isInteger(piece.n)
  )
}

function parsePiece(raw: string): Piece | null {
  try {
    const value = JSON.parse(raw)
    return isPiece(value) ? value : null
  } catch {
    return null
  }
}

function parseState(raw: string): Handoff | null {
  try {
    const value = JSON.parse(raw) as Partial<Handoff>
    if (!value || typeof value !== 'object' || typeof value.status !== 'string') return null
    return value as Handoff
  } catch {
    return null
  }
}

/** Collects pieces until a state is whole. Deliberately forgetful: only the last few sets. */
class Reassembler {
  private sets = new Map<string, { n: number; parts: string[] }>()

  offer(piece: Piece): Handoff | null {
    let set = this.sets.get(piece.id)
    if (!set) {
      set = { n: piece.n, parts: [] }
      this.sets.set(piece.id, set)
      // A dropped piece would otherwise pin its set here forever.
      if (this.sets.size > 8) this.sets.delete(this.sets.keys().next().value as string)
    }
    set.parts[piece.i] = piece.d

    let joined = ''
    for (let i = 0; i < set.n; i += 1) {
      if (set.parts[i] === undefined) return null
      joined += set.parts[i]
    }
    this.sets.delete(piece.id)
    return parseState(joined)
  }
}

/** Fire-and-forget: a failed publish must never block the interaction that caused it. */
export async function publish(code: string, state: Handoff): Promise<void> {
  const body = JSON.stringify(state)
  const id = Math.random().toString(36).slice(2, 10)
  const total = Math.max(1, Math.ceil(body.length / CHUNK))
  const url = `${HOST}/${topicFor(code)}`

  try {
    // In order, one at a time: subscribers apply pieces as they arrive.
    for (let i = 0; i < total; i += 1) {
      const piece: Piece = { v: 1, id, i, n: total, d: body.slice(i * CHUNK, (i + 1) * CHUNK) }
      await fetch(url, { method: 'POST', body: JSON.stringify(piece) })
    }
  } catch {
    /* the local state already moved; the peer will resync on the next write */
  }
}

/** Everything from the last {@link BACKFILL}, applied in order before going live. */
export async function backfill(code: string): Promise<Handoff[]> {
  try {
    const response = await fetch(`${HOST}/${topicFor(code)}/json?poll=1&since=${BACKFILL}`)
    if (!response.ok) return []
    const reassembler = new Reassembler()
    const states: Handoff[] = []

    for (const line of (await response.text()).split('\n')) {
      if (!line) continue
      let envelope: Envelope
      try {
        envelope = JSON.parse(line) as Envelope
      } catch {
        continue
      }
      if (envelope.event !== 'message' || !envelope.message) continue
      const piece = parsePiece(envelope.message)
      const state = piece ? reassembler.offer(piece) : parseState(envelope.message)
      if (state) states.push(state)
    }
    return states
  } catch {
    return []
  }
}

export interface Subscription {
  close(): void
}

/**
 * Live updates. EventSource handles reconnection itself, which is the main reason to
 * prefer it over reading the streaming JSON endpoint by hand.
 */
export function subscribe(
  code: string,
  onState: (state: Handoff) => void,
  onLink: (link: LinkState) => void,
): Subscription {
  onLink('connecting')
  const source = new EventSource(`${HOST}/${topicFor(code)}/sse`)
  const reassembler = new Reassembler()

  source.onopen = () => onLink('online')
  source.onerror = () => onLink('connecting')
  source.onmessage = (event) => {
    let envelope: Envelope
    try {
      envelope = JSON.parse(event.data) as Envelope
    } catch {
      return
    }
    if (envelope.event !== 'message' || !envelope.message) return
    const piece = parsePiece(envelope.message)
    const state = piece ? reassembler.offer(piece) : parseState(envelope.message)
    if (state) onState(state)
  }

  return {
    close() {
      source.close()
      onLink('offline')
    },
  }
}
