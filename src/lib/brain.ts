import type { Answer, PathNode, QuestionPath, Summary, Verdict } from '../data/types'

/**
 * Whoever judges the answers.
 *
 * Groq, Google AI Studio, Cerebras and OpenRouter all speak the same OpenAI-compatible
 * chat-completions shape, so one implementation covers every option — and a custom base
 * URL covers whatever you run later. Anthropic needs its own shape and an explicit
 * opt-in header before a browser may call it at all.
 */

export type ProviderId = 'none' | 'groq' | 'gemini' | 'claude'

export interface ProviderInfo {
  id: ProviderId
  label: string
  blurb: string
  free: boolean
  defaultModel: string
  keysUrl: string
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'none',
    label: 'In-page',
    blurb: 'Term matching. No key, no network, no cost.',
    free: true,
    defaultModel: '',
    keysUrl: '',
  },
  {
    id: 'groq',
    label: 'Groq',
    blurb: 'Free, no card, and by far the fastest — the pause before a follow-up is what makes or breaks this.',
    free: true,
    defaultModel: 'openai/gpt-oss-120b',
    keysUrl: 'console.groq.com/keys',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    blurb: 'Free from Google AI Studio, no card. A Gemini Pro subscription does not cover this — the API is separate.',
    free: true,
    defaultModel: 'gemini-3.5-flash',
    keysUrl: 'aistudio.google.com/apikey',
  },
  {
    id: 'claude',
    label: 'Claude',
    blurb: 'The sharpest judge. Paid — roughly 20c a session.',
    free: false,
    defaultModel: 'claude-opus-5',
    keysUrl: 'platform.claude.com/settings/keys',
  },
]

export function providerInfo(id: ProviderId): ProviderInfo {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]
}

/* -- What the examiner is told ------------------------------------------ */

const VOICE = `You are the examiner in Probe. You question someone out loud about a document they will have to defend in front of other people — a board, an investor, a regulator.

You are not a tutor and not a cheerleader. You do not explain, encourage or praise. You establish whether they can hold the material under pressure, and press exactly where they are thin. A follow-up is one sentence, spoken aloud, naming the specific thing they skipped. Never ask them to "elaborate" — ask the harder, narrower question their answer avoided.`

function judgePrompt(path: QuestionPath, node: PathNode, said: string, probed: boolean): string {
  return `The angle was chosen for them by a reviewer: "${path.name}" — ${path.description}

You asked: "${node.question}"
A complete answer touches on: ${node.expects.join(', ')}
${node.probes.length ? `The reviewer flagged these as worth pressing on:\n${node.probes.map((p) => '- ' + p.condition).join('\n')}` : ''}
${probed ? 'You have already pressed once on this question. Unless the answer is still badly wrong, accept it and move on — do not trap them.' : ''}

They said, out loud: "${said}"

This is speech: expect hedging, false starts and filler. Judge the substance, not the fluency. If they got there clumsily, they got there.

Reply with JSON only: {"covered": true|false, "coverage": 0-100, "followUp": "your next spoken question when covered is false, otherwise an empty string"}`
}

function summaryPrompt(path: QuestionPath, answers: Answer[]): string {
  const transcript = answers
    .map((a) => `Q (${a.concept}): ${a.question}\nA: "${a.spoken}"${a.probed ? '\n(they had to be pressed on this one)' : ''}`)
    .join('\n\n')
  return `This examination is finished. The angle was "${path.name}".

${transcript}

Score what they actually demonstrated. Be honest — a reviewer is deciding whether to put this person in front of a board.

Reply with JSON only: {"score": 0-100, "verdict": "one sentence to the learner", "concepts": [{"label": "", "state": "solid|shaky|gap", "percent": 0-100}], "moment": {"concept": "", "quote": "their own words", "why": ""}}`
}

function pathsPrompt(name: string, text: string): string {
  return `You design oral examinations.

Given a document someone will have to defend in front of other people, write four different angles it could be attacked from. Not four topics — four kinds of pressure, each exposing a different way of not really knowing it:
1. Trace the causal chain  2. Stress-test the definitions  3. Apply it to an unseen case  4. Defend it under objection

Every question must be answerable out loud in under a minute and must be about THIS document — quote its numbers, clauses and names. Never anything generic.

Document: ${name}

${text.slice(0, 20000)}

Reply with JSON only:
{"paths":[{"name":"","description":"","difficulty":"Gentle|Moderate|Hard","minutes":0,"opener":"the first question in quotes","script":[{"question":"","concept":"","expects":["3 to 6 short lowercase terms a complete spoken answer contains"],"probes":[{"condition":"if they ...","followUp":"","missing":["terms whose absence fires this"]}]}]}]}
Exactly four paths, three to five questions each.`
}

const CHECK = `You asked: "What does a liquidation preference do?"
A complete answer touches on: preference, investor, paid first
They said: "It means the investor gets paid before common."

Reply with JSON only: {"covered": true|false, "coverage": 0-100, "followUp": ""}`

/* -- Transport ---------------------------------------------------------- */

/** Models wrap JSON in prose even when told not to, so take the outermost braces. */
function extractJson(raw: string): any | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

export interface BrainConfig {
  provider: ProviderId
  model: string
  apiKey: string
}

