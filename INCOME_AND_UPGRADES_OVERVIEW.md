# Browser Tycoon Income And Upgrades Overview

This document explains the income formulas, upgrade costs, upgrade effects, slot upgrades, prestige math, and Cache Core math used by Browser Tycoon.

The source of truth for implemented values is `v1/game-math.js`.

## Core Constants

```txt
BASE_RATE = 0.25
VAULT_RATE = BASE_RATE x 0.02
TRAFFIC_ENGINE_MULTIPLIER = 1.2
PRESTIGE_DIVISOR = 100,000
SLOT_PRESTIGE_COST_SCALE = 1.5
CACHE_CORE_MULTIPLIER = 1.5
CACHE_CORE_BASE_COST = 5
CACHE_CORE_COST_GROWTH = 2
COLD_STORAGE_MULTIPLIER = 1.35
```

`BASE_RATE` is the starting per-second earning rate before upgrades, slot tiers, and state-specific bonuses.

## Domain Base Rate

Every slotted domain starts from a base rate. Cache Core applies globally, then Traffic Engine applies per domain.

```txt
cache_core_multiplier(level) =
  1.5^cache_core_level

domain_base_rate =
  BASE_RATE
  x cache_core_multiplier(cache_core_level)
  x 1.2^traffic_engine_level
```

## Income States

A slotted domain can be in one earning state at a time.

- `active`: the domain is the active foreground tab.
- `background`: the domain is open in a non-focused normal tab.
- `none`: the domain has no valid open tab presence.

Multiple tabs for the same domain do not stack. A domain contributes once at the domain level.

## Active Income

Active income is earned when a slotted domain is the active foreground domain.

```txt
active_income_per_second =
  domain_base_rate
  x tab_multiplier(level)
  x focus_multiplier(level)
  x slot_tier_bonus
```

```txt
tab_multiplier(level) =
  1 + 0.15 x level

focus_multiplier(level) =
  1 + 0.35 x level + 0.01 x level^1.2
```

Related upgrades:

- `Traffic Engine`: increases `domain_base_rate`.
- `Tab Multiplier`: increases live income when the domain is open.
- `Focus Bonus`: increases income while focused.
- Slot tier: multiplies the result for the domain currently assigned to that slot.

## Background Income

Background income is earned when a slotted domain is open in the background and has `Background Hum`.

```txt
background_hum(level) =
  0.08 x background_hum_level
```

If `background_hum_level` is `0`, background income is `0`.

```txt
idle_seconds =
  max(0, (now - background_since) / 1000)

idle_depth_factor =
  1 + 0.1 x idle_depth_level x min(idle_seconds / 300, 5)
```

```txt
background_income_per_second =
  domain_base_rate
  x tab_multiplier(level)
  x background_hum(level)
  x idle_depth_factor
  x slot_tier_bonus
```

Related upgrades:

- `Background Hum`: enables and scales background income.
- `Idle Depth`: increases background income the longer the domain stays backgrounded.
- `Tab Multiplier`: also affects background income.
- `Traffic Engine`, `Cache Core`, and slot tier all feed into the result.

## Vault Income

Each slotted domain has a vault that fills over time. The vault has a fill rate and a cap.

```txt
traffic_scale =
  sqrt(domain_base_rate / (BASE_RATE x cache_core_multiplier))
```

Because `domain_base_rate` already includes Cache Core, this traffic scale isolates the domain's Traffic Engine growth for vault scaling.

```txt
vault_cap =
  BASE_RATE
  x cache_core_multiplier
  x 60
  x 25
  x traffic_scale
  x 1.35^cold_storage_level
```

```txt
vault_rate =
  VAULT_RATE
  x cache_core_multiplier
  x traffic_scale
  x 1.3^vault_pump_level
```

Related upgrades:

- `Cold Storage`: increases vault capacity.
- `Vault Pump`: increases vault fill speed.
- `Traffic Engine`: indirectly improves vault values through `traffic_scale`.
- `Cache Core`: globally improves vault cap and fill speed.

## Vault Payout

