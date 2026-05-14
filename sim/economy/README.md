# Browser Tycoon Economy Simulator

Standalone, dependency-free Node simulator for testing Browser Tycoon progression numbers.

## Run

```powershell
node sim/economy/run.mjs
```

Outputs are written to:

```txt
sim/economy/output/latest.html
sim/economy/output/latest.json
sim/economy/output/daily.csv
sim/economy/output/slot-unlocks.csv
```

Open `latest.html` in a browser to use the interactive simulator. The first screen lets you change the main timing inputs, then the Simulate button switches to the results view. Use New Simulation to return to the input screen.

The main controls are:

- days to simulate
- total focused hours per day
- background hours per other tab
- vault checks per day
- prestige reset mode, reset count, and reset days

Advanced economy and upgrade cost controls are available in collapsible sections.

## Common Overrides

```powershell
node sim/economy/run.mjs --days 180
node sim/economy/run.mjs --focus-minutes 60 --background-minutes 30
node sim/economy/run.mjs --traffic-multiplier 1.2 --prestige-divisor 250000
node sim/economy/run.mjs --cache-core-multiplier 1.5 --cache-core-base-cost 5 --cache-core-cost-growth 2
node sim/economy/run.mjs --vault-claims-per-day 4 --cold-storage-multiplier 1.32
node sim/economy/run.mjs --days 100 --prestige-mode --prestige-resets 2 --prestige-reset-days 30,60
```

## Defaults

- `days`: `14`
- `focus-minutes`: `120` total focused minutes per day, split evenly across unlocked domains
- `background-minutes`: `30` minutes per other slot per day
- `vault-claims-per-day`: `3`
- `starting-slots`: `3`
- prestige reset mode enabled with `1` reset after day `6`
- navigation events enabled at `5` per focused hour
- wake events enabled at `1` per domain per day

The simulator reads current app constants and upgrade definitions from `v1/background.js` by default. If the background service worker imports `v1/game-math.js`, the simulator follows that import and reads the shared economy math from there.

## Spending Model

The player unlocks a slot as soon as they can afford it. Otherwise, money is spent on the cheapest next available upgrade across all domains and upgrade types. This is deterministic and deliberately not ROI-optimal.

## Prestige Reset Mode

Prestige mode runs scheduled end-of-day resets. Each reset:

- awards newly available cache points from lifetime earnings
- spends any affordable cache points on the global Cache Core upgrade first
- spends cache points on slot tiers from slot 1 upward, maxing each slot as far as possible before moving to the next
- resets cash, domain upgrades, vaults, and streaks
- keeps Cache Core, slots 1-3, and any contiguous slot range made permanent by tiered slots

Reset days outside the total simulation length are ignored, and only the first `--prestige-resets` valid reset days are used.

## Optional Event Income

Navigation and wake bonuses are disabled by default because they depend on browsing event frequency. Enable them explicitly:

```powershell
node sim/economy/run.mjs --enable-navigation --navigation-events-per-focused-hour 6
node sim/economy/run.mjs --enable-wake --wake-events-per-domain-day 1
```
