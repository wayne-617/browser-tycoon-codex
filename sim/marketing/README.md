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

## Presets

```powershell
node sim/marketing/run.mjs --preset early-game
node sim/marketing/run.mjs --preset mid-game
node sim/marketing/run.mjs --preset late-game
node sim/marketing/run.mjs --preset prestige-showcase
node sim/marketing/run.mjs --preset slot-showcase
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
