# Browser Tycoon v1.0 Web Store Release

## Listing

- Version: `1.0.1`
- Single purpose: Turn normal browsing activity on player-selected domains into progress in an idle tycoon game.
- Support URL: `https://github.com/wayne-617/browser-tycoon-codex`
- Privacy policy: `https://wayne-617.github.io/browser-tycoon-codex/privacy.html`
- Supporter Core: one-time `$1.99` purchase handled by ExtensionPay.

Verify the public URLs in an incognito window before submission. Listing screenshots and promotional images must show the submitted build and must not show Dev Tools.

## Permission Justifications

- `alarms`: settles idle-game income and performs hourly engagement-notification checks while the service worker is suspended.
- `favicon`: displays Chrome-provided favicons for domains saved by the player without contacting an external favicon service.
- `notifications`: sends optional vault-full, large-payout, and streak-risk notifications controlled by in-extension settings.
- `storage`: stores local game progress and supports explicit player-initiated Chrome Sync save/load.
- `tabs`: identifies active/background domains, opens saved domains and feedback/payment-related pages, and reacts to tab lifecycle changes.
- `webNavigation`: awards navigation bonuses and tracks eligible domain navigation without reading page contents.

No broad host permissions are requested. The ExtensionPay content script is limited to `https://extensionpay.com/*` and supports the optional purchase/restore flow.

## Privacy And Data Use

Declare the following in the Web Store privacy questionnaire even when data stays on-device:

- Domain-level browsing history/activity and timing used for income, streaks, vaults, and navigation bonuses.
- Local gameplay state: slots, library domains, balances, upgrades, lifetime earnings, vaults, streaks, tutorial progress, and notification state.
- Player-initiated Chrome Sync save data, stored in versioned chunks to remain within per-item quotas, and synced notification preferences.
- Supporter Core entitlement, plan nickname, refresh time, and payment status returned by ExtensionPay.

Browser Tycoon does not read page text, form contents, passwords, messages, or files; does not sell data; and does not use browsing activity for advertising. Complete the Limited Use certification using the same statements as the public privacy policy.

## Manual Release Gates

- Fresh install: complete every tutorial step, assign a domain, receive `$1,000` once, confirm lifetime earnings include it, and reopen the popup without getting stuck.
- Core loop: verify active/background/inactive income, vault fill/collection, streak break/reset, upgrades, Slot 4 at `$10,000`, slot tiers, Cache Core, Domain Mastery, and prestige.
- Persistence: close/reopen the popup, restart Chrome, and verify local progress plus welcome-back source attribution.
- Library: reach the 100-domain cap, delete from the library and domain details, and verify confirmations and historical-data deletion.
- Sync: upload on one Chrome profile, load on another, verify overwrite confirmations, and compare lifetime earnings and settings.
- Notifications: verify settings hierarchy plus vault-full, 24-hour big-payout, and 7 PM streak-risk notifications and notification clicks.
- Payments: in a disposable ExtensionPay test account, verify purchase, restore, `$1.99` display, paid-state persistence, and the `x1.50` Supporter Core effect.
- UI: inspect all popup screens at `380x580`, including long domains and very large currency values, with no overlap or console errors.

Any failed gate, unexpected permission, missing disclosure, popup/service-worker exception, or unexpected file in the ZIP blocks submission.

## Package

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-v1.ps1
```

The script validates and recreates `browser-tycoon-v1.zip`, writes `browser-tycoon-v1.zip.sha256`, and packages only runtime files. Load the extracted ZIP in Chrome for the final smoke test; do not submit an older archive.