async function callOpenAiCompatible(
  baseUrl: string,
  config: BrainConfig,
  system: string,
  user: string,
  maxTokens: number,
): Promise<any> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      temperature: 0.2,
      // Honoured where supported; the shape is spelled out in the prompt regardless.
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${response.status}: ${text.slice(0, 180)}`)
  const content = JSON.parse(text)?.choices?.[0]?.message?.content ?? ''
  return extractJson(content)
}

async function callAnthropic(config: BrainConfig, system: string, user: string, maxTokens: number): Promise<any> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      // Anthropic blocks browser calls unless the page opts in explicitly.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${response.status}: ${text.slice(0, 180)}`)
  const content = JSON.parse(text)?.content?.find((b: any) => b.type === 'text')?.text ?? ''
  return extractJson(content)
}

function baseUrlFor(provider: ProviderId): string {
  return provider === 'gemini'
    ? 'https://generativelanguage.googleapis.com/v1beta/openai'
    : 'https://api.groq.com/openai/v1'
}

async function ask(config: BrainConfig, system: string, user: string, maxTokens: number): Promise<any> {
  return config.provider === 'claude'
    ? callAnthropic(config, system, user, maxTokens)
    : callOpenAiCompatible(baseUrlFor(config.provider), config, system, user, maxTokens)
}

/* -- The brain ----------------------------------------------------------- */

export interface Brain {
  judge(path: QuestionPath, node: PathNode, said: string, probed: boolean): Promise<Verdict | null>
  summarise(path: QuestionPath, answers: Answer[]): Promise<Summary | null>
  buildPaths(name: string, text: string): Promise<QuestionPath[] | null>
  check(): Promise<string>
}

export function makeBrain(config: BrainConfig): Brain | null {
  if (config.provider === 'none' || !config.apiKey.trim()) return null

  const quiet = async (system: string, user: string, maxTokens: number): Promise<any | null> => {
    try {
      return await ask(config, system, user, maxTokens)
    } catch (error) {
      console.warn('[probe] brain call failed', error)
      return null
    }
  }

  return {
    async judge(path, node, said, probed) {
      const json = await quiet(VOICE, judgePrompt(path, node, said, probed), 400)
      if (!json) return null
      return {
        covered: json.covered !== false,
        coverage: Math.max(0, Math.min(100, Number(json.coverage) || 0)),
        followUp: typeof json.followUp === 'string' ? json.followUp : '',
      }
    },

    async summarise(path, answers) {
      if (answers.length === 0) return null
      const json = await quiet(VOICE, summaryPrompt(path, answers), 1400)
      if (!json) return null
      const concepts = Array.isArray(json.concepts)
        ? json.concepts
            .filter((c: any) => c && typeof c.label === 'string')
            .map((c: any) => ({
              label: c.label,
              state: c.state === 'solid' || c.state === 'gap' ? c.state : 'shaky',
              percent: Math.max(0, Math.min(100, Number(c.percent) || 0)),
            }))
        : []
      return {
        score: Math.max(0, Math.min(100, Number(json.score) || 0)),
        verdict: typeof json.verdict === 'string' ? json.verdict : '',
        concepts,
        momentConcept: json.moment?.concept ?? '',
        momentQuote: json.moment?.quote ?? '',
      }
    },

    async buildPaths(name, text) {
      const json = await quiet('You reply with JSON only.', pathsPrompt(name, text), 8000)
      if (!json || !Array.isArray(json.paths)) return null
      const paths: QuestionPath[] = json.paths
        .filter((p: any) => p && Array.isArray(p.script) && p.script.length > 0)
        .map((p: any) => ({
          name: p.name || 'Path',
          description: p.description || '',
          difficulty: p.difficulty === 'Gentle' || p.difficulty === 'Hard' ? p.difficulty : 'Moderate',
          minutes: Math.max(3, Math.min(60, Number(p.minutes) || p.script.length * 2)),
          opener: p.opener || `“${p.script[0]?.question ?? ''}”`,
          script: p.script
            .filter((q: any) => q && typeof q.question === 'string' && q.question.trim())
            .map((q: any) => ({
              question: q.question,
              concept: q.concept || '',
              expects: Array.isArray(q.expects) ? q.expects.filter((t: any) => typeof t === 'string') : [],
              probes: Array.isArray(q.probes)
                ? q.probes
                    .filter((x: any) => x && typeof x.followUp === 'string' && x.followUp.trim())
                    .map((x: any) => ({
                      condition: x.condition || 'if the answer is thin',
                      followUp: x.followUp,
                      missing: Array.isArray(x.missing) ? x.missing.filter((t: any) => typeof t === 'string') : [],
                    }))
                : [],
            })),
        }))
        .filter((p: QuestionPath) => p.script.length > 0)
      return paths.length > 0 ? paths : null
    },

    /**
     * A real round trip on the real path, so a key can be proved before someone walks
     * into a demo with it.
     */
    async check() {
      const json = await ask(config, VOICE, CHECK, 400)
      if (!json) throw new Error('no JSON in the reply')
      return json.covered === false
        ? `Working — it pressed, and wrote: “${json.followUp ?? ''}”`
        : 'Working — it judged a sample answer as covered.'
    },
  }
}
