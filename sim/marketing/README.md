# Browser Tycoon Marketing Screenshot Generator

Standalone popup mock generator for marketing screenshots. It does not read or write real extension state.

## Run

```powershell
node sim/marketing/run.mjs
```

Outputs:

```txt
sim/marketing/output/latest.html
sim/marketing/output/latest-config.json
```

Open `latest.html` to edit the popup values and preview the main Slots tab at the real extension size.

Domain icons are downloaded into `sim/marketing/output/favicon-cache/` when the page is generated. Sources are tried in this order: the site's own `/favicon.ico`, Google favicon lookup, DuckDuckGo icon lookup, then the local extension icon fallback.

The editor also guards against income drift. When enabled, it compares the top-left income/sec to the sum of active/background slot rates. Missing income is distributed equally across earning slots, and excess income is subtracted equally.

Next slot cost is calculated from the number of unlocked slots using the game's `slotUnlockCost` curve, so it is not a manual config field.

Welcome-back screenshots use an optional `welcomeBack` object:

```json
{
  "welcomeBack": {
    "enabled": true,
    "secondsAway": 28800,
    "focus": 245000,
    "background": 182000,
    "daily": 96000,
    "navigation": 32000,
    "wake": 75000,
    "other": 15000
  }
}
```

The popup appears when enabled, `secondsAway` is at least 60, and the category total is positive. Zero-value categories are hidden, matching the extension.

Active-upgrade screenshots use `screen: "upgrades"` and an `upgradeShowcase` object:

```json
{
  "screen": "upgrades",
  "upgradeShowcase": {
    "domain": "youtube.com",
    "levels": {
      "trafficEngine": 28,
      "tabMultiplier": 18,
      "focusBonus": 24,
      "navigationBonus": 12
    }
  }
}
```

Each BUY cost is calculated from the extension's upgrade base cost and growth formula. Buttons are enabled only when current money covers the next level.

## Presets

```powershell
node sim/marketing/run.mjs --preset early-game
node sim/marketing/run.mjs --preset mid-game
node sim/marketing/run.mjs --preset late-game
node sim/marketing/run.mjs --preset prestige-showcase
node sim/marketing/run.mjs --preset slot-showcase
node sim/marketing/run.mjs --preset welcome-back
node sim/marketing/run.mjs --preset upgrade-showcase
```

You can also pass a custom config:

```powershell
node sim/marketing/run.mjs --config sim/marketing/presets/late-game.json
```

## Screenshots

```powershell
node sim/marketing/run.mjs --screenshot
```

Screenshots are saved to:

```txt
sim/marketing/output/screenshots/
```

The exporter uses installed Chrome or Edge in headless mode. If it cannot find a browser:

```powershell
node sim/marketing/run.mjs --screenshot --browser "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

## Short Live Videos

```powershell
node sim/marketing/run.mjs --video
```

Videos are saved as 3 second WebM files to:

```txt
sim/marketing/output/videos/
```

The video uses the same selected preset/config as the screenshot generator. The popup stays visually frozen except for the top-left balance, which increases at the configured income/sec rate as though the popup were open in that state. You can combine options:

```powershell
node sim/marketing/run.mjs --preset slot-showcase --video
node sim/marketing/run.mjs --config sim/marketing/presets/late-game.json --video
node sim/marketing/run.mjs --preset early-game --video --video-seconds 6
```
