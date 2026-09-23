import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeBrain, type BrainConfig } from './brain'
import type { SourceDoc } from './claims'
import type { DocIndex } from './documents'
import type { QuestionPath } from '../data/types'

/**
 * The prompt-construction half of the brain — the part that decides what a model sees —
 * exercised end to end through the real `buildPaths`/`grade`/`indexDocuments` rather than
 * by re-deriving the same string in a test. A mocked fetch captures exactly what the
 * multi-document rework sends, which is the piece most exposed to a template-literal
 * mistake: wrong variable in a conditional clause, a document that should have been
 * excluded from "other readings" still showing its full text, that kind of thing.
 */

const CONFIG: BrainConfig = { provider: 'groq', model: 'test-model', apiKey: 'k' }

const SINGER: SourceDoc = { name: 'Singer.pdf', text: 'Singer argues distance is not morally relevant. '.repeat(30) }
const MILL: SourceDoc = { name: 'Mill.pdf', text: 'Mill argues the harm principle limits state power. '.repeat(30) }
const SNAPIR: SourceDoc = { name: 'Snapir.pdf', text: 'Snapir maps galamsey gold mining expansion. '.repeat(30) }
const FORKUOR: SourceDoc = { name: 'Forkuor.pdf', text: 'Forkuor monitors mining with Sentinel-1 imagery. '.repeat(30) }
const OWUSU: SourceDoc = { name: 'Owusu.pdf', text: 'Owusu-Nimo maps illegal mining sites in Ghana. '.repeat(30) }

/** Captures the last request body sent to a mocked fetch, decoded back to the chat shape. */
function mockChat(reply: object) {
  let lastPrompt = ''
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      lastPrompt = body.messages.find((m: { role: string }) => m.role === 'user')?.content ?? ''
      return {
        ok: true,
        text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }),
      }
    }),
  )
  return () => lastPrompt
}

afterEach(() => vi.unstubAllGlobals())

const PATH_REPLY = {
  paths: [
    {
      name: 'Angle',
      description: 'd',
      difficulty: 'Moderate',
      minutes: 5,
      opener: 'q',
      script: [{ question: 'What supports that?', concept: 'c', expects: ['x'], probes: [] }],
    },
  ],
}

describe('buildPaths — grounded, one reading', () => {
  it('talks about "a reading", singular, and shows its full text', async () => {
    const prompt = mockChat(PATH_REPLY)
    const brain = makeBrain(CONFIG)!
    await brain.buildPaths('their passage', 'My passage about Singer.', { sources: [SINGER] })
    const sent = prompt()
    expect(sent).toContain('a reading')
    expect(sent).not.toContain('a set of readings')
    expect(sent).toContain('THE READING (Singer.pdf)')
    expect(sent).toContain('Singer argues distance is not morally relevant')
    expect(sent).not.toContain('OTHER READINGS')
  })
})

describe('buildPaths — grounded, two readings', () => {
  it('shows both in full and says "readings", plural', async () => {
    const prompt = mockChat(PATH_REPLY)
    const brain = makeBrain(CONFIG)!
    await brain.buildPaths('their passage', 'My passage mentions Singer and Mill both.', {
      sources: [SINGER, MILL],
    })
    const sent = prompt()
    expect(sent).toContain('a set of readings')
    expect(sent).toContain('THE READING (Singer.pdf)')
    expect(sent).toContain('THE READING (Mill.pdf)')
    expect(sent).toContain('how two of the readings relate')
    expect(sent).not.toContain('OTHER READINGS')
  })
})

describe('buildPaths — grounded, five readings', () => {
  it('gives full text only to the readings the passage actually concerns', async () => {
    const prompt = mockChat(PATH_REPLY)
    const brain = makeBrain(CONFIG)!
    // The passage shares vocabulary with Snapir specifically — "galamsey", "mining".
    await brain.buildPaths('their passage', 'I wrote about galamsey mining expansion patterns.', {
      sources: [SINGER, MILL, SNAPIR, FORKUOR, OWUSU],
    })
    const sent = prompt()
    expect(sent).toContain('THE READING (Snapir.pdf)')
    // Singer and Mill share nothing with the passage and must not have their full text sent.
    expect(sent).not.toContain('Singer argues distance is not morally relevant')
    expect(sent).not.toContain('Mill argues the harm principle')
  })

  it('represents the readings left out only by their topic summary, never invents one', async () => {
    const prompt = mockChat(PATH_REPLY)
    const brain = makeBrain(CONFIG)!
    const index: DocIndex = [
      { doc: SINGER, topics: [{ text: 'Distance does not excuse inaction' }] },
      { doc: MILL, topics: [{ text: 'Harm to others limits liberty' }] },
    ]
    // Shares vocabulary with none of Singer, Mill or Snapir individually except Snapir —
    // so with the fix that stops padding the focus set, only Snapir gets full text and
    // BOTH Singer and Mill are represented by summary only.
    await brain.buildPaths('their passage', 'Galamsey gold mining watershed expansion satellite imagery.', {
      sources: [SINGER, MILL, SNAPIR],
      index,
    })
    const sent = prompt()
    expect(sent).toContain('OTHER READINGS ON THE LIST')
    expect(sent).toContain('Distance does not excuse inaction')
    expect(sent).toContain('Harm to others limits liberty')
    expect(sent).not.toContain('THE READING (Singer.pdf)')
    expect(sent).not.toContain('THE READING (Mill.pdf)')
  })
})

