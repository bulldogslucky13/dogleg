import { RoughGradeList } from './RoughGrades'

/**
 * The what's-new splash: one drop, one card, dismissed forever. Shown only to
 * players who were already here (see `primeWhatsNew`), and only ever one
 * landing modal deep — the tutorial outranks it, it outranks the season
 * splash (see `pickLandingModal` in App.tsx).
 *
 * The bar for spending this slot is a change that alters how the game PLAYS,
 * not a content drop — new courses announce themselves in the course list.
 * Rewrite the body wholesale when `WHATS_NEW_VERSION` is bumped; this is not
 * a changelog that accumulates entries.
 *
 * The grades themselves live in `RoughGrades` and are taught permanently in
 * How to Play — this card exists only to tell players who knew the OLD game
 * that they arrived. A brand-new player never sees it and doesn't need to.
 */
export function WhatsNewSplash(props: { onClose: () => void }) {
  return (
    <div className="tut-backdrop" role="dialog" aria-modal="true" aria-label="What's changed: the rough">
      <div className="tut-card whats-new">
        <div className="kicker">New on the tee sheet</div>
        <h2 className="tut-title">🌾 Not all rough is rough</h2>
        <div className="tut-body">
          <p>
            Three grades of it now, and the deep stuff finally plays like it looks — you'll save
            par out of it a lot less often.
          </p>
          <RoughGradeList />
          <p className="fine">Ten courses play tougher than they did yesterday.</p>
        </div>
        <button className="cta" onClick={props.onClose}>
          Noted — I'll find the fairway
        </button>
      </div>
    </div>
  )
}
