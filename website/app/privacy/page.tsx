import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Privacy Policy | Browser Tycoon",
  description: "Privacy Policy for Browser Tycoon, a Chrome extension idle game.",
};

export default function PrivacyPage() {
  return (
    <main className="site-shell privacy-shell min-h-screen overflow-x-hidden text-white">
      <Navbar active="privacy" />
      <article className="privacy-page mx-auto">
        <header className="privacy-hero">
          <p className="privacy-eyebrow">PRIVACY POLICY</p>
          <h1>Browser Tycoon<br /><span>Privacy Policy</span></h1>
          <p className="privacy-lede">
            Browser Tycoon is a Chrome extension idle game that turns selected browsing activity into game progress.
            This policy explains what the extension uses, what it stores, and what leaves your device.
          </p>
        </header>

        <div className="privacy-policy">
          <section>
            <h2>Effective Date</h2>
            <p>June 12, 2026</p>
          </section>

          <section>
            <h2>Information Browser Tycoon Uses</h2>
            <p>
              Browser Tycoon observes browser tab and navigation activity so it can run the game. This includes the domain
              names of pages you visit, whether an assigned domain is active, in the background, or inactive, and timing
              information used to calculate game income, streaks, vault progress, and upgrade effects.
            </p>
            <p>
              Browser Tycoon is designed around domains, not full page contents. The extension does not read page text,
              form fields, passwords, messages, files, or other page content.
            </p>
          </section>

          <section>
            <h2>Information Stored By The Extension</h2>
            <p>The extension stores game progress such as:</p>
            <ul>
              <li>Assigned domain slots and domain library entries.</li>
              <li>Currency, Cache Credits, lifetime earnings, upgrades, vault amounts, streaks, and tutorial progress.</li>
              <li>Notification preferences and notification state.</li>
              <li>Supporter Core payment status returned by ExtensionPay.</li>
            </ul>
            <p>Gameplay data is primarily stored locally in Chrome extension storage on your device.</p>
          </section>

          <section>
            <h2>Chrome Sync Save</h2>
            <p>
              Browser Tycoon includes manual cloud save controls. The extension does not continuously sync your full save.
              When you choose to sync your save, Browser Tycoon writes a copy of your game save to Chrome sync storage so
              you can load it on another Chrome profile or device. Loading a synced save replaces the local save on that
              device.
            </p>
            <p>
              Notification settings may also be stored in Chrome sync storage so your notification preferences can follow
              your Chrome profile.
            </p>
          </section>

          <section>
            <h2>Notifications</h2>
            <p>
              Browser Tycoon can send optional game notifications, such as all vaults being full, a large payout being
              available, or a streak being at risk. Notification categories can be changed in the extension settings.
            </p>
          </section>

          <section>
            <h2>Payments</h2>
            <p>
              Browser Tycoon may offer optional Supporter Core features through ExtensionPay. Payment, account, and checkout
              information is handled by ExtensionPay and its payment processors. Browser Tycoon stores whether Supporter
              Core is active so the game can apply the correct in-game benefit.
            </p>
          </section>

          <section>
            <h2>Favicons And Remote Assets</h2>
            <p>
              Browser Tycoon uses Chrome&apos;s built-in extension favicon feature to display website icons. It does not send
              your saved domains to an external favicon service. Extension UI assets, including fonts used by the popup, are
              bundled with the extension.
            </p>
          </section>

          <section>
            <h2>Data Sharing And Sale</h2>
            <p>
              Browser Tycoon does not sell your data. Browser Tycoon does not use your browsing activity for advertising.
              Data may be processed by Chrome storage features when you use Chrome sync save, and by ExtensionPay when you
              use optional payment or restore features.
            </p>
          </section>

          <section>
            <h2>Data Retention And Deletion</h2>
            <p>
              Browser Tycoon stores game data until you delete it, reset progress through the extension, remove the
              extension, or clear the extension&apos;s site/storage data in Chrome. Synced saves can be overwritten by syncing a
              new save.
            </p>
          </section>

          <section>
            <h2>Children&apos;s Privacy</h2>
            <p>
              Browser Tycoon is not directed to children under 13. The extension does not knowingly collect personal
              information from children.
            </p>
          </section>

          <section>
            <h2>Changes To This Policy</h2>
            <p>
              This policy may be updated as Browser Tycoon changes. Updates will be posted on this page with a new effective
              date.
            </p>
          </section>

          <section>
            <h2>Contact</h2>
            <p>
              For privacy questions, use the support contact provided on the Chrome Web Store listing or the Browser Tycoon
              GitHub repository.
            </p>
          </section>
        </div>

        <footer className="privacy-footer">
          <span>Browser Tycoon is a Chrome extension idle game.</span>
          <Link href="/#home">Back to home</Link>
        </footer>
      </article>
    </main>
  );
}
