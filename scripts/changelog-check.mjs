/**
 * The change-log gate — the mechanism behind the CLAUDE.md rule that player-
 * visible changes ship a change-log entry IN THE SAME PR.
 *
 * The rule used to be enforcement-by-memory, and it failed exactly once and
 * exactly how you'd expect: the UI re-skin (#79) — the PR that CREATED the
 * change-log screen — shipped without an entry for itself. This check makes
 * forgetting impossible: a PR that neither updates src/lib/changelog.ts nor
 * is legitimately exempt goes red, with a message saying exactly what to do.
 *
 * Entries stay HAND-WRITTEN in the game's voice — this deliberately gates
 * rather than generates. A bot writing player-facing copy from PR titles
 * would fill the log with dev-speak, and the log is a trust surface.
 *
 * Exemptions (see CLAUDE.md "Change log" section):
 *  - label `course`, or a diff touching ONLY course-work paths → skipped by
 *    default (Jackson's rule: per-course work never floods the feed).
 *    Label `changelog-include` overrides — the entry is then required.
 *  - label `no-changelog` → deliberate skip for player-invisible PRs
 *    (refactors, CI, docs). Use sparingly; the label is the audit trail.
 *
 * Pure function + thin CLI so the policy is unit-tested in the same suite
 * as everything else; the workflow just feeds it the PR's files and labels.
 */

export const CHANGELOG_FILE = 'src/lib/changelog.ts'

/** A PR whose every file matches these is course work: imports, geometry
 * passes, scorecard corrections, rating regens, and the version bump +
 * tests + docs + assets that ride along. */
const COURSE_WORK = [
  /^src\/engine\/geometry\.ts$/,
  /^src\/engine\/courses\.ts$/,
  /^src\/engine\/playRatings\.ts$/,
  /^src\/engine\/version\.ts$/,
  /^scripts\//,
  /^docs\//,
  /^public\//,
  /\.test\.(ts|tsx|mjs)$/,
  /\.md$/,
]

/**
 * @param {{ files: string[], labels: string[] }} pr
 * @returns {{ ok: boolean, reason: string }}
 */
export function checkChangelog({ files, labels }) {
  const has = (l) => labels.includes(l)
  const touchesLog = files.includes(CHANGELOG_FILE)

  if (has('no-changelog')) {
    return { ok: true, reason: 'label no-changelog: deliberate skip (player-invisible change)' }
  }

  const courseByLabel = has('course')
  const courseByPaths = files.length > 0 && files.every((f) => COURSE_WORK.some((re) => re.test(f)))

  if ((courseByLabel || courseByPaths) && !has('changelog-include')) {
    return {
      ok: true,
      reason: courseByLabel
        ? 'label course: course work is excluded from the change log by default'
        : 'diff touches only course-work paths: excluded from the change log by default',
    }
  }

  if (touchesLog) {
    return { ok: true, reason: `${CHANGELOG_FILE} updated in this PR` }
  }

  return {
    ok: false,
    reason: [
      `This PR looks player-visible but does not update ${CHANGELOG_FILE}.`,
      '',
      'Do ONE of the following:',
      `  - Add an entry to ${CHANGELOG_FILE} (kind: odds | feature | fix | design),`,
      '    written in the game\'s voice — see the header comment in that file.',
      '  - Label the PR `course` if this is course work (excluded by default).',
      '  - Label the PR `no-changelog` if players genuinely cannot see this change.',
      '',
      'Course work you DO want logged: keep `course` and add `changelog-include`,',
      'then write the entry.',
    ].join('\n'),
  }
}

// ---- CLI: node scripts/changelog-check.mjs '<files-json>' '<labels-json>' ----
const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (invokedDirectly && process.argv.length >= 4) {
  const files = JSON.parse(process.argv[2])
  const labels = JSON.parse(process.argv[3])
  const result = checkChangelog({ files, labels })
  console.log(result.ok ? `✓ change-log gate: ${result.reason}` : `✗ change-log gate\n\n${result.reason}`)
  process.exit(result.ok ? 0 : 1)
}