When a slotted domain is visited, the player can collect stored vault value plus any available daily first-open bonus.

```txt
vault_payout =
  min(vault_amount, vault_cap)
```

```txt
revisit_payout =
  vault_payout + daily_first_open_bonus
```

The implementation tracks vault amount separately from daily bonus availability.

## Daily First-Open Bonus

The first qualifying visit to a slotted domain each local day can pay a daily bonus.

```txt
daily_boot_multiplier(level) =
  1 + 0.18 x level^0.95
```

```txt
base_daily =
  max(20, domain_base_rate x 60 x 35)
```

```txt
streak_multiplier =
  1 + min(current_streak, 14) x 0.04
```

```txt
slot_streak_multiplier =
  1 + slot_streak_bonus_tier x 0.15
```

```txt
daily_first_open_bonus =
  base_daily
  x daily_boot_multiplier(daily_boot_level)
  x streak_multiplier
  x slot_streak_multiplier
```

Related upgrades:

- `Daily Boot`: improves the daily bonus.
- Slot streak bonus tier: improves daily streak value for domains in that slot.
- `Traffic Engine` and `Cache Core`: improve `domain_base_rate`, which improves the daily baseline.

## Navigation Bonus

Navigation Bonus pays when a qualifying top-level navigation occurs inside a slotted domain. Level `0` disables the payout.

```txt
navigation_payout(level) =
  0                                  if level <= 0

navigation_payout(level) =
  daily_first_open_bonus
  x 0.13
  x (1 + 0.18 x navigation_bonus_level)
```

Navigation Bonus has a short per-domain cooldown in the runtime logic.

## Wake Bonus

Wake Bonus pays when a backgrounded slotted domain becomes focused again. Level `0` disables the payout.

```txt
wake_burst(level) =
  0                                  if level <= 0

wake_burst(level) =
  domain_base_rate
  x 65
  x wake_bonus_level^1.1
  x slot_tier_bonus
```

Related upgrades:

- `Wake Bonus`: enables and improves the burst.
- Slot tier: multiplies the burst.
- `Traffic Engine` and `Cache Core`: improve `domain_base_rate`.

## Upgrade Cost Math

Each domain upgrade has a base cost and growth rate.

```txt
upgrade_cost(current_level) =
  ceil(base_cost x growth_rate^current_level)
```

The cost shown for an upgrade is the cost to buy the next level from the current level.

For planning, the unrounded total cost for buying `N` levels from level `0` is:

```txt
total_cost_to_buy_N_levels =
  base_cost x (growth_rate^N - 1) / (growth_rate - 1)
```

Because individual purchases are rounded up with `ceil`, exact in-game total spend can be slightly higher than the unrounded planning formula.

## Domain Upgrade Table

| Upgrade | Category | Base Cost | Growth | Main Effect |
| --- | --- | ---: | ---: | --- |
| `Traffic Engine` | Active | `$25` | `1.5` | Multiplies domain base rate by `1.2^level` |
| `Tab Multiplier` | Active | `$25` | `1.6` | `1 + 0.15 x level` |
| `Focus Bonus` | Active | `$25` | `1.55` | `1 + 0.35 x level + 0.01 x level^1.2` |
| `Navigation Bonus` | Active | `$35` | `1.6` | Enables and scales navigation payout |
| `Cold Storage` | Vault | `$60` | `1.55` | Multiplies vault cap by `1.35^level` |
| `Vault Pump` | Vault | `$75` | `1.55` | Multiplies vault fill rate by `1.3^level` |
| `Daily Boot` | Vault | `$80` | `1.6` | `1 + 0.18 x level^0.95` |
| `Background Hum` | Background | `$40` | `1.55` | Background income factor is `0.08 x level` |
| `Idle Depth` | Background | `$90` | `1.75` | Adds idle-time background multiplier |
| `Wake Bonus` | Background | `$110` | `1.6` | Enables and scales wake burst |

All listed domain upgrades have unlimited levels in the current implementation.

## Slot Unlock Math

