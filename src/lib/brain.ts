import type { Answer, PathNode, QuestionPath, Summary, Verdict } from '../data/types'
import {
  CHECKER,
  EXTRACTOR,
  checkPrompt,
  evidenceFor,
  extractPrompt,
  readClaims,
  passageFor,
  readVerdicts,
  recycles,
  scoreClaims,
  windowsOf,
  type Grade,
  type SourceDoc,
} from './claims'
import { COMPARER, comparePrompt, readWinner } from './ranking'
import { TOPIC_EXTRACTOR, citationsAmong, indexSummary, readTopics, relevantDocs, topicPrompt, type DocIndex } from './documents'

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
    blurb: 'Free, no card, and by far the fastest. The pause before a follow-up is what makes or breaks this.',
    free: true,
    defaultModel: 'openai/gpt-oss-120b',
    keysUrl: 'console.groq.com/keys',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    blurb: "Free from Google AI Studio, no card. A Gemini Pro subscription doesn't cover this; the API is separate.",
    free: true,
    defaultModel: 'gemini-2.5-flash',
    keysUrl: 'aistudio.google.com/apikey',
  },
  {
    id: 'claude',
    label: 'Claude',
    blurb: 'The sharpest judge. Paid, roughly 20c a session.',
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

You are not a tutor and not a cheerleader. You do not explain, encourage or praise. You establish whether they can hold the material under pressure, and press exactly where they are thin. A follow-up is one sentence, spoken aloud, naming the specific thing they skipped. Never ask them to "elaborate" — ask the harder, narrower question their answer avoided.

Talk like someone in the room, not like someone reading from a file. Do not recap what they just said before asking the next thing — they know what they said, they said it. No "So you're saying", no "You mentioned", no "As you noted". Just ask. Repeat their words back only when you are putting a real contradiction to them and they need to hear which words you mean.`

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

/**
 * Fit a long document into a prompt without examining someone on only its opening.
 *
 * The old code took `text.slice(0, 20000)`, which for a real dissertation is roughly the
 * first tenth. Every question then came from the introduction, and the student was never
 * asked about the work itself — the failure was invisible because the questions still
 * looked plausible.
 *
 * Sampling evenly across the whole document is not as good as retrieving the passages
 * that matter, which is where this should end up. It is strictly better than reading only
 * the front, it costs the same tokens, and the elisions are marked so the model knows it
 * is seeing a document rather than the whole of a short one.
 */
const PROMPT_BUDGET = 20000

function spread(text: string, budget = PROMPT_BUDGET): string {
  if (text.length <= budget) return text

  // Enough windows to cover the document, each big enough to hold an argument.
  const windows = 12
  const size = Math.floor(budget / windows)
  const stride = Math.floor((text.length - size) / (windows - 1))
  const parts: string[] = []

  for (let i = 0; i < windows; i += 1) {
    const at = i * stride
    // Start on a word boundary so a window never opens mid-word.
    const from = i === 0 ? 0 : text.indexOf(' ', at) + 1 || at
    parts.push(text.slice(from, from + size).trim())
  }
  return parts.join('\n\n[...]\n\n')
}

/**
 * Whose document is it?
 *
 * The default assumes the person answering wrote it, which is the product: someone
 * defending their own work to a board. A shared reading inverts that. Asking a student to
 * "defend your claim that Mill is wrong about harm" when they did not write the claim is
 * not a hard question, it is a confusing one, and a confused participant in a five-person
 * trial is a transcript you cannot use.
 */
export type DocumentKind = 'own-work' | 'reading'

/** The reading, or readings, a piece of work is answerable to. */
export type { SourceDoc as Source } from './claims'

/**
 * Questions about what someone wrote, answerable to the reading(s) they wrote it about.
 *
 * This is the case Probe is actually for, and it is the only one where the interesting
 * failure lives. A student who read the source and a student whose paragraph was written
 * for them can produce the same sentences; what separates them is whether the claims in
 * those sentences survive contact with what the source says. So the questions are
 * anchored at both ends — pointed at something THEY wrote, and answerable only out of the
 * reading — because a question anchored at only one end can be met from the other.
 *
 * With more than a couple of readings, dumping all of them into the prompt stops being
 * possible — ten readings do not fit a context window and should not have to. Two things
 * happen instead. `relevantDocs` picks out, by shared vocabulary with the passage, the one
 * or two readings the student's paragraph is actually about, and those go in full. Every
 * OTHER reading is represented only by its one-line topic summary from the index, so the
 * examiner can still ask a question that reaches across readings — "the first paper says
 * X; does this one agree?" — without every reading's full text competing for the budget.
 */
function groundedPrompt(text: string, docs: SourceDoc[], index: DocIndex | null): string {
  const focus = relevantDocs(text, docs, 2)
  const rest = docs.filter((d) => !focus.includes(d))
  const others = index?.filter((entry) => rest.some((d) => d.name === entry.doc.name))
  const links = docs.length > 1 ? citationsAmong(docs) : []

  return `You design oral examinations.

A student was set ${docs.length > 1 ? 'a set of readings' : 'a reading'} and wrote the passage below about it. Find out whether they
engaged with ${docs.length > 1 ? 'the readings' : 'the reading'} or produced something plausible-sounding without ${docs.length > 1 ? 'them' : 'it'}.

Write four angles, each a different way of testing that:
1. Where did this claim come from — take a specific thing they assert and ask what in the reading supports it
2. What the reading actually says — a place their account and the source come apart
3. What they left out — something the reading argues that their passage needed and skipped
4. Push back using the reading — make them defend their line against the source's own words
${docs.length > 1 ? '\nWhere it is genuinely relevant, a question may ask how two of the readings relate — but only using what the topic summaries or the citations below actually say, never inventing a connection between them.' : ''}

Rules, all of them load-bearing:
- Each question must be PROMPTED BY something the student wrote, but must not announce it.
  Never open with "You wrote", "You said", "You mentioned", "You claimed" or "You argue".
  Ask the thing itself. An examiner who quotes you back at yourself every turn is reading
  from a file; one who simply asks the next question is having a conversation.
  Wrong: You wrote 'the Birim watershed'. Which other rivers are affected?
  Right: Which other rivers does the paper find affected?
- Quote their words only where a real contradiction has to be put to them, and at most
  once in the whole set: "Your account has it starting in 2011 — the paper dates it
  differently. Which is right?"
- Every question must be answerable only by someone who read the reading(s). If it can be
  answered from their own passage alone, it is useless here.
- Never invent a figure, date, finding or quotation. If a reading does not contain it, it
  does not exist — this applies just as much to the topic summaries below as to the full
  text; a summary line is not licence to assert something more specific than it says.
- Answerable out loud in under a minute. No yes/no questions.

THE STUDENT'S PASSAGE
${spread(text, 6000)}

${focus.map((d) => `THE READING (${d.name})\n${spread(d.text, docs.length > 1 ? 8000 : 14000)}`).join('\n\n')}
${others?.length ? `\nOTHER READINGS ON THE LIST (topic summaries only — full text not shown)\n${indexSummary(others)}` : ''}
${links.length ? `\nCITATIONS FOUND BETWEEN THE READINGS (matched mechanically against each reading's own reference list, not inferred — treat as fact)\n${links.map((l) => `${l.from} cites ${l.to}`).join('\n')}` : ''}

Reply with JSON only:
{"paths":[{"name":"","description":"","difficulty":"Gentle|Moderate|Hard","minutes":0,"opener":"the first question in quotes","script":[{"question":"","concept":"","expects":["3 to 6 short lowercase terms a complete spoken answer contains"],"probes":[{"condition":"if they ...","followUp":"","missing":["terms whose absence fires this"]}]}]}]}
Exactly four paths, three to five questions each.`
}

function pathsPrompt(name: string, text: string, kind: DocumentKind): string {
  if (kind === 'reading')
    return `You design oral examinations.

Given a text someone was asked to read, write four different angles for finding out
whether they actually engaged with it. Not four topics — four kinds of pressure, each
exposing a different way of having skimmed it:
1. Trace the argument  2. Stress-test the terms it defines  3. Apply it to a case it never mentions  4. Push back on it and make them answer

They did not write this and must never be addressed as though they did. Ask what the text
argues, why, and what follows — never "defend your claim".

Every question must be answerable out loud in under a minute and must be about THIS text —
its specific moves, terms and examples. Never anything generic. A question someone could
answer from the title alone is useless here.

Text: ${name}

${spread(text)}

Reply with JSON only:
{"paths":[{"name":"","description":"","difficulty":"Gentle|Moderate|Hard","minutes":0,"opener":"the first question in quotes","script":[{"question":"","concept":"","expects":["3 to 6 short lowercase terms a complete spoken answer contains"],"probes":[{"condition":"if they ...","followUp":"","missing":["terms whose absence fires this"]}]}]}]}
Exactly four paths, three to five questions each.`

  return `You design oral examinations.

Given a document someone will have to defend in front of other people, write four different angles it could be attacked from. Not four topics — four kinds of pressure, each exposing a different way of not really knowing it:
1. Trace the causal chain  2. Stress-test the definitions  3. Apply it to an unseen case  4. Defend it under objection

Every question must be answerable out loud in under a minute and must be about THIS document — quote its numbers, clauses and names. Never anything generic.

Document: ${name}

${spread(text)}

Reply with JSON only:
{"paths":[{"name":"","description":"","difficulty":"Gentle|Moderate|Hard","minutes":0,"opener":"the first question in quotes","script":[{"question":"","concept":"","expects":["3 to 6 short lowercase terms a complete spoken answer contains"],"probes":[{"condition":"if they ...","followUp":"","missing":["terms whose absence fires this"]}]}]}]}
Exactly four paths, three to five questions each.`
}

/**
 * One more question in an angle already under way.
 *
 * The script a path opens with is not the whole exam any more — `worthContinuing` in
 * examiner.ts decides, from the transcript so far, whether there is still something worth
 * asking, and this is what writes that next question when there is. The decision to
 * continue is deliberately NOT this prompt's job: code decides whether to keep going,
 * grounded in measured coverage rather than a model's sense of when a session feels done;
 * this is asked only once that decision is already made, so its only way to end things is
 * to say, honestly, that it has run out of new ground — which the empty-question reply
 * below covers without needing a second protocol for "stop".
 */
function continuePrompt(path: QuestionPath, answers: Answer[], work: string, docs: SourceDoc[], index: DocIndex | null): string {
  const transcript = answers
    .map((a) => `Q (${a.concept || a.question.slice(0, 40)}): ${a.question}\nCoverage: ${a.coverage}%${a.probed ? ' (needed a follow-up)' : ''}`)
    .join('\n\n')

  const grounding = docs.length
    ? (() => {
        const focus = relevantDocs(work, docs, 2)
        const rest = docs.filter((d) => !focus.includes(d))
        const others = index?.filter((entry) => rest.some((d) => d.name === entry.doc.name))
        const links = docs.length > 1 ? citationsAmong(docs) : []
        return `THE PASSAGE\n${spread(work, 4000)}\n\n${focus.map((d) => `THE READING (${d.name})\n${spread(d.text, 6000)}`).join('\n\n')}${others?.length ? `\n\nOTHER READINGS ON THE LIST (topic summaries only)\n${indexSummary(others)}` : ''}${links.length ? `\n\nCITATIONS FOUND BETWEEN THE READINGS (matched mechanically, treat as fact)\n${links.map((l) => `${l.from} cites ${l.to}`).join('\n')}` : ''}`
      })()
    : `THE PASSAGE\n${spread(work, 8000)}`

  return `You design oral examinations, continuing one already under way.

The angle is "${path.name}" — ${path.description}

So far, in this angle:
${transcript}

${grounding}

Decide whether there is a genuinely new facet of this still worth checking — something none
of the questions above already tested, in the same spirit as the angle above (the way the
questions already asked test DIFFERENT things about the same material, not the same thing
twice). If there is, write ONE more question for it. If everything worth checking here has
already been asked, reply with an empty question rather than repeating or padding one out.

Rules:
- Must be answerable only by someone who actually engaged with ${docs.length ? 'the reading(s)' : 'the material'}, not from common sense or the passage alone.
- Must not repeat, rephrase or lightly vary any question already asked above.
- Answerable out loud in under a minute. No yes/no questions.
- Never invent a figure, date, finding or quotation not present in the text shown.

Reply with JSON only:
{"question":"","concept":"","expects":["3 to 6 short lowercase terms a complete spoken answer contains"],"probes":[{"condition":"if they ...","followUp":"","missing":["terms whose absence fires this"]}]}
Leave "question" empty if there is nothing new worth asking.`
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

/** One question, read the same lenient way whether it came as part of a fresh script or
 *  as a single continuation — a model's JSON habits do not change per call site. */
function readNode(q: any): PathNode | null {
  if (!q || typeof q.question !== 'string' || !q.question.trim()) return null
  return {
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
  /**
   * Score by counting checked claims rather than by asking for a verdict.
   * Null when there are no readings to check against, which is most ordinary use.
   */
  grade(answers: Answer[], docs: SourceDoc[], work: string): Promise<Grade | null>
  /**
   * Which of two transcripts shows more evidence of having read the source.
   * Returns null when the reply could not be read, so the caller can record a tie rather
   * than invent a winner.
   */
  compare(left: string, right: string): Promise<'A' | 'B' | null>
  buildPaths(name: string, text: string, opts?: { kind?: DocumentKind; sources?: SourceDoc[]; index?: DocIndex | null }): Promise<QuestionPath[] | null>
  /**
   * One more question in the same angle, grounded in the transcript so far — how a
   * session keeps going past its opening script instead of stopping at a fixed count.
   * Null means there is nothing left worth asking, which `worthContinuing` in
   * examiner.ts treats the same as reaching the safety ceiling: either way, the
   * examination ends.
   */
  continuePath(path: QuestionPath, answers: Answer[], work: string, docs: SourceDoc[], index: DocIndex | null): Promise<PathNode | null>
  /**
   * One line per reading on what it covers, built once when readings are uploaded.
   *
   * Not a graph — see documents.ts for why. Skips any reading that already has an entry,
   * so adding one more reading to a list of ten does not re-summarise the other nine.
   */
  indexDocuments(docs: SourceDoc[], existing?: DocIndex): Promise<DocIndex>
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

    async compare(left, right) {
      const json = await quiet(COMPARER, comparePrompt(left, right), 700)
      return readWinner(json?.winner)
    },

    async grade(answers, docs, work) {
      const usable = docs.filter((d) => d.text.trim())
      if (!answers.length || !usable.length) return null

      const extracted = await quiet(EXTRACTOR, extractPrompt(answers), 1600)
      const claims = readClaims(extracted?.claims)
      if (!claims.length) return scoreClaims([])

      // Retrieval happens here, in the tab, across every reading at once. Each claim is
      // checked against the passage that bears on it — not against the whole paper, which
      // loses a single sentence in six thousand words, and not against only the reading
      // the student wrote about most, which would let a claim about reading four hide
      // behind reading one just because more students discussed reading one.
      const windows = windowsOf(usable)
      const items = claims.map((claim) => ({ claim, evidence: evidenceFor(claim, windows, usable) }))

      // One retry: this runs once, after the exam is over, with nobody waiting on a live
      // reply, so there is no reason to accept a single dropped call the way judging mid-
      // session has to. A checker call that fails silently defaults every claim to
      // "absent" — indistinguishable from a transcript of someone who knew nothing unless
      // something downstream is told the difference, which is what checkFailed is for.
      let checked = await quiet(CHECKER, checkPrompt(items), 2000)
      if (!checked || !Array.isArray(checked.verdicts)) checked = await quiet(CHECKER, checkPrompt(items), 2000)
      const checkFailed = !checked || !Array.isArray(checked.verdicts)
      const verdicts = readVerdicts(checked?.verdicts, claims.length)

      return scoreClaims(
        claims.map((text, i) => ({
          text,
          support: verdicts[i],
          recycled: recycles(text, work),
          passage: passageFor(text, windows),
        })),
        4,
        checkFailed,
      )
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

    async buildPaths(name, text, opts = {}) {
      const docs = opts.sources?.filter((d) => d.text.trim())
      const json = await quiet(
        'You reply with JSON only.',
        docs?.length ? groundedPrompt(text, docs, opts.index ?? null) : pathsPrompt(name, text, opts.kind ?? 'own-work'),
        8000,
      )
      if (!json || !Array.isArray(json.paths)) return null
      const paths: QuestionPath[] = json.paths
        .filter((p: any) => p && Array.isArray(p.script) && p.script.length > 0)
        .map((p: any) => ({
          name: p.name || 'Path',
          description: p.description || '',
          difficulty: p.difficulty === 'Gentle' || p.difficulty === 'Hard' ? p.difficulty : 'Moderate',
          minutes: Math.max(3, Math.min(60, Number(p.minutes) || p.script.length * 2)),
          opener: p.opener || `“${p.script[0]?.question ?? ''}”`,
          script: p.script.map(readNode).filter((n: PathNode | null): n is PathNode => n !== null),
        }))
        .filter((p: QuestionPath) => p.script.length > 0)
      return paths.length > 0 ? paths : null
    },

    async continuePath(path, answers, work, docs, index) {
      const usable = docs.filter((d) => d.text.trim())
      const json = await quiet('You reply with JSON only.', continuePrompt(path, answers, work, usable, index), 700)
      return readNode(json)
    },

    async indexDocuments(docs, existing = []) {
      const done = new Set(existing.map((e) => e.doc.name))
      // One call per new reading, concurrently — topic extraction on one reading does not
      // depend on another, and waiting for ten of them in series is ten times the wait.
      const built = await Promise.all(
        docs
          .filter((d) => d.text.trim() && !done.has(d.name))
          .map(async (doc) => {
            const json = await quiet(TOPIC_EXTRACTOR, topicPrompt(doc), 800)
            return { doc, topics: readTopics(json?.topics) }
          }),
      )
      return [...existing, ...built]
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
