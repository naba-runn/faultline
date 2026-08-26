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
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path className="auth-showcase-crack-line" d="M70 30 L155 190 L100 275 L175 360 L130 495" />
                <path className="auth-showcase-crack-line auth-showcase-crack-line-alt" d="M330 60 L245 210 L295 285 L220 370 L265 500" />
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