describe('indexDocuments', () => {
  it('summarises every reading it is given when there is no existing index', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1
        return {
          ok: true,
          text: async () =>
            JSON.stringify({ choices: [{ message: { content: JSON.stringify({ topics: ['a topic'] }) } }] }),
        }
      }),
    )
    const brain = makeBrain(CONFIG)!
    const index = await brain.indexDocuments([SINGER, MILL])
    expect(calls).toBe(2)
    expect(index.map((e) => e.doc.name).sort()).toEqual(['Mill.pdf', 'Singer.pdf'])
  })

  it('does not re-summarise a reading already in the index it was handed', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1
        return {
          ok: true,
          text: async () =>
            JSON.stringify({ choices: [{ message: { content: JSON.stringify({ topics: ['a topic'] }) } }] }),
        }
      }),
    )
    const brain = makeBrain(CONFIG)!
    const existing: DocIndex = [{ doc: SINGER, topics: [{ text: 'already summarised' }] }]
    const index = await brain.indexDocuments([SINGER, MILL], existing)
    expect(calls).toBe(1)
    expect(index.find((e) => e.doc.name === 'Singer.pdf')?.topics[0].text).toBe('already summarised')
    expect(index.find((e) => e.doc.name === 'Mill.pdf')).toBeTruthy()
  })
})

describe('grade — across several readings', () => {
  it('checks a claim against whichever reading it concerns, not just the first', async () => {
    let extractCall = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string)
        const user = body.messages.find((m: { role: string }) => m.role === 'user')?.content ?? ''
        if (extractCall) {
          extractCall = false
          return {
            ok: true,
            text: async () =>
              JSON.stringify({
                choices: [
                  { message: { content: JSON.stringify({ claims: ['Mill treats harm to others as the only limit on liberty'] }) } },
                ],
              }),
          }
        }
        // The checker call: the claim's own evidence should be labelled with Mill, not Singer.
        expect(user).toContain('[Mill.pdf]')
        return {
          ok: true,
          text: async () =>
            JSON.stringify({ choices: [{ message: { content: JSON.stringify({ verdicts: ['supported'] }) } }] }),
        }
      }),
    )
    const brain = makeBrain(CONFIG)!
    const grade = await brain.grade(
      [{ question: 'q', concept: '', spoken: 'a', coverage: 0, probed: false, judgedBy: 'model' }],
      [SINGER, MILL],
      '',
    )
    expect(grade?.claims[0].support).toBe('supported')
  })
})

const PATH: QuestionPath = {
  name: 'Where did this claim come from',
  description: 'Trace a specific assertion back to what supports it in the reading',
  difficulty: 'Moderate',
  minutes: 6,
  opener: 'q',
  script: [],
}

describe('continuePath', () => {
  it('grounds the next question in the transcript so far and the reading, not just the passage', async () => {
    const prompt = mockChat({ question: 'What does the harm principle rule out?', concept: 'Harm principle', expects: ['harm'], probes: [] })
    const brain = makeBrain(CONFIG)!
    const answers = [{ question: 'Who wrote this?', concept: 'Authorship', spoken: 'Mill', coverage: 90, probed: false, judgedBy: 'model' as const }]
    await brain.continuePath(PATH, answers, 'My passage about Mill.', [MILL], null)
    const sent = prompt()
    expect(sent).toContain(PATH.name)
    expect(sent).toContain('Who wrote this?')
    expect(sent).toContain('Mill argues the harm principle')
  })

  it('reads an empty question as "nothing left to ask", the same as a dropped call', async () => {
    mockChat({ question: '', concept: '', expects: [], probes: [] })
    const brain = makeBrain(CONFIG)!
    const node = await brain.continuePath(PATH, [], 'passage', [MILL], null)
    expect(node).toBeNull()
  })

  it('still works with no readings at all, grounding only in the passage', async () => {
    const prompt = mockChat({ question: 'What follows from that?', concept: 'Implication', expects: ['x'], probes: [] })
    const brain = makeBrain(CONFIG)!
    const node = await brain.continuePath(PATH, [], 'A passage with no attached reading.', [], null)
    expect(node?.question).toBe('What follows from that?')
    expect(prompt()).toContain('A passage with no attached reading.')
  })
})
