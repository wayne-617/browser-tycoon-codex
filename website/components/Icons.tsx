import type { SVGProps } from "react";

export function GamepadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M8.2 7h7.6c2 0 3.3 1.3 3.8 3.2l1.1 4.2c.5 2-.6 3.6-2.2 3.6-1.3 0-2.1-1-3-2H8.5c-.9 1-1.7 2-3 2-1.6 0-2.7-1.6-2.2-3.6l1.1-4.2C4.9 8.3 6.2 7 8.2 7Z" />
      <path d="M7 11v4M5 13h4M16.5 11.5h.01M18.5 13.5h.01" />
    </svg>
  );
}

export function YouTubeIcon({ className = "" }: { className?: string }) {
  return <span className={`brand-favicon favicon-youtube ${className}`} aria-hidden="true" />;
}

export function GmailIcon({ className = "" }: { className?: string }) {
  return <span className={`brand-favicon favicon-gmail ${className}`} aria-hidden="true" />;
}

export function RedditIcon({ className = "" }: { className?: string }) {
  return <span className={`brand-favicon favicon-reddit ${className}`} aria-hidden="true" />;
}

export function ClaudeIcon({ className = "" }: { className?: string }) {
  return <span className={`brand-favicon favicon-claude ${className}`} aria-hidden="true" />;
}

export function ChromeIcon() {
  return <span className="chrome-icon" aria-hidden="true" />;
}
