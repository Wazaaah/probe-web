import type { ConceptScore, Person, QuestionPath } from './types'

/**
 * The content the design ships with, matching the Android build line for line so both
 * clients quote the same documents, people and paths as each other.
 */

export const LEARNER: Person = {
  initials: 'KO',
  name: 'Kwame Okafor',
  meta: 'VP Finance · 6 sessions · avg 79',
}

export const REVIEWER: Person = {
  initials: 'AA',
  name: 'Adwoa Asante',
  meta: 'Reviewer · 4 people · 23 paths sent',
}

export const TERM_SHEET = 'Series A Term Sheet.pdf'

export const SEED_PATHS: QuestionPath[] = [
  {
    name: 'Trace the causal chain',
    description: 'Checks he can connect the liquidation stack to what he actually walks away with.',
    difficulty: 'Moderate',
    minutes: 13,
    opener: '“Walk me from a forty million dollar exit to the number that lands in your account. Every step.”',
    script: [
      {
        question: 'Walk me from a forty million dollar exit to the number that lands in your account. Every step.',
        concept: 'Exit waterfall',
        expects: ['preference', 'investor', 'remaining', 'common'],
        probes: [{
          condition: 'if he skips the preference',
          followUp: 'You jumped to your own shares. What comes out before common sees anything?',
          missing: ['preference', 'preferred', 'first'],
        }],
      },
      {
        question: 'Now change one thing. The exit is twenty million instead. What happens to your number?',
        concept: 'Downside sensitivity',
        expects: ['less', 'nothing', 'zero', 'wiped'],
        probes: [{
          condition: "if he doesn't reach zero",
          followUp: 'Work it through. Is there anything left for common at all?',
          missing: ['nothing', 'zero', 'none'],
        }],
      },
      {
        question: 'Where in that chain do you have any leverage to negotiate?',
        concept: 'Negotiating room',
        expects: ['preference', 'multiple', 'cap', 'negotiate'],
        probes: [],
      },
    ],
  },
  {
    name: 'Stress-test the definitions',
    description: 'Pushes on the terms he uses loosely — participating preferred, pro rata, full ratchet.',
    difficulty: 'Gentle',
    minutes: 9,
    opener: '“Define participating preferred the way clause 3 writes it. What does the investor get twice?”',
    script: [
      {
        question: 'Define participating preferred the way clause 3 writes it. What does the investor get twice?',
        concept: 'Participating preferred',
        expects: ['preference', 'share', 'common', 'double'],
        probes: [
          {
            condition: 'if he stops at “they get their money back”',
            followUp: "That's the first half. Once the preference is paid, what else do they take part in?",
            missing: ['share', 'participate', 'remaining'],
          },
          {
            condition: "if he can't name the double-dip",
            followUp: 'There is a name for taking the preference and then sharing again. What is it?',
            missing: ['double', 'dip', 'twice'],
          },
        ],
      },
      {
        question: 'Your liquidation preference is one and a half times. At a forty million dollar exit, what do common holders actually receive?',
        concept: 'Liquidation preference',
        expects: ['million', 'remaining', 'common', 'after'],
        probes: [{
          condition: 'if the arithmetic is hand-waved',
          followUp: 'Give me the actual number. The investor takes their preference first — how much is left?',
          missing: ['million', 'twenty', 'thirty'],
        }],
      },
      {
        question: 'The pro rata right is uncapped. What does that cost you in the next two rounds?',
        concept: 'Pro rata rights',
        expects: ['dilut', 'ownership', 'allocation', 'round'],
        probes: [{
          condition: 'if he treats it as free',
          followUp: 'Uncapped means they can take as much of the round as they want. Who loses that allocation?',
          missing: ['dilut', 'allocation', 'squeeze'],
        }],
      },
      {
        question: 'Clause 7 gives them a board seat. Which decisions can they now block?',
        concept: 'Board and control',
        expects: ['board', 'veto', 'protective', 'consent'],
        probes: [{
          condition: 'if he confuses veto with consent rights',
          followUp: 'A board seat and a protective provision are not the same lever. Which one actually blocks a sale?',
          missing: ['protective', 'consent', 'class vote'],
        }],
      },
    ],
  },
  {
    name: 'Apply it to an unseen case',
    description: "Drops a down round he hasn't read about and sees whether the terms still make sense.",
    difficulty: 'Hard',
    minutes: 18,
    opener: '“Next round prices at half this one. Who gets diluted first, and by how much?”',
    script: [
      {
        question: 'Next round prices at half this one. Who gets diluted first, and by how much?',
        concept: 'Down round mechanics',
        expects: ['common', 'founder', 'ratchet', 'dilut'],
        probes: [{
          condition: "if he hasn't read the anti-dilution clause into it",
          followUp: 'There is a clause that protects the investor from exactly this. What does it do to your ownership?',
          missing: ['ratchet', 'anti-dilution', 'reprice'],
        }],
      },
      {
        question: 'Your lead asks for a pay-to-play. Is that good or bad for you?',
        concept: 'Pay-to-play',
        expects: ['participate', 'convert', 'common'],
        probes: [],
      },
      {
        question: 'You need bridge money before that round. What in this sheet gets in the way?',
        concept: 'Bridge constraints',
        expects: ['consent', 'approval', 'pro rata', 'block'],
        probes: [],
      },
    ],
  },
  {
    name: 'Defend it under objection',
    description: "Argues the investor's side and makes him hold his ground on the terms he conceded.",
    difficulty: 'Hard',
    minutes: 16,
    opener: '“You gave up a board seat and a 1.5x preference. Convince me that wasn\'t naive.”',
    script: [
      {
        question: "You gave up a board seat and a one and a half times preference. Convince me that wasn't naive.",
        concept: 'Defending the terms',
        expects: ['valuation', 'traction', 'leverage', 'exchange'],
        probes: [{
          condition: 'if he retreats to “it was the only offer”',
          followUp: 'That is a circumstance, not a defence. What did you get in exchange?',
          missing: ['valuation', 'price', 'runway', 'exchange'],
        }],
      },
      {
        question: "I would argue the preference alone costs you more than the valuation gained you. Show me I'm wrong.",
        concept: 'Trade-off arithmetic',
        expects: ['exit', 'above', 'below', 'worth'],
        probes: [{
          condition: 'if he argues without numbers',
          followUp: 'Put an exit number on it. Above what price does the preference stop mattering?',
          missing: ['million', 'above', 'threshold'],
        }],
      },
      {
        question: 'Last one. What would you refuse to concede if we did this again?',
        concept: 'Held ground',
        expects: ['preference', 'board', 'consent', 'refuse'],
        probes: [],
      },
    ],
  },
]

