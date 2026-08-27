// Auth screens: a decorative panel, not a product mockup. An earlier
// version showed a static "error group" card with real-looking stack
// trace data, which read as a genuine, confusing error rather than a
// feature demo. The small cards below are the opposite of that on
// purpose — plain-language, clearly playful copy (no file paths, no
// stack traces, no real product terms) so nobody mistakes them for
// actual telemetry; they're just here to say "this is what this site
// is about" at a glance. Background is an enlarged, faint render of
// the brand mark's own fault-line crack shape (same icon used
// everywhere else in the app).
//
// Five cards, not more — enough to fill the panel without it reading
// as a wall of jokes. Positions are hand-placed (not a grid/random
// scatter) specifically to avoid colliding with each other or with
// the wordmark in the bottom-left corner; if you add another one,
// recheck that by hand (or via getBoundingClientRect in a browser
// console) rather than guessing at percentages.
const GIMMICK_CARDS = [
    {
        key: 'error',
        tone: 'error',
        label: 'New error',
        text: <><code>undefined</code> is not a function. Again.</>,
        caption: 'Happens to the best of us.',
        style: { top: '8%', right: '6%', transform: 'rotate(-3deg)' },
    },
    {
        key: 'detected',
        tone: 'detected',
        label: 'Detected',
        text: 'Found it before your users did.',
        caption: "That's kind of the whole point.",
        style: { top: '22%', left: '5%', transform: 'rotate(2deg)' },
    },
    {
        key: 'resolved',
        tone: 'resolved',
        label: 'Resolved',
        text: 'Fixed before the coffee got cold.',
        caption: 'AI found it in 4 seconds.',
        style: { top: '48%', right: '9%', transform: 'rotate(-2deg)' },
    },
    {
        key: 'caught',
        tone: 'caught',
        label: 'Caught',
        text: 'Somebody forgot a null check.',
        caption: "There's always one.",
        style: { top: '38%', left: '2%', transform: 'rotate(-2.5deg)' },
    },
    {
        key: 'shipped',
        tone: 'resolved',
        label: 'Shipped',
        text: 'Bug fixed. Nobody even noticed.',
        caption: 'As it should be.',
        style: { top: '68%', right: '13%', transform: 'rotate(2.5deg)' },
    },
];

export default function AuthShowcasePanel() {
    return (
        <div className="auth-showcase-mock" aria-hidden="true">
            <svg
                className="auth-showcase-crack"
                viewBox="0 0 400 520"
                fill="none"
                stroke="var(--accent)"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                {/* Left crack — main trunk, drifts rightward in the middle */}
                <path className="auth-showcase-crack-line" strokeWidth="3.5"
                    d="M58 10 L72 38 L60 62 L75 88 L64 118 L82 142 L70 165
                       L90 188 L78 218 L96 248 L82 272 L98 300 L86 335
                       L105 362 L88 392 L102 418 L85 450 L100 478 L88 510" />
                {/* Left — big branch at top reaching far inward */}
                <path className="auth-showcase-crack-line" strokeWidth="2.5"
                    d="M75 88 L108 75 L135 85 L162 72 L185 82 L198 72" />
                <path className="auth-showcase-crack-line" strokeWidth="1"
                    d="M162 72 L170 58 L182 62" />
                <path className="auth-showcase-crack-line" strokeWidth="1.2"
                    d="M135 85 L130 102 L142 108" />
                {/* Left — medium branch mid-low, angled down */}
                <path className="auth-showcase-crack-line" strokeWidth="2"
                    d="M98 300 L128 312 L148 302" />
                <path className="auth-showcase-crack-line" strokeWidth="1"
                    d="M128 312 L135 330 L148 325" />
                {/* Left — short splinter near bottom */}
                <path className="auth-showcase-crack-line" strokeWidth="1.5"
                    d="M102 418 L122 425 L130 415" />
                {/* Left — outward splinters (toward left edge) */}
                <path className="auth-showcase-crack-line" strokeWidth="1.5"
                    d="M70 165 L48 158 L38 168" />
                <path className="auth-showcase-crack-line" strokeWidth="1"
                    d="M86 335 L65 342 L58 332" />
                <path className="auth-showcase-crack-line" strokeWidth="0.8"
                    d="M88 510 L72 505 L68 515" />

                {/* Right crack — main trunk, slightly wavy, offset from left */}
                <path className="auth-showcase-crack-line auth-showcase-crack-line-alt" strokeWidth="2.8"
                    d="M340 50 L325 75 L338 102 L320 130 L335 155 L318 182
                       L332 212 L314 240 L330 265 L312 295 L328 320 L310 350
                       L325 378 L308 408 L322 435 L305 465 L318 492 L308 515" />
                {/* Right — short fork near top */}
                <path className="auth-showcase-crack-line auth-showcase-crack-line-alt" strokeWidth="1.8"
                    d="M338 102 L355 95 L368 105" />
                <path className="auth-showcase-crack-line auth-showcase-crack-line-alt" strokeWidth="0.8"
                    d="M355 95 L358 82 L368 85" />
                {/* Right — long branch mid-height reaching toward center */}
                <path className="auth-showcase-crack-line auth-showcase-crack-line-alt" strokeWidth="2.2"
                    d="M314 240 L282 232 L258 245 L232 235 L218 248" />
                <path className="auth-showcase-crack-line auth-showcase-crack-line-alt" strokeWidth="1"
                    d="M258 245 L250 262 L238 258" />
                {/* Right — medium branch lower, angled up */}
                <path className="auth-showcase-crack-line auth-showcase-crack-line-alt" strokeWidth="1.8"
                    d="M310 350 L285 338 L262 348" />
                {/* Right — tiny splinter near bottom */}
                <path className="auth-showcase-crack-line auth-showcase-crack-line-alt" strokeWidth="1"
                    d="M322 435 L342 442 L350 432" />
                {/* Right — outward splinter */}
                <path className="auth-showcase-crack-line auth-showcase-crack-line-alt" strokeWidth="1.2"
                    d="M335 155 L352 148 L360 158 L372 152" />
            </svg>

            {GIMMICK_CARDS.map((card) => (
                <div
                    key={card.key}
                    className={`auth-showcase-gimmick auth-showcase-gimmick-${card.tone}`}
                    style={card.style}
                >
                    <div className="auth-showcase-gimmick-header">
                        <span className={`auth-showcase-gimmick-dot auth-showcase-gimmick-dot-${card.tone}`} />
                        <span className="auth-showcase-gimmick-label">{card.label}</span>
                    </div>
                    <div className="auth-showcase-gimmick-text">{card.text}</div>
                    <div className="auth-showcase-gimmick-caption">{card.caption}</div>
                </div>
            ))}

            <div className="auth-showcase-wordmark">
                <span className="brand-fault-mark" style={{ width: '30px', height: '30px' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 4l7 9-3 7" />
                        <path d="M20 4l-7 9 3 7" />
                    </svg>
                </span>
                <span className="auth-showcase-wordmark-text">FAULTLINE</span>
            </div>
        </div>
    );
}
