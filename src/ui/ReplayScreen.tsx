import { useEffect, useMemo, useRef, useState } from 'react'
import { characterById } from '../engine/characters'
import { toParLabel } from '../engine/daily'
import { replayFrames, type ReplayPayload } from '../engine/replay'
import { GreenView, HoleMap, useMapSize } from './HoleMap'
import { CharacterAvatar } from './Avatars'

/**
 * Watch a round shot by shot. Frames are reconstructed from pure data
 * (seed + decisions) by the same deterministic engine that played it —
 * a replay link IS the round.
 */
export function ReplayScreen(props: { payload: ReplayPayload; onExit: () => void }) {
  const { payload } = props
  const frames = useMemo(
    () => replayFrames(payload.seed, payload.character, payload.decisions),
    [payload],
  )
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(true)
  const timer = useRef<number | null>(null)
  const [mapRef, mapSize] = useMapSize()

  const last = frames ? frames.length - 1 : 0

  // A second #watch= link can arrive while this screen is mounted — restart
  // from the new round's first frame. The effect lands after render, so the
  // render below also CLAMPS the index: a shorter replay must never read
  // past its last frame on that first pass.
  useEffect(() => {
    setI(0)
    setPlaying(true)
  }, [payload])

  useEffect(() => {
    if (!playing || !frames) return
    timer.current = window.setTimeout(() => {
      setI((v) => {
        if (v >= last) {
          setPlaying(false)
          return v
        }
        return v + 1
      })
    }, 1500)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [playing, i, frames, last])

  if (!frames) {
    return (
      <div className="screen">
        <p className="tagline center">That replay link doesn't parse — maybe it got truncated in the chat?</p>
        <button className="cta" onClick={props.onExit}>
          Clubhouse
        </button>
      </div>
    )
  }

  const idx = Math.min(i, last)
  const f = frames[idx]
  const hole = f.hole
  const spec = hole.layout.spec
  const char = characterById(payload.character)
  const holeToPar = f.runningToPar + (hole.score ? hole.score.strokes - spec.par : 0)
  const done = idx >= last
  const lastShot = hole.shots.length > 0 ? hole.shots[hole.shots.length - 1] : null
  // first frame index of every hole, for the jump strip
  const holeStarts: number[] = []
  frames.forEach((fr, idx) => {
    if (fr.shotIndex === 0) holeStarts[fr.holeIndex] = idx
  })

  return (
    <div className="screen play replaying">
      <div className="top-row">
        <button className="home-link" onClick={props.onExit}>
          ‹ Exit replay
        </button>
        <div className="char-chip">
          {char && <CharacterAvatar id={char.id} size={26} />}
          <span className="char-chip-name">
            {payload.name ? `${payload.name}'s round` : 'Round replay'}
          </span>
        </div>
        <span className="home-link replay-live">▶ REPLAY</span>
      </div>

      <header className="hole-head">
        <div className="hole-id">
          <div className="hole-num">{spec.number}</div>
          <div>
            <div className="hole-par">
              Par {spec.par} · SI {spec.strokeIndex}
            </div>
            <div className="chips slim">
              <span className="chip">{hole.layout.spec.yards} yards</span>
              <span className="chip">
                {hole.strokes === 0 ? 'On the tee' : `${hole.strokes} stroke${hole.strokes === 1 ? '' : 's'}`}
              </span>
            </div>
          </div>
        </div>
        <div className="hole-right">
          <span className={`topar${holeToPar < 0 ? ' good' : holeToPar > 0 ? ' bad' : ''}`}>
            {toParLabel(holeToPar)} thru {f.holeIndex + (hole.score ? 1 : 0)}
          </span>
        </div>
      </header>

      <div ref={mapRef} className="map-wrap">
        {hole.stage === 'putt' ? (
          <GreenView feet={hole.ball.puttFeet ?? 20} holeNumber={spec.number} greens={hole.cond.greens} size={mapSize} />
        ) : (
          <HoleMap
            layout={hole.layout}
            ball={hole.ball}
            previewWindow={null}
            previewApproach={null}
            previewChoice={null}
            size={mapSize}
          />
        )}
        <div className="map-overlay top">
          <div className="status">
            <span className={`dot ${hole.status.tone}`} />
            <div>
              <b>{hole.score ? hole.score.note : hole.status.title}</b>
              {!hole.score && <p>{hole.status.note}</p>}
            </div>
          </div>
        </div>
        {lastShot && (
          <div className="map-overlay bottom">
            <div className={`replay-choice ${lastShot.choice}`}>
              <span className="replay-choice-dot" />
              Went {lastShot.choice}
              {lastShot.penalty ? ' · +1 penalty' : ''}
            </div>
          </div>
        )}
      </div>

      <div className="replay-controls">
        <button className="cta ghost slim" onClick={() => setI(Math.max(0, idx - 1))} disabled={idx === 0}>
          ‹ Back
        </button>
        <button className="cta slim" onClick={() => (done ? (setI(0), setPlaying(true)) : setPlaying((p) => !p))}>
          {done ? '↻ Watch again' : playing ? '❚❚ Pause' : '▶ Play'}
        </button>
        <button className="cta ghost slim" onClick={() => setI(Math.min(last, idx + 1))} disabled={done}>
          Next ›
        </button>
      </div>
      <div className="replay-holes" role="group" aria-label="Jump to hole">
        {holeStarts.map((start, h) => (
          <button
            key={h}
            className={`replay-hole${f.holeIndex === h ? ' on' : ''}`}
            aria-label={`Jump to hole ${h + 1}`}
            onClick={() => {
              setPlaying(false)
              setI(start)
            }}
          >
            {h + 1}
          </button>
        ))}
      </div>
      <div className="replay-scrub">
        <input
          type="range"
          min={0}
          max={last}
          value={idx}
          onChange={(e) => {
            setPlaying(false)
            setI(Number(e.target.value))
          }}
          aria-label="Replay position"
        />
        <span className="fine">
          Hole {f.holeIndex + 1} of 18{done ? ` — final: ${toParLabel(frames[last].runningToPar + (frames[last].hole.score ? frames[last].hole.score.strokes - frames[last].hole.layout.spec.par : 0))}` : ''}
        </span>
      </div>
    </div>
  )
}
