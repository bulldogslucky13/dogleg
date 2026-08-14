import { useState } from 'react'
import { characterById } from '../engine/characters'
import { courseBySlug } from '../engine/courses'
import { RESULT_SQUARE, SITE_URL, toParLabel } from '../engine/daily'
import type { CharacterId, Choice, HoleResult } from '../engine/types'
import { track } from '../lib/analytics'
import {
  challengeShareText,
  challengeUrl,
  challengeVerdict,
  verdictCopy,
  type Challenge,
  type ChallengeAttempt,
} from '../lib/challenge'
import { loadPlayer } from '../lib/leaderboard'
import { CharacterAvatar } from './Avatars'
import { Wordmark } from './Wordmark'

/** copy/native-share pair, same contract as the wrap screen's share card:
 * no success claim the clipboard didn't earn, AbortError is a closed sheet */
export function useShareActions(text: string, onShared: (method: 'native' | 'clipboard') => void) {
  const [copied, setCopied] = useState(false)
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const copy = async () => {
    let ok = true
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      ok = document.execCommand('copy')
      ta.remove()
    }
    if (!ok) return
    onShared('clipboard')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  const share = async () => {
    try {
      await navigator.share({ text })
      onShared('native')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      await copy()
    }
  }
  return { copied, copy, share, canNativeShare }
}

function SquareRows(props: { results: HoleResult[] }) {
  const rows: HoleResult[][] = []
  for (let i = 0; i < props.results.length; i += 9) rows.push(props.results.slice(i, i + 9))
  return (
    <span className="faceoff-squares">
      {rows.map((row, i) => (
        <span key={i}>{row.map((r) => RESULT_SQUARE[r]).join('')}</span>
      ))}
    </span>
  )
}

/**
 * The head-to-head card: their signed round against yours, verdict beneath,
 * and the loop's next throw — a revenge link when you took it, your card
 * (with the original gauntlet, still live) when you didn't. Rendered on the
 * wrap screen the moment an attempt finishes, and again whenever the
 * challenge link is re-opened.
 */
export function ChallengeFaceoff(props: {
  challenge: Challenge
  mine: { toPar: number; results: HoleResult[]; seed: string; character?: CharacterId; decisions: Choice[][] }
}) {
  const ch = props.challenge
  const course = courseBySlug(ch.courseSlug)
  const rivalName = ch.from.name ?? 'Your rival'
  const verdict = challengeVerdict(props.mine.toPar, ch.from.toPar)
  const won = verdict === 'won'
  const myName = loadPlayer()?.name ?? null
  // the next throw of the rally: my round when I took it, their still-standing
  // gauntlet when I didn't — either way the text carries a live challenge link
  const text = won
    ? challengeShareText({
        courseName: course?.name ?? ch.courseSlug,
        toPar: props.mine.toPar,
        url: challengeUrl({
          seed: props.mine.seed,
          character: props.mine.character,
          decisions: props.mine.decisions,
          name: myName ?? undefined,
          rally: ch.rally + 1,
        }),
        rally: ch.rally + 1,
      })
    : [
        `⚔️ Challenge survived. ${toParLabel(ch.from.toPar)} at ${course?.name ?? ch.courseSlug} held off my ${toParLabel(props.mine.toPar)}.`,
        `Think you can do better? One attempt:`,
        `https://${SITE_URL}/#challenge=${ch.code}`,
      ].join('\n')
  const { copied, copy, share, canNativeShare } = useShareActions(text, (method) =>
    track('challenge_sent', { method, kind: won ? 'revenge' : 'reply', rally: ch.rally + (won ? 1 : 0) }),
  )
  return (
    <div className="faceoff">
      <div className="kicker">The head-to-head</div>
      <div className={`faceoff-row${!won ? ' winner' : ''}`}>
        <b className="faceoff-name">{rivalName}</b>
        <SquareRows results={ch.from.results} />
        <b className="faceoff-score">{toParLabel(ch.from.toPar)}</b>
      </div>
      <div className={`faceoff-row${won ? ' winner' : ''}`}>
        <b className="faceoff-name">{myName ?? 'You'}</b>
        <SquareRows results={props.mine.results} />
        <b className="faceoff-score">{toParLabel(props.mine.toPar)}</b>
      </div>
      <p className="verdict faceoff-verdict">{verdictCopy(verdict, rivalName)}</p>
      <div className="share-actions">
        <button className="cta ghost" onClick={copy}>
          {copied ? 'Copied ✓' : won ? 'Copy revenge link' : 'Copy your reply'}
        </button>
        {canNativeShare && (
          <button className="cta" onClick={share}>
            {won ? '⚔️ Send the revenge challenge' : 'Send your card back'}
          </button>
        )}
      </div>
      {won && !myName && (
        <p className="fine">Your revenge link goes out unsigned — claim a clubhouse name and it carries your name.</p>
      )}
    </div>
  )
}

/**
 * Where a #challenge= link lands. Three states, driven by the ledger:
 * fresh (take it), underway (resume where you stood), done (the head-to-head).
 */
export function ChallengeScreen(props: {
  challenge: Challenge
  attempt: ChallengeAttempt | null
  onAccept: () => void
  onResume: () => void
  onWatch: () => void
  onHome: () => void
}) {
  const ch = props.challenge
  const course = courseBySlug(ch.courseSlug)
  const rivalName = ch.from.name ?? 'A rival'
  const char = characterById(ch.from.character)
  const att = props.attempt
  const underway = !!att?.attemptSeed && !att.done
  return (
    // carries `result` too: this is a broadcast look-at-it screen, and the
    // wrap's whole treatment (kicker, ctas, share actions) applies verbatim
    <div className="screen result challenge">
      <Wordmark className="result-wordmark" />
      <div className="kicker">
        {ch.rally > 0 ? `⚔️ Revenge challenge · round ${ch.rally + 1} of the rally` : '⚔️ You’ve been challenged'}
      </div>
      <h2 className="challenge-title">
        {rivalName} shot {toParLabel(ch.from.toPar)} at {course?.name ?? ch.courseSlug}
      </h2>
      {course && (
        <p className="tagline center">
          {course.location} · Par {course.holes.reduce((s, h) => s + h.par, 0)}
        </p>
      )}
      <div className="emoji-grid">
        <div>{ch.from.results.slice(0, 9).map((r, i) => (
          <span key={i}>{RESULT_SQUARE[r]}</span>
        ))}</div>
        <div>{ch.from.results.slice(9).map((r, i) => (
          <span key={i}>{RESULT_SQUARE[r]}</span>
        ))}</div>
      </div>
      {char && (
        <div className="char-chip result-chip">
          <CharacterAvatar id={char.id} size={34} />
          <span>as the {char.name}</span>
        </div>
      )}

      {att?.done ? (
        <ChallengeFaceoff challenge={ch} mine={att.done} />
      ) : underway ? (
        <>
          <p className="verdict">Your attempt is underway — the card picks up right where you left it.</p>
          <button className="cta" onClick={props.onResume}>
            Resume your attempt
          </button>
        </>
      ) : (
        <>
          <button className="cta" onClick={props.onAccept}>
            Take the challenge
            <span className="cta-sub">One attempt · same course, your own luck</span>
          </button>
          <p className="fine center">
            You race {rivalName === 'A rival' ? 'their' : `${rivalName}’s`} real round, hole by hole. Beat the score —
            ties don’t take it.
          </p>
        </>
      )}

      <button className="cta ghost" onClick={props.onWatch}>
        🎬 Watch their round first
      </button>
      <button className="cta ghost" onClick={props.onHome}>
        Back to the Teebox
      </button>
    </div>
  )
}
