# Browser Tycoon Gemini Rebuild

Manifest V3 extension rebuild aligned to `browser_tycoon_prd_v1_2.md`.

Key architecture points:

- The service worker owns accrual settlement.
- The popup only renders state and sends player actions.
- Income is settled from persisted `lastAccrualAt` and domain-level presence snapshots.
- Slotted domains earn active or background income, never both.
- Closed slotted domains fill vaults up to cap.
