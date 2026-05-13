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

Advanced economy and upgrade cost controls are available in collapsible sections.

## Common Overrides

```powershell
node sim/economy/run.mjs --days 180
node sim/economy/run.mjs --focus-minutes 60 --background-minutes 30
node sim/economy/run.mjs --traffic-multiplier 1.2 --prestige-divisor 250000
node sim/economy/run.mjs --vault-claims-per-day 4
```

## Defaults

- `days`: `100`
- `focus-minutes`: `120` total focused minutes per day, split evenly across unlocked domains
- `background-minutes`: `15` minutes per other slot per day
- `vault-claims-per-day`: `2`
- `starting-slots`: `3`
- no prestige slot upgrades
- no navigation or wake bonus events unless enabled

The simulator reads current app constants and upgrade definitions from `v1/background.js` by default.

## Spending Model

The player unlocks a slot as soon as they can afford it. Otherwise, money is spent on the cheapest next available upgrade across all domains and upgrade types. This is deterministic and deliberately not ROI-optimal.

## Optional Event Income

Navigation and wake bonuses are disabled by default because they depend on browsing event frequency. Enable them explicitly:

```powershell
node sim/economy/run.mjs --enable-navigation --navigation-events-per-focused-hour 6
node sim/economy/run.mjs --enable-wake --wake-events-per-domain-day 1
```
