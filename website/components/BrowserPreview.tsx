import { GmailIcon, YouTubeIcon } from "./Icons";

type BrowserPreviewProps = {
  embedded?: boolean;
};

export function BrowserPreview({ embedded = false }: BrowserPreviewProps) {
  return (
    <section className={`browser-preview ${embedded ? "browser-preview--embedded" : "panel-frame"}`} aria-label="YouTube open in Chrome">
      <div className="browser-tabs">
        <div className="window-dots"><i /><i /><i /></div>
        <div className="browser-tab active"><YouTubeIcon /><span>YouTube</span><b>&times;</b></div>
        <div className="browser-tab"><GmailIcon className="h-5 w-6" /><span>Gmail</span><b>&times;</b></div>
        <span className="new-tab">+</span>
      </div>
      <div className="address-row">
        <span>&larr;</span><span>&rarr;</span><span>&#8635;</span>
        <div className="address-bar"><span className="address-lock" />youtube.com</div>
        <b>&#8942;</b>
      </div>
      <div className="youtube-shell">
        <div className="youtube-head">
          <span className="menu-lines">&#9776;</span>
          <div className="youtube-word"><YouTubeIcon /> <strong>YouTube</strong></div>
          <div className="search-box">Search</div>
        </div>
        <div className="video-art" aria-label="Neon city sunset video preview">
          <div className="sun" />
          <div className="skyline skyline-back" />
          <div className="skyline skyline-front" />
          <div className="video-grid" />
        </div>
        <div className="video-progress"><span /></div>
        <div className="video-details"><i /><i /><i /></div>
      </div>
    </section>
  );
}
