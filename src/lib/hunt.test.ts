import { describe, expect, it } from 'vitest'
import { seasonHunt } from './hunt'

// holders are ids — names are shared, so a namesake's record is still a target
const idOf = (name: string) => `id-${name.toLowerCase()}`
const ME = idOf('me')
const rec = (player_name: string, to_par: number) => ({ player_id: idOf(player_name), to_par })
const COURSES = ['a', 'b', 'c', 'd']

describe('seasonHunt counts records actually within reach', () => {
  it('open + beatable count; strong records and my own do not', () => {
    const recs = new Map([
      ['a', rec('Hank', -2)], // beatable (>= -4)
      ['b', rec('Marge', -9)], // out of reach
      ['c', rec('ME', -1)], // mine — a trophy, not a target
      // d: open
    ])
    const h = seasonHunt(recs, COURSES, ME, -4)!
    expect(h).toEqual({ total: 2, open: 1, worst: -2 })
  })

  it('worst is the softest standing target, not the open courses', () => {
    const recs = new Map([
      ['a', rec('Hank', -4)],
      ['b', rec('Marge', +2)],
    ])
    expect(seasonHunt(recs, COURSES, null, -4)!.worst).toBe(2)
  })

  it('an unreachable board hunts nothing; an empty board hunts everything', () => {
    expect(seasonHunt(null, COURSES, ME, -4)).toBeNull()
    expect(seasonHunt(new Map(), COURSES, ME, -4)).toEqual({ total: 4, open: 4, worst: null })
  })

  it('anonymous players hunt every takeable record', () => {
    const recs = new Map([['a', rec('Hank', -3)]])
    expect(seasonHunt(recs, COURSES, null, -4)!.total).toBe(4) // 1 beatable + 3 open
  })
})
