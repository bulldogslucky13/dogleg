import { describe, expect, it } from 'vitest'
import { checkChangelog, CHANGELOG_FILE } from '../../scripts/changelog-check.mjs'

// The gate that makes the CLAUDE.md same-PR rule mechanical. The founding
// counterexample: the re-skin (#79) — player-visible everywhere — shipped
// without an entry. First test pins that exact shape as a failure.
describe('the change-log gate', () => {
  it("fails the re-skin's shape: player-visible files, no entry, no labels", () => {
    const r = checkChangelog({ files: ['src/ui/broadcast.css', 'src/ui/screens.tsx'], labels: [] })
    expect(r.ok).toBe(false)
    expect(r.reason).toContain(CHANGELOG_FILE)
  })

  it('passes when the PR carries an entry', () => {
    const r = checkChangelog({ files: ['src/ui/screens.tsx', CHANGELOG_FILE], labels: [] })
    expect(r.ok).toBe(true)
  })

  it('course work is excluded by default — by label, and by paths alone', () => {
    expect(checkChangelog({ files: ['src/ui/HoleMap.tsx'], labels: ['course'] }).ok).toBe(true)
    // Cam's typical unlabeled import: geometry + courses + ratings + version + docs
    const importPR = {
      files: [
        'src/engine/geometry.ts',
        'src/engine/courses.ts',
        'src/engine/playRatings.ts',
        'src/engine/version.ts',
        'docs/course-import.md',
        'src/engine/rough.test.ts',
      ],
      labels: [],
    }
    expect(checkChangelog(importPR).ok).toBe(true)
  })

  it('changelog-include overrides the course exclusion: entry becomes required', () => {
    const files = ['src/engine/geometry.ts', 'src/engine/courses.ts']
    expect(checkChangelog({ files, labels: ['course', 'changelog-include'] }).ok).toBe(false)
    expect(checkChangelog({ files: [...files, CHANGELOG_FILE], labels: ['course', 'changelog-include'] }).ok).toBe(
      true,
    )
  })

  it('no-changelog is the deliberate skip', () => {
    expect(checkChangelog({ files: ['src/ui/screens.tsx'], labels: ['no-changelog'] }).ok).toBe(true)
  })

  it('a mixed diff (course files + app files) is NOT course work', () => {
    const r = checkChangelog({ files: ['src/engine/geometry.ts', 'src/ui/screens.tsx'], labels: [] })
    expect(r.ok).toBe(false)
  })

  it('an empty diff is not course work (paths rule needs files to judge)', () => {
    expect(checkChangelog({ files: [], labels: [] }).ok).toBe(false)
  })
})
