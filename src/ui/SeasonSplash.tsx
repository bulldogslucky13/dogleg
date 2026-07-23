import { useEffect, useState } from 'react'
import { courseBySlug } from '../engine/courses'
import { toParLabel } from '../engine/daily'
import { previousSeason, seasonEndLabel, seasonForDate, type Season } from '../engine/season'
import { fetchSeasonBoard, podium, type PodiumEntry, type SeasonHolderRow } from '../state/seasonStore'

/**
 * The once-per-rollover season splash: announces the new season and its end
 * date, explains the goal, and — when the season that just ended has any
 * records — recaps it with the podium (most records held) and the full
 * holder list. Day one of a season is records up for grabs, never data lost.
 */
export function SeasonSplash(props: { onClose: () => void; now?: Date }) {
  const season: Season = seasonForDate(props.now)
  const ended = previousSeason(season)
  const [recap, setRecap] = useState<{ podium: PodiumEntry[]; rows: SeasonHolderRow[] } | null>(null)
  useEffect(() => {
    let live = true
    void fetchSeasonBoard(ended.key).then((rows) => {
      if (live && rows && rows.length > 0) {
        setRecap({ podium: podium(rows), rows: [...rows].sort((a, b) => a.toPar - b.toPar) })
      }
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended.key])

  const emoji = { spring: '🌱', summer: '☀️', fall: '🍂', off: '🔥' }[season.slug]
  const medal = ['🥇', '🥈', '🥉']

  return (
    <div className="tut-backdrop" role="dialog" aria-modal="true" aria-label={`${season.name} has begun`}>
      <div className="tut-card season-splash">
        <div className="kicker">A new season on the tee sheet</div>
        <h2 className="tut-title">
          {emoji} {season.name} has begun
        </h2>
        <div className="tut-body">
          Every course record is back up for grabs — set as many as you can before the season closes on{' '}
          <b>{seasonEndLabel(season)}</b>. Hold them to the horn and they hang on your Clubhouse wall forever.
          All-time records still stand; the season board is the live race.
        </div>

        {recap && (
          <>
            <div className="kicker season-recap-kicker">How {ended.label} ended</div>
            <div className="season-podium">
              {recap.podium.map((p) => (
                <div key={p.playerName} className={`podium-spot place-${p.place}`}>
                  <span className="podium-medal">{medal[p.place - 1]}</span>
                  <b>{p.playerName}</b>
                  <span>
                    {p.records} record{p.records === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
            </div>
            <div className="season-holders">
              {recap.rows.map((r) => (
                <div key={r.courseSlug} className="season-holder-row">
                  <span>{courseBySlug(r.courseSlug)?.name ?? r.courseSlug}</span>
                  <b>
                    {toParLabel(r.toPar)} · {r.playerName}
                  </b>
                </div>
              ))}
            </div>
          </>
        )}

        <button className="cta" onClick={props.onClose}>
          To the first tee
        </button>
      </div>
    </div>
  )
}
