import { BoltIcon, Cog6ToothIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { ClaudeIcon, GmailIcon, RedditIcon, YouTubeIcon } from "./Icons";

type PopupPanelProps = {
  embedded?: boolean;
};

const slots = [
  { domain: "youtube.com", state: "ACTIVE", income: "$2.01K/s", vault: "$65.40K", energy: 3, full: true, inactive: false, icon: <YouTubeIcon className="slot-logo" /> },
  { domain: "gmail.com", state: "BACKGROUND", income: "$573.80/s", vault: "$12.40K", energy: 2, full: false, inactive: false, icon: <GmailIcon className="slot-logo" /> },
  { domain: "reddit.com", state: "INACTIVE", income: "$0.00/s", vault: "$90.00", energy: 1, full: false, inactive: true, icon: <RedditIcon className="slot-logo" /> },
  { domain: "claude.ai", state: "INACTIVE", income: "$0.00/s", vault: "$0.00", energy: 0, full: false, inactive: true, icon: <ClaudeIcon className="slot-logo" /> },
];

export function PopupPanel({ embedded = false }: PopupPanelProps) {
  return (
    <section className={`popup-panel ${embedded ? "popup-panel--embedded" : "panel-frame"}`} aria-label="Browser Tycoon game popup">
      <div className="stats-row">
        <div className="money"><strong>$276.92K</strong><span>+$2.58K/sec</span></div>
        <div className="popup-controls">
          <button type="button">RESET</button>
          <button type="button" className="cc">CC: 0</button>
          <button type="button" className="gear" aria-label="Settings"><Cog6ToothIcon /></button>
        </div>
      </div>
      <div className="slot-header">DOMAIN SLOTS</div>
      <div className="slot-list">
        {slots.map((slot) => (
          <div className={`domain-slot ${slot.inactive ? "domain-slot--inactive" : ""}`} key={slot.domain}>
            {slot.icon}
            <div className="slot-copy">
              <div className="slot-name"><strong>{slot.domain}</strong><span>[{slot.state}]</span></div>
              <div className="slot-meta">BASIC <i>|</i> {slot.income} <i>|</i> VAULT {slot.vault}</div>
            </div>
            <div className="energy"><strong><BoltIcon />{slot.energy}</strong>{slot.full && <span>FULL</span>}</div>
          </div>
        ))}
      </div>
      <button type="button" className="unlock-row">
        <LockClosedIcon />
        <span>UNLOCK SLOT 5 ($100.00K)</span>
      </button>
    </section>
  );
}
