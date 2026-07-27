/**
 * Course names for tight rows.
 *
 * The library names courses "Primary — Variant" ("Royal Portrush — Dunluce
 * Links", "TPC Sawgrass — Stadium"). In a Clubhouse round row that runs out of
 * width mid-word and ellipsises to "ROYAL PORTRUS…", which reads as broken
 * rather than abbreviated. Dropping the variant gives a name that is short AND
 * complete.
 *
 * Safe to drop: every pre-dash prefix in the 49-course library is unique, so no
 * two courses can collapse to the same label. If a future course would collide
 * (a second "Carnoustie — …", say), this has to become smarter — the rows would
 * otherwise be indistinguishable.
 */
export function shortCourseName(name: string): string {
  const cut = name.indexOf('—')
  return cut === -1 ? name : name.slice(0, cut).trim()
}
