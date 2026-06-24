import Link from "next/link";
import { GamepadIcon } from "./Icons";
import { CHROME_WEB_STORE_URL } from "../lib/links";

type NavbarProps = {
  active?: "home" | "privacy";
};

const navItems = [
  { label: "Home", href: "/#home", key: "home" },
  { label: "Features", href: "/#features", key: "features" },
  { label: "Roadmap", href: "/#features", key: "roadmap" },
  { label: "Discord", href: "/#final-cta", key: "discord" },
  { label: "About", href: "/#features", key: "about" },
  { label: "Privacy", href: "/privacy", key: "privacy" },
] as const;

export function Navbar({ active = "home" }: NavbarProps) {
  return (
    <header className="navbar sticky top-0 z-30">
      <nav className="mx-auto flex h-full max-w-[1280px] items-center justify-center px-5" aria-label="Primary navigation">
        <div className="navbar-links hidden items-center gap-[clamp(1.8rem,4vw,4.4rem)] lg:flex">
          {navItems.map((item) => {
            const isActive = item.key === active;
            return (
              <Link key={item.label} href={item.href} className={isActive ? "active" : ""} aria-current={isActive ? "page" : undefined}>
                {item.label}
              </Link>
            );
          })}
        </div>
        <a
          href={CHROME_WEB_STORE_URL}
          className="nav-play absolute right-5 flex items-center gap-2.5 sm:right-8"
          target="_blank"
          rel="noreferrer"
        >
          <span>Play Now</span>
          <GamepadIcon className="h-6 w-6" />
        </a>
        <Link href="/#home" className="mobile-brand absolute left-5 text-lg font-bold tracking-[0.12em] text-cyan lg:hidden">BT</Link>
      </nav>
    </header>
  );
}
