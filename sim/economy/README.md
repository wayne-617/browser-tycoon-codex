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
- starting cash
- prestige reset mode, reset count, and reset days
- Domain Mastery enable/disable and tuning controls

Advanced economy and upgrade cost controls are available in collapsible sections.

## Common Overrides

```powershell
node sim/economy/run.mjs --days 180
node sim/economy/run.mjs --focus-minutes 60 --background-minutes 30
node sim/economy/run.mjs --starting-cash 1000
node sim/economy/run.mjs --traffic-multiplier 1.2 --prestige-divisor 250000
node sim/economy/run.mjs --cache-core-multiplier 1.45 --cache-core-base-cost 5 --cache-core-cost-growth 1.85
node sim/economy/run.mjs --mastery-lifetime-base 1000000 --mastery-lifetime-growth 1.6 --mastery-cc-base-cost 2 --mastery-cc-growth 1.24
node sim/economy/run.mjs --no-domain-mastery
node sim/economy/run.mjs --vault-claims-per-day 2 --vault-linear-multiplier 0.12 --vault-poly-multiplier 0.005 --vault-poly-exponent 3
node sim/economy/run.mjs --vault-traffic-exponent 0.9 --background-traffic-exponent 0.9
node sim/economy/run.mjs --daily-base-minutes 60 --daily-streak-base-multiplier 0.04 --daily-streak-boot-multiplier 0.2 --navigation-event-seconds 18 --wake-burst-seconds 105
node sim/economy/run.mjs --days 100 --prestige-mode --prestige-resets 2 --prestige-reset-days 30,60
```

## Defaults

- `days`: `33`
- `focus-minutes`: `150` total focused minutes per day, split evenly across unlocked domains
- `background-minutes`: `60` minutes per other slot per day
- `vault-claims-per-day`: `2`
- `starting-cash`: `$1000`, counted as initial lifetime earnings and spendable before day 1
- Vault cap stores `25` minutes of base income before Cold Storage scaling, so equal Cold Storage and Vault Pump levels take about `20.8` hours to fill.
- Vault Pump and Cold Storage scale as `1 + 0.12 * level + 0.005 * level^3`
- `vault-traffic-exponent`: `0.9`, so vault inherits most, but not all, late-game Traffic Engine scaling
- `background-traffic-exponent`: `0.9`, so background income also inherits most, but not all, late-game Traffic Engine scaling
- Daily first-open payout uses base domain rate times `60` minutes, with streak scaling `1 + 0.04 * streak * (1 + 0.2 * sqrt(Daily Boot level))`
- Navigation payouts use active income per second times `18` seconds times `sqrt(Navigation Bonus level)` per event
- Wake payouts use base domain rate times `105` seconds times `Wake Bonus level^1.1`
- Domain Mastery is enabled. Each rank adds `+2%` income and `+2%` vault cap for that domain.
- Mastery rank requirements use `1,000,000 * rank^3 * 1.6^(rank - 1)`.
- Mastery CP costs use `ceil(2 * rank^1.65 * 1.24^(rank - 1))`.
- `starting-slots`: `3`
- prestige reset mode enabled with `8` resets after days `4`, `8`, `12`, `16`, `21`, `25`, `29`, and `33`
- navigation events enabled at `5` per focused hour
- wake events enabled at `3` per domain per day

The simulator reads current app constants and upgrade definitions from `v1/background.js` by default. If the background service worker imports `v1/game-math.js`, the simulator follows that import and reads the shared economy math from there.

## Spending Model

The player unlocks a slot as soon as they can afford it. Otherwise, money is spent on the cheapest next available upgrade across all domains and upgrade types. This is deterministic and deliberately not ROI-optimal.

## Prestige Reset Mode

Prestige mode runs scheduled end-of-day resets. Each reset:

- awards newly available cache points from lifetime earnings
- spends any affordable cache points on the global Cache Core upgrade first
- spends affordable cache points on Domain Mastery for the strongest mastery-lifetime domain
- spends cache points on slot tiers from slot 1 upward, maxing each slot as far as possible before moving to the next
- resets cash, domain upgrades, vaults, and streaks
- keeps Cache Core, Domain Mastery, slots 1-3, and any contiguous slot range made permanent by tiered slots

Reset days outside the total simulation length are ignored, and only the first `--prestige-resets` valid reset days are used.

## Optional Event Income

Navigation and wake bonuses are disabled by default because they depend on browsing event frequency. Enable them explicitly:

```powershell
node sim/economy/run.mjs --enable-navigation --navigation-events-per-focused-hour 6
node sim/economy/run.mjs --enable-wake --wake-events-per-domain-day 1
```
