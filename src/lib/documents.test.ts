import { describe, expect, it } from 'vitest'
import { citationsAmong, indexSummary, readTopics, relevantDocs, type DocIndex } from './documents'
import type { SourceDoc } from './claims'

/**
 * The non-model half of the reading-list index: which readings a passage is routed to,
 * and how the index reads back once built. This is the piece standing in for a knowledge
 * graph, so it earns the same suspicion a graph would — a routing bug here sends a
 * question-generation prompt the wrong reading's full text and the right reading's silence.
 */

const doc = (name: string, text: string): SourceDoc => ({ name, text })

const SINGER = doc('Singer', 'Singer argues distance is not morally relevant to famine relief obligations charity duty')
const MILL = doc('Mill', 'Mill argues the harm principle limits state power over self-regarding conduct liberty')
const SNAPIR = doc('Snapir', 'Snapir maps galamsey gold mining expansion in the Birim watershed using satellite imagery')

describe('relevantDocs', () => {
  it('returns everything when the list is not longer than what was asked for', () => {
    expect(relevantDocs('anything', [SINGER, MILL], 2)).toEqual([SINGER, MILL])
  })

  it('routes to the reading that shares the passage’s vocabulary', () => {
    const picked = relevantDocs('I think the harm principle only limits conduct that affects others', [SINGER, MILL, SNAPIR], 1)
    expect(picked).toEqual([MILL])
  })

  it('routes the other way just as readily', () => {
    const picked = relevantDocs('Distance should not affect our duty to relieve suffering from famine', [SINGER, MILL, SNAPIR], 1)
    expect(picked).toEqual([SINGER])
  })

  it('falls back to the first N when the passage is empty', () => {
    expect(relevantDocs('   ', [SINGER, MILL, SNAPIR], 2)).toEqual([SINGER, MILL])
  })

  it('does not pad the result with an irrelevant reading just to reach `take`', () => {
    // The passage concerns only Snapir. Singer and Mill both score zero — a tie the old
    // stable sort would have broken by array order, handing the second slot to whichever
    // of them happened to come first, though neither is actually relevant.
    const picked = relevantDocs('galamsey mining watershed expansion satellite imagery', [SINGER, MILL, SNAPIR], 2)
    expect(picked).toEqual([SNAPIR])
  })

  it('falls back to the first N when the passage shares nothing with any reading at all', () => {
    expect(relevantDocs('a passage entirely about something else', [SINGER, MILL, SNAPIR], 2)).toHaveLength(2)
  })

  it('never returns more than asked for', () => {
    expect(relevantDocs('galamsey mining watershed', [SINGER, MILL, SNAPIR], 1)).toHaveLength(1)
  })
})

describe('indexSummary', () => {
  it('names every reading and lists its topics', () => {
    const index: DocIndex = [
      { doc: SINGER, topics: [{ text: 'distance is not morally relevant' }] },
      { doc: MILL, topics: [{ text: 'the harm principle' }, { text: 'liberty of thought vs action' }] },
    ]
    const summary = indexSummary(index)
    expect(summary).toContain('Singer:')
    expect(summary).toContain('distance is not morally relevant')
    expect(summary).toContain('Mill:')
    expect(summary).toContain('liberty of thought vs action')
  })

  it('says so for a reading with no summary rather than leaving a blank line', () => {
    const index: DocIndex = [{ doc: SINGER, topics: [] }]
    expect(indexSummary(index)).toContain('(no summary)')
  })
})

describe('citationsAmong', () => {
  const FORKUOR = doc(
    'Forkuor.pdf',
    'Forkuor monitors mining with Sentinel-1 imagery in the Birim watershed.\n\nReferences\nSnapir, B. (2017) Mapping gold mining expansion. Owusu-Nimo, F. (2018) Illegal mining sites.',
  )
  const SNAPIR = doc('Snapir.pdf', 'Snapir maps galamsey gold mining expansion.\n\nReferences\nForkuor, G. (2016) Monitoring with radar.')
  const OWUSU = doc('Owusu-Nimo.pdf', 'Owusu-Nimo maps illegal mining sites in Ghana.\n\nReferences\nNone of the others are mentioned here.')

  it('finds a citation when a reading’s reference list names another reading', () => {
    expect(citationsAmong([FORKUOR, SNAPIR, OWUSU])).toContainEqual({ from: 'Forkuor.pdf', to: 'Snapir.pdf' })
  })

  it('finds citations in both directions independently', () => {
    const links = citationsAmong([FORKUOR, SNAPIR, OWUSU])
    expect(links).toContainEqual({ from: 'Snapir.pdf', to: 'Forkuor.pdf' })
    expect(links).toContainEqual({ from: 'Forkuor.pdf', to: 'Owusu-Nimo.pdf' })
  })

  it('reports nothing for a reading that cites none of the others', () => {
    const links = citationsAmong([FORKUOR, SNAPIR, OWUSU])
    expect(links.filter((l) => l.from === 'Owusu-Nimo.pdf')).toEqual([])
  })

  it('never invents a link from a filename with no name-like word', () => {
    const anon = doc('2609.15904.pdf', 'Some text.\n\nReferences\nForkuor, G. and Snapir, B. are both cited here.')
    expect(citationsAmong([anon, FORKUOR, SNAPIR])).not.toContainEqual({ from: 'Forkuor.pdf', to: '2609.15904.pdf' })
  })

  it('does not cite a reading against itself', () => {
    expect(citationsAmong([SNAPIR])).toEqual([])
  })
})

describe('readTopics', () => {
  it('takes plain strings, the same leniency claim extraction needs', () => {
    expect(readTopics(['argues X', 'shows Y'])).toEqual([{ text: 'argues X' }, { text: 'shows Y' }])
  })

  it('takes the object shape a model sometimes prefers', () => {
    expect(readTopics([{ topic: 'argues X' }])).toEqual([{ text: 'argues X' }])
  })

  it('returns an empty list for a malformed reply rather than throwing', () => {
    expect(readTopics(undefined)).toEqual([])
  })
})