The player starts with slots `1` through `3` unlocked.

```txt
slot_unlock_cost(slot_number) =
  0                                  if slot_number <= 3
  500                                if slot_number == 4
  floor_to_2_sig_figs(
    500 x 5^((slot_number - 3.75)^1.35)
  )                                  if slot_number >= 5
```

Slot unlocks are paid with `$`.

## Slot Tier Upgrades

Slot tier upgrades are paid with Cache Points and belong to the slot, not the domain.

```txt
slot_tier_bonus(slot) =
  bonus for current slot tier
```

| Tier | Base CP Cost | Bonus |
| ---: | ---: | ---: |
| `0` | `0` | `x1.00` |
| `1` | `1` | `x1.20` |
| `2` | `3` | `x1.50` |
| `3` | `8` | `x2.00` |
| `4` | `20` | `x2.75` |
| `5` | `50` | `x4.00` |

For slots `1` through `3`, the tier cost is the base CP cost.

For slots `4` and higher:

```txt
slot_tier_cost(slot_id, tier) =
  ceil(base_tier_cp_cost(tier) x 1.5^max(0, slot_id - 3))
```

Slot tier bonuses affect:

- Active income.
- Background income.
- Wake burst payouts.

Buying Tier I or higher on an extra slot can preserve that slot through future Clear Cache resets.

## Slot Streak Bonus

Each slot also has a `streakBonusTier` value used by daily first-open rewards.

```txt
slot_streak_multiplier =
  1 + 0.15 x streakBonusTier
```

This upgrade belongs to the slot. Any domain assigned to that slot benefits from it when calculating daily first-open rewards.

## Cache Core Math

Cache Core is a global permanent upgrade paid for with Cache Points.

```txt
cache_core_multiplier(level) =
  1.5^level
```

```txt
cache_core_cost(current_level) =
  ceil(5 x 2^current_level)
```

Cache Core affects:

- Domain base rate for all domains.
- Active income through `domain_base_rate`.
- Background income through `domain_base_rate`.
- Daily first-open bonus through `domain_base_rate`.
- Navigation Bonus through `daily_first_open_bonus`.
- Wake Bonus through `domain_base_rate`.
- Vault cap and vault fill speed.

## Prestige Math

Prestige is called Clear Cache. It awards Cache Points based on lifetime earnings, but only grants newly earned CP that has not already been claimed.

```txt
cp_total_from_lifetime =
  floor(sqrt(total_lifetime_earned / PRESTIGE_DIVISOR))
```

```txt
cp_award_now =
  cp_total_from_lifetime - cp_already_claimed_from_lifetime
```

The implementation guards against negative awards by only presenting useful prestige when `cp_award_now` is above `0`.

After a successful Clear Cache, the game stores the newly claimed lifetime CP credit so the same lifetime earnings cannot be claimed repeatedly.

```txt
cp_already_claimed_from_lifetime =
  cp_total_from_lifetime
```

## What Clear Cache Resets

Clear Cache resets run-level state:

- Current `$` balance.
- Domain upgrade levels.
- Vault amounts.
- Daily claim availability.
- Domain streaks.

## What Clear Cache Preserves

Clear Cache preserves permanent and historical state:

- Domain library entries.
- Lifetime earnings history.
- Cache Points.
- Cache Core level.
- Slot tier upgrades.
- Slot streak upgrades.
- Permanently preserved extra slots.
- Previously claimed lifetime prestige credit.

## Formula Dependency Summary

```txt
Cache Core
  -> domain_base_rate
  -> active income
  -> background income
  -> daily first-open bonus
  -> navigation bonus
  -> wake bonus
  -> vault cap and vault rate
```

```txt
Traffic Engine
  -> domain_base_rate
  -> active income
  -> background income
  -> daily first-open bonus
  -> navigation bonus
  -> wake bonus
  -> vault traffic scale
```

```txt
Slot Tier
  -> active income
  -> background income
  -> wake bonus
```

```txt
Slot Streak Bonus
  -> daily first-open bonus
  -> navigation bonus indirectly
```