export interface DocumentHistory {
  document: string
  runs: { title: string; meta: string; score: number }[]
}

export const HISTORY: DocumentHistory[] = [
  {
    document: 'Q3 Board Deck',
    runs: [
      { title: 'Defend it under objection', meta: 'Sept 3 · 16 min · 7 questions, 3 probes', score: 78 },
      { title: 'Trace the causal chain', meta: 'Aug 30 · 12 min · 6 questions, 5 probes', score: 64 },
    ],
  },
  {
    document: 'New Hire Security Policy',
    runs: [{ title: 'Stress-test the definitions', meta: 'Aug 28 · 11 min · 5 questions, 1 probe', score: 84 }],
  },
  {
    document: 'Warehouse Migration Runbook',
    runs: [
      { title: 'Apply it to an unseen case', meta: 'Aug 19 · 14 min · 6 questions, 2 probes', score: 71 },
      { title: 'Trace the causal chain', meta: 'Aug 12 · 9 min · 5 questions, 4 probes', score: 58 },
    ],
  },
]

export const PEOPLE: Person[] = [
  LEARNER,
  { initials: 'PR', name: 'Priya Raman', meta: 'Corp Dev · 3 sessions · avg 88' },
  { initials: 'LS', name: 'Lena Sørensen', meta: 'Ops · 9 sessions · avg 82' },
  { initials: 'TN', name: 'Tomás Neves', meta: 'Clinical · 4 sessions · avg 91' },
]

export const REPORT_BARS: ConceptScore[] = [
  { label: 'Reporting obligations', state: 'gap', percent: 0 },
  { label: 'Device encryption rules', state: 'solid', percent: 92 },
  { label: 'Access review cadence', state: 'solid', percent: 84 },
  { label: 'Vendor exceptions', state: 'shaky', percent: 58 },
]

export const SESSION_INTRO =
  "I've read it. I'm going to ask you about it. Answer out loud, and take your time."
