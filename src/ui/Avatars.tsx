import type { CharacterId } from '../engine/types'

/**
 * Flat-style golfer avatars in the game's palette, one per character.
 * Each has a single subtly-animated group (see .swing/.aim/.tap in styles.css).
 */
export function CharacterAvatar(props: { id: CharacterId; size?: number }) {
  const size = props.size ?? 64
  const common = { width: size, height: size, viewBox: '0 0 96 96', role: 'img' as const }

  if (props.id === 'fairway') {
    // Fairway Finder — top of the backswing with a driver, ready to launch
    return (
      <svg {...common} aria-label="Fairway Finder" className="avatar avatar-fairway">
        <ellipse cx="48" cy="86" rx="26" ry="5" fill="#1d2b20" opacity="0.12" />
        {/* arms + driver, waggling at the top */}
        <g className="swing">
          <line x1="46" y1="42" x2="66" y2="28" stroke="#e8b48c" strokeWidth="6" strokeLinecap="round" />
          <line x1="66" y1="28" x2="84" y2="10" stroke="#4a4038" strokeWidth="3.4" strokeLinecap="round" />
          <ellipse cx="86" cy="8" rx="6" ry="4.5" fill="#26301f" transform="rotate(-40 86 8)" />
        </g>
        {/* legs */}
        <rect x="39" y="60" width="8" height="24" rx="3.5" fill="#3a4a3f" />
        <rect x="50" y="60" width="8" height="24" rx="3.5" fill="#3a4a3f" />
        <rect x="36" y="82" width="13" height="5" rx="2.5" fill="#26301f" />
        <rect x="49" y="82" width="13" height="5" rx="2.5" fill="#26301f" />
        {/* torso — terracotta polo */}
        <path d="M40,38 Q48,34 56,38 L58,62 Q48,66 38,62 Z" fill="#c05b4d" />
        {/* head + cap */}
        <circle cx="46" cy="26" r="9.5" fill="#e8b48c" />
        <path d="M36.5,24 A9.5,9.5 0 0 1 55.5,24 L55.5,22 A9.5,8 0 0 0 36.5,22 Z" fill="#26301f" />
        <rect x="50" y="19" width="12" height="4" rx="2" fill="#26301f" />
      </svg>
    )
  }

  if (props.id === 'dart') {
    // Dart Thrower — iron held out, sizing up the pin, target pulsing downrange
    return (
      <svg {...common} aria-label="Dart Thrower" className="avatar avatar-dart">
        <ellipse cx="44" cy="86" rx="26" ry="5" fill="#1d2b20" opacity="0.12" />
        {/* target rings */}
        <g className="aim">
          <circle cx="80" cy="30" r="12" fill="none" stroke="#c05b4d" strokeWidth="2.4" />
          <circle cx="80" cy="30" r="6.5" fill="none" stroke="#c05b4d" strokeWidth="2" />
          <circle cx="80" cy="30" r="2" fill="#c05b4d" />
        </g>
        {/* legs */}
        <rect x="35" y="60" width="8" height="24" rx="3.5" fill="#3a4a3f" />
        <rect x="46" y="60" width="8" height="24" rx="3.5" fill="#3a4a3f" />
        <rect x="32" y="82" width="13" height="5" rx="2.5" fill="#26301f" />
        <rect x="45" y="82" width="13" height="5" rx="2.5" fill="#26301f" />
        {/* torso — gold polo */}
        <path d="M36,38 Q44,34 52,38 L54,62 Q44,66 34,62 Z" fill="#c9a227" />
        {/* pointing arm */}
        <line x1="50" y1="42" x2="66" y2="36" stroke="#e8b48c" strokeWidth="6" strokeLinecap="round" />
        {/* iron resting on shoulder */}
        <line x1="38" y1="44" x2="26" y2="16" stroke="#4a4038" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M26,16 L21,8 L27,10 Z" fill="#26301f" />
        {/* head + visor */}
        <circle cx="42" cy="26" r="9.5" fill="#e8b48c" />
        <rect x="33" y="19" width="19" height="4.5" rx="2" fill="#c05b4d" />
      </svg>
    )
  }

  // Greens Keeper — hunched over the flat stick, all business
  return (
    <svg {...common} aria-label="Greens Keeper" className="avatar avatar-greens">
      <ellipse cx="48" cy="86" rx="28" ry="5" fill="#4e8a48" opacity="0.35" />
      {/* legs */}
      <rect x="38" y="58" width="8" height="26" rx="3.5" fill="#3a4a3f" />
      <rect x="49" y="58" width="8" height="26" rx="3.5" fill="#3a4a3f" />
      <rect x="35" y="82" width="13" height="5" rx="2.5" fill="#26301f" />
      <rect x="48" y="82" width="13" height="5" rx="2.5" fill="#26301f" />
      {/* hunched torso — green polo */}
      <path d="M40,36 Q52,30 58,40 L58,60 Q46,64 38,58 Z" fill="#4e8a48" />
      {/* putter, tapping */}
      <g className="tap">
        <line x1="60" y1="42" x2="70" y2="76" stroke="#4a4038" strokeWidth="3.2" strokeLinecap="round" />
        <rect x="64" y="75" width="13" height="4.5" rx="2" fill="#26301f" />
      </g>
      {/* arms down the grip */}
      <line x1="55" y1="44" x2="61" y2="52" stroke="#e8b48c" strokeWidth="6" strokeLinecap="round" />
      {/* ball waiting */}
      <circle cx="76" cy="82" r="3.6" fill="#ffffff" stroke="#26301f" strokeWidth="1.4" />
      {/* head + bucket hat */}
      <circle cx="56" cy="26" r="9.5" fill="#e8b48c" />
      <path d="M45,25 Q56,14 67,25 L64,20 Q56,12 48,20 Z" fill="#26301f" />
      <rect x="45" y="23" width="22" height="4" rx="2" fill="#26301f" />
    </svg>
  )
}
