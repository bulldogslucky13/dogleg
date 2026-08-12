// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_BROWSE_PREFS, loadBrowsePrefs, saveBrowsePrefs } from './browsePrefs'

beforeEach(() => {
  localStorage.clear()
})

describe('browse preferences — the course list remembers its view', () => {
  it('defaults when nothing is stored', () => {
    expect(loadBrowsePrefs()).toEqual(DEFAULT_BROWSE_PREFS)
  })

  it('round-trips a full configuration', () => {
    const prefs = {
      recType: 'alltime',
      played: 'unplayed',
      rating: 'hard',
      record: 'attainable',
      favsOnly: true,
      sort: 'beatable',
    } as const
    saveBrowsePrefs(prefs)
    expect(loadBrowsePrefs()).toEqual(prefs)
  })

  it('sanitizes field by field: an unknown value degrades alone, not the whole view', () => {
    localStorage.setItem(
      'dogleg:course-browse:v1',
      JSON.stringify({ recType: 'alltime', played: 'sometimes', rating: 'hard', record: 42, favsOnly: 'yes', sort: 'newest' }),
    )
    expect(loadBrowsePrefs()).toEqual({
      recType: 'alltime', // valid, kept
      played: 'all', // unknown → default
      rating: 'hard', // valid, kept
      record: 'any', // wrong type → default
      favsOnly: false, // non-boolean → default
      sort: 'tour', // removed/unknown option → default
    })
  })

  it('corrupt JSON falls back to defaults rather than throwing', () => {
    localStorage.setItem('dogleg:course-browse:v1', '{not json')
    expect(loadBrowsePrefs()).toEqual(DEFAULT_BROWSE_PREFS)
  })
})
