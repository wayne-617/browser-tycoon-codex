# Browser Tycoon v1

Chrome MV3 implementation of the Browser Tycoon PRD.

## Load locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select this `v1` folder.

## Implemented

- Manifest V3 extension with service worker authority for accrual.
- Timestamp settlement for live income, background income, vault accrual, and browser-shutdown catch-up.
- Three starting slots, slot unlock costs, slot swapping/removal, and library assignment.
- Domain normalization for `http` and `https` hostnames with `www.` collapsed.
- Per-domain upgrade trees, vault claims, daily bonus gating, navigation bonus cooldown, and prestige.
- Popup UI matching the PRD's single-column slot focus, dedicated detail screen, library view, picker flow, and onboarding.
