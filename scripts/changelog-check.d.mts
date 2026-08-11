/** Types for the change-log gate (see changelog-check.mjs — plain JS so the
 * CI workflow runs it with bare node, no build step). */
export declare const CHANGELOG_FILE: string
export declare function checkChangelog(pr: { files: string[]; labels: string[] }): {
  ok: boolean
  reason: string
}
