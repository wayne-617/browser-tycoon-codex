# Browser Tycoon

Product Requirements Document  
Chrome Extension | Idle Clicker Game  
Version 1.2 | May 2026

## 1. Product Overview

### 1.1 Summary

Browser Tycoon is a Chrome extension that transforms everyday browsing into an idle clicker game. Inspired by AdVenture Capitalist, it rewards real browsing behavior with in-game currency (`$`). Players assign domains to upgradeable slots, spend currency on per-domain upgrades, unlock more slots, and prestige for permanent progression.

Core design philosophy: the game rewards existing browsing habits. Players should not need to browse unnaturally to make progress. Over time, the sites they already use should start to feel like investments.

### 1.2 Target Audience

- Casual players who browse frequently and enjoy incremental game loops
- Power users and developers who spend significant time in Chrome
- Fans of idle games such as AdVenture Capitalist, Cookie Clicker, and similar progression games

### 1.3 Platform and Distribution

- Platform: Google Chrome extension, Manifest V3
- Distribution: Chrome Web Store public listing
- Storage: two-tier storage split across `chrome.storage.local` and `chrome.storage.sync`
- Background runtime: service worker plus timestamp-based accrual settlement
- New tab integration: optional `chrome_url_overrides` dashboard

### 1.4 Currency Display

Currency is displayed as `$`. Large values use idle-game suffixes:

- `< 1,000`: `$999`
- `1,000 - 999,999`: `$1.23K`
- `1M - 999M`: `$1.23M`
- `1B - 999B`: `$1.23B`
- `1T - 999T`: `$1.23T`
- `1Qa+`: `$1.23Qa`, `Qi`, `Sx`, `Sp`, `Oc`, `No`, `Dc`, and beyond

## 2. Core Mechanics

### 2.1 Income Sources

Players earn money through two streams:

1. **Live domain income**
2. **Vault payouts on revisit**

#### Live domain income

Only slotted domains can generate live income.

- Each slotted domain contributes at the **domain** level, not per tab
- If one non-incognito tab for that domain is the active foreground tab, the domain earns **active income**
- If no tab for that domain is active but one or more non-incognito tabs are open, the domain earns **background income**
- A domain can never earn active income and background income at the same time
- Multiple background tabs for the same domain count as only one background contributor
- Qualifying top-level in-domain navigations can grant a small **Navigation Bonus** payout if the domain has the relevant upgrade
- Example: three background `youtube.com` tabs count as one background YouTube contributor; if one becomes active, YouTube becomes active income only, with no simultaneous background YouTube bonus

#### Vault payouts

- Every slotted domain accumulates stored money while it is not being visited
- Vault accumulation continues while Chrome is fully closed by settling from wall-clock elapsed time
- Vault accumulation stops when the vault cap is reached
- On the first visit to a slotted domain each day, the player can receive:
  - a Daily First-Open Bonus
  - a Vault Payout
- Both are shown distinctly in UI

### 2.2 Timestamp-Based Offline Progress

Browser Tycoon must continue progressing while the extension popup is closed and while Chrome itself is fully shut down.

The design model is **timestamp-based accrual settlement**, not continuous execution:

- Persist `lastAccrualAt` as the authoritative settlement timestamp
- On service worker wake, popup open, tab activation, qualifying navigation, tab close/open, periodic alarm ticks, and daily-boundary checks, compute elapsed wall-clock time since the last settlement
- Apply all passive progress forward from elapsed time in one deterministic step
- Vault progress continues during full browser closure, but only until each domain hits its cap
- Active/background income should also settle from elapsed time based on the most recently known domain presence state

This avoids relying on a continuously alive popup or always-running worker, which is not realistic in MV3.

### 2.3 Domain Slots

Slots are the central strategic resource. Only domains assigned to a slot produce income. The player starts with 3 slots.

#### Slot rules

- Empty slots open a compact slot picker
- The slot picker shows `Add Current Site` first and the saved library below it
- `Add Current Site` always uses the tab that is active at click time
- `Add Current Site` appears only for empty slots
- `Add Current Site` is disabled with a short reason when the current page is invalid, while library selection remains available
- Valid current sites are normal `http` and `https` pages with a usable hostname
- Chrome internal pages, extension pages, blank tabs, local files, and pages without a usable hostname cannot be added
- A normalized domain can occupy only one slot at a time
- If the player tries to add a domain that is already slotted elsewhere, the action is blocked and the UI should point to the existing slot
- Each slot gets **one library-to-slot swap per day**
- A library-to-slot swap means replacing a slotted domain with an unslotted domain from the library
- Swapping a slotted domain out for an unslotted/library domain:
  - consumes that slot's daily swap
  - clears the removed domain's vault
  - causes the incoming domain to start with `0` vault
  - causes the incoming domain to start with **no first-day daily bonus**
  - resets the removed domain's streak because it became fully unslotted
- Swapping two domains that are both already slotted is always free
- Slotted-to-slotted swaps do not consume cooldown
- Slotted-to-slotted swaps preserve each domain's streak so players can move a strong domain into a better slot
- Slot upgrades belong to the slot, not the domain

#### Slot unlock costs

- Slots 1 to 3: free
- Slot 4: `$500`
- Slot 5: `$2,500`
- Slot 6: `$12,500`
- Slot 7: `$62,500`
- Slot 8 and beyond: `500 x 5^(n - 4)`

Slots with Tier I or higher purchased using prestige currency remain permanently unlocked across prestige resets. Untiered extra slots must be re-unlocked with `$` after prestige.

### 2.4 Domain Library

The Domain Library stores the player's intentional portfolio, not every site they browse.

#### Domain normalization

- Collapse `www.` into the base hostname
- Keep other meaningful subdomains separate
- Example: `www.youtube.com` and `youtube.com` are the same gameplay domain
- Example: `docs.google.com` remains separate from `mail.google.com`

#### Entry lifecycle

- Domains are not automatically added to the gameplay library on normal browsing
- In v1, a domain becomes a persistent gameplay entry only after it has occupied a slot at least once
- If a domain is later removed from a slot, it moves into the library carrying its upgrades and history
- Unslotted library domains do not earn live income or accrue vault value

#### Full DomainEntry fields

- `domain: string`
- `upgrades: Record<upgradeId, level>`
- `vaultAmount: number`
- `vaultLastTickTime: number`
- `lastVisited: number`
- `lifetimeEarned: number`
- `dailyBonusClaimedDate: string | null`
- `currentStreak: number`
- `isSlotted: boolean`
- `slotId: number | null`

#### Library behavior

- Vault only accumulates for slotted domains
- A domain's upgrades persist even if the domain is unslotted
- A domain can be re-slotted later with its upgrades and history intact
- Search and filter should support name, last visited, upgrade level, and status

## 3. Upgrade Systems

### 3.1 Domain Upgrade Categories

Each domain has its own upgrade tree. Upgrades are purchased with `$` and do not affect other domains.

#### Category A: Active Income

- `Tab Multiplier`
  - Increases domain income while the domain is contributing live income
  - Infinite levels
  - Growth rate: `1.6x`
- `Focus Bonus`
  - Extra multiplier when the domain is the active foreground domain
  - Infinite levels
  - Growth rate: `1.7x`
- `Navigation Bonus`
  - Grants a bonus payout for qualifying top-level in-domain navigations
  - Trigger: top-level navigation within the same slotted domain
  - Cooldown: `15` seconds per domain
  - Same-page navigations can re-trigger after cooldown
  - Intended value: around `10%` of that domain's Daily First-Open Bonus target value
  - Infinite levels
  - Growth rate: `1.6x`

#### Category B: Vault and Passive Storage

- `Cold Storage`
  - Increases vault cap
  - Infinite levels
  - Growth rate: `1.6x`
- `Storage Duration`
  - Extends how long a vault can keep filling before reaching cap
  - Infinite levels
  - Growth rate: `1.7x`
- `Compound Interest`
  - Grows stored vault value over time
  - Max level: `5`
  - Growth rate: `2.0x`
- `Windfall Bonus`
  - Adds a revisit burst based on time since last visit
  - Infinite levels
  - Growth rate: `2.0x`

#### Category C: Background Behavior

- `Background Hum`
  - Lets a domain earn a percentage of active income while background-open
  - Infinite levels
  - Growth rate: `1.6x`
- `Idle Depth`
  - Increases background income the longer the domain remains backgrounded
  - Infinite levels
  - Growth rate: `1.8x`
- `Wake Bonus`
  - Grants a burst when a background domain becomes active again
  - Infinite levels
  - Growth rate: `2.0x`

### 3.2 Slot Prestige Upgrades

Slot upgrades are purchased with Cache Points (`CP`) and persist through prestige.

#### Slot tier upgrades

- Tier I: `1 CP`, `+10%`
- Tier II: `3 CP`, `+25%`
- Tier III: `8 CP`, `+50%`
- Tier IV: `20 CP`, `+100%`
- Tier V: `50 CP`, `+200%`

#### Slot streak upgrade

- `Daily Streak Bonus`
  - Prestige-only slot upgrade
  - Increases the payout multiplier from that slot's current slotted domain streak
  - Belongs to the slot, not the domain

### 3.3 Global Upgrades

These remain in concept but are not fully specified for implementation yet:

- Tab count multiplier bands
- Browser search bonus
- Global flat income multiplier
- Bookmark visit bonus

Incognito-specific upgrades are removed from scope because incognito is permanently invalid in v1.

## 4. Income and Reward Formulas

### 4.1 Live Income Formula

For a slotted domain:

```txt
income_per_sec =
  BASE_RATE
  x tab_multiplier_bonus(level)
  x state_bonus
  x slot_tier_bonus(slot.tier)
```

Where `state_bonus` is exactly one of:

- `focus_bonus(level)` if the domain is the active foreground domain
- `background_hum_pct(level)` modified by idle depth if the domain is background-open
- `0` if the domain has no valid open tab presence

### 4.2 Vault Payout Formula

```txt
payout =
  min(vault_amount, computed_vault_cap)
  x compound_interest_factor(minutes_idle, level)
  + windfall_bonus(hours_since_visit, level)
  + daily_first_open_bonus(streak, slot_streak_bonus_tier)
```

### 4.3 Navigation Bonus

`Navigation Bonus` is a lightweight active-use reward, not a primary income engine.

- Trigger: top-level in-domain navigation only
- Cooldown: `15` seconds per domain
- Same-page navigations can re-trigger after cooldown
- Scope: slotted domains only
- Target tuning: one navigation payout should be about `10%` of that domain's Daily First-Open Bonus target value

The exact numeric formula remains tunable, but it should stay clearly smaller than Daily First-Open and smaller than meaningful vault payouts.

### 4.4 Daily Rules

- Daily reset occurs at **midnight in the player's local time**
- Daily bonuses and swap cooldowns both use local-date boundaries
- The incoming domain on a library-to-slot swap cannot claim a daily bonus on the day it was inserted

### 4.5 Streak Rules

Each currently slotted domain has its own streak.

- Claiming the daily bonus on consecutive days increases that domain's streak
- Missing a day resets that domain's streak
- Fully unslotting a domain resets that domain's streak
- Moving a domain between two active slots preserves its streak
- Daily First-Open should use a flat formula driven by selected upgrades and the slot streak multiplier rather than current live `$/sec`
- For v1, Daily First-Open scales from:
  - `Windfall Bonus`
  - slot `Daily Streak Bonus`

## 5. Prestige System

### 5.1 Overview

Prestige is called **Clear Cache**. It resets run-level progression in exchange for Cache Points (`CP`), which permanently improve future runs.

### 5.2 What Resets

- `$` balance
- Domain upgrade levels
- Vault amounts
- Daily claim availability
- Domain streak states
- Run-level progression tempo

### 5.3 What Persists

- Domain library entries created by prior slotting
- Lifetime earnings history
- Unlocked slot count where applicable
- Slot tier upgrades
- Slot streak bonus upgrades
- Previously claimed lifetime prestige credit

### 5.4 Corrected Prestige Formula

Prestige is based on lifetime earnings, but it must only award the **new** prestige value not already claimed.

```txt
cpTotalEarnedFromLifetime = floor(sqrt(totalLifetimeEarned / PRESTIGE_DIVISOR))
cpAwardNow = cpTotalEarnedFromLifetime - cpAlreadyClaimedFromLifetime
```

Persist:

- `cpAlreadyClaimedFromLifetime: number`

This prevents duplicate prestige gains by repeatedly prestiging at the same lifetime earnings total.

#### Design intent

- The square-root family keeps prestige meaningful without exploding too fast
- Rough rule of thumb: doubling prestige earnings should require about `4x` more lifetime earnings
- Lifetime-based prestige fits a browsing game better than a strict since-reset model because normal use can still contribute across long real-world time spans

### 5.5 Prestige Tuning Constant

```txt
PRESTIGE_DIVISOR = 1,000,000   [TUNE]
```

This remains the primary pacing lever.

## 6. Progression and Strategy

### 6.1 Behavioral Progression Phases

- **Discovery**
  - Early days
  - Players learn to use `Add Current Site` and begin building their portfolio intentionally
- **Portfolio**
  - Players identify core domains and start concentrating upgrades
- **Vault Loop**
  - Morning revisit and offline accrual become meaningful
- **Prestige**
  - Slot progression and permanent upgrades begin shaping run identity

### 6.2 Progression Floor

Low-diversity browsers must still be viable.

- Slot unlocks can be gated by promoted library size
- Subdomains count separately in v1
- Vault payouts help low-activity sessions still feel productive
- Weekly milestone bonus can remain as a future balancing lever

### 6.3 Emergent Strategies

- **The Grinder**
  - Prioritizes active focus income
- **The Banker**
  - Leans into vault upgrades and revisit bursts
- **The Night Owl**
  - Optimizes background presence
- **The Collector**
  - Values breadth of slotted domains and long-term portfolio variety
- **The Slot Investor**
  - Builds strong slots first, then places top domains strategically

## 7. Technical Architecture

### 7.1 Chrome APIs

- `chrome.tabs`
- `chrome.webNavigation`
- `chrome.storage.local`
- `chrome.storage.sync`
- `chrome.alarms`
- `chrome.action.setBadgeText`

### 7.2 Runtime Model

The popup must not be the authority for income.

- The popup is only a presentation and interaction surface
- The service worker plus persisted timestamps own settlement logic
- Any relevant runtime event should be able to trigger accrual settlement
- A lightweight periodic alarm should still run so open tabs continue accruing even during long quiet stretches
- The system should survive popup closure, worker suspension, and full browser shutdown

### 7.3 Storage Architecture

#### `chrome.storage.sync`

Keep only hot, compact state:

- `balance`
- `totalLifetimeEarned`
- `cachePoints`
- `cpAlreadyClaimedFromLifetime`
- `unlockedSlots`
- `prestigeCount`
- `slots`
- compact promoted-domain upgrade state

#### `chrome.storage.local`

Keep the full library and local runtime state:

- `domainLibrary`
- `lastAccrualAt`
- domain presence snapshot or equivalent derived tab-state cache

### 7.4 Slot Object

Each slot should support at minimum:

- `id: number`
- `tier: 0 | 1 | 2 | 3 | 4 | 5`
- `streakBonusTier: number`
- `assignedDomain: string | null`
- `slotSwapUsedOnDate: string | null`

### 7.5 Domain Presence Snapshot

Persist a compact domain-level presence snapshot or equivalent derived state so settlement can infer whether a slotted domain was:

- active
- background-open
- not open

The implementation may choose the exact shape, but the PRD requires domain-level settlement rather than tab-count settlement.

### 7.6 Cross-Device Sync

- Vault progression is local-first
- Cross-device sync does not need exact vault continuity
- Best-effort sync of upgrades and core balances is sufficient
- Last-write-wins remains acceptable for sync conflicts in v1

## 8. Growth and Balance System

### 8.1 Core Principle

Upgrade costs grow exponentially while income grows more slowly through layered multipliers. The result should create the classic idle-game tension where upgrades feel efficient early and expensive later.

### 8.2 Upgrade Cost Curves

```txt
upgrade_cost(level) = base_cost x growth_rate^level
total_cost_to_buy_n_levels =
  base_cost x (growth_rate^N - 1) / (growth_rate - 1)
```

Initial tuning targets:

- Tab Multiplier: base `$25`, growth `1.6`
- Focus Bonus: base `$40`, growth `1.7`
- Navigation Bonus: base `$35`, growth `1.6`
- Cold Storage: base `$60`, growth `1.6`
- Storage Duration: base `$100`, growth `1.7`
- Compound Interest: base `$200`, growth `2.0`
- Windfall Bonus: base `$250`, growth `2.0`
- Background Hum: base `$50`, growth `1.6`
- Idle Depth: base `$90`, growth `1.8`
- Wake Bonus: base `$150`, growth `2.0`

### 8.3 Upgrade Effect Targets

```txt
tab_multiplier_bonus(level) = 1 + (0.15 x level)
focus_bonus(level) = 1 + (0.20 x level)
navigation_bonus(level) = DAILY_FIRST_OPEN_TARGET x 0.10 x scaling(level)

background_hum_pct(level) = 0.05 x level
idle_depth_bonus(t, lvl) = background_hum_pct x (1 + 0.1 x lvl x min(t / 300, 5))

compound_interest_factor(min, lvl) = (1 + 0.002 x lvl)^min
windfall_bonus(hours, lvl) = BASE_RATE x hours x 0.1 x lvl
wake_bonus(lvl) = BASE_RATE x 30 x lvl
```

### 8.4 Base Rate

```txt
BASE_RATE = $0.10 / sec   [TUNE]
```

### 8.5 Vault Design

Vault should not outcompete live activity.

```txt
vault_rate = BASE_RATE x 0.5   [TUNE]
```

Vault cap is affected by both:

- `Cold Storage` for amount capacity
- `Storage Duration` for how long elapsed offline accrual can keep filling before the cap is effectively reached

The exact implementation formula can still be tuned, but both upgrades must matter in the final math.

### 8.6 Balance Targets

- Time to first slot unlock: `15-20` minutes of active browsing
- Time to fill 6 slots: `3-5` days
- Time to first prestige: `7-14` days
- First prestige payout: `3-8 CP`
- Run 2 should reach the prior milestone in roughly `60-70%` of the original time
- Max endgame domain income target: roughly `$2-5/sec` per domain

## 9. UI Requirements

### 9.1 Main Popup

- Popup size target: `380 x 580px`
- The main popup should use a **1-column vertically scrolling slot list**, not a dense multi-column grid
- Header should use a two-tier structure:
  - large current `$` balance
  - smaller stats row with current `$/sec` on the left and current `CP` on the right
- The slot list is the primary body of the popup and should remain the visual focus
- Each filled slot card should show:
  - favicon or first-letter fallback
  - normalized hostname
  - small `$/sec`
  - current state indicator: `Focused`, `Background`, or `Closed`
  - vault fill strip
  - stronger readiness indicators when vault is full or daily bonus is unclaimed
- Tapping anywhere on a filled slot card opens that slot's dedicated detail screen
- Empty slots should appear inline in the same 1-column list and open the slot picker when tapped
- Show exactly one locked next-slot card at the end of the list:
  - visibly differentiated as locked
  - shows unlock cost
  - styled as a full card, not a footer note
- Domain Library should be accessed as a small secondary utility action, not bottom navigation
- `Clear Cache` should sit at the very bottom of the scroll after the slot list, as a secondary milestone action rather than a primary call to action

### 9.2 Slot Detail View

- Slot detail should be a **dedicated screen**, not an inline expansion
- Structure:
  - top bar with back action and slot/domain identity
  - summary card
  - shared purchase-mode control
  - stacked collapsible upgrade sections
  - swap/remove actions near the bottom
- Summary card should show:
  - domain name and favicon
  - current state
  - current `$/sec`
  - income breakdown: active, focus, background, vault, streak, and navigation bonus where relevant
  - vault status
- Upgrade categories should appear as stacked collapsible sections rather than top tabs
- Include a shared segmented control for `Buy 1 / 10 / Max`
- The purchase mode applies to all upgrade rows on the current detail screen and persists while the popup remains open
- Each upgrade row should show:
  - icon
  - upgrade name
  - current level
  - short effect summary
  - cost
  - one buy button
- Swap actions should include cooldown messaging when applicable

### 9.3 Domain Library View

- Show only domains that have been slotted at least once
- The library should be a simple searchable list, not a card grid
- Search should be by hostname
- Normal library rows should show:
  - hostname
  - favicon or first-letter fallback
  - lifetime earned
  - compact upgrade summary
  - last visited
- Opening the library from the main popup should let a row open a lightweight domain summary screen
- Opening the library from the empty-slot picker should use a confirmation step before assignment
- The library is a secondary management and re-slotting surface, not the primary navigation center

### 9.4 Onboarding

On install, provide a short guided onboarding with three steps:

- explain that only slotted domains earn
- prompt the player to fill their first empty slot with `Add Current Site`
- show where upgrades, vaults, and prestige will live next

## 10. Theme and Asset Direction

### 10.1 Aesthetic Direction

Retro tech workshop / browser-operations pixel-art presentation:

- The visual tone should feel like a playful hardware lab or browser optimization bench rather than a moody neon dystopia
- The UI should combine compact dashboard clarity with tactile pixel-art tech flavor
- Base palette should lean toward charcoal, graphite, dusty navy, and muted steel rather than heavy purple or pure black
- Accent colors should come from the icon set energy: electric cyan, hot coral/red, amber, lime, and cobalt
- Use subtle CRT-inspired treatments such as soft glow, restrained scan-lines, tiny status lights, and inset panel borders
- Typography should feel retro and game-like, but still remain readable in a compact extension popup
- Prefer a font in the style of `VT323` for the pixel-theme direction so the UI matches the icon set's playful retro-tech feeling
- If needed, pair the display font with a simpler supporting font for dense labels or small utility text
- The overall mood should be clever, colorful, modular, and rewarding, matching a tycoon game built around everyday browser activity

### 10.2 Asset Use

- Domain favicons remain the primary domain identity in slots and domain views
- If a favicon fails, use the first letter of the normalized domain as the fallback
- Bundled pixel icons should be used for upgrades, currencies, and game-system UI
- Icons in `browser-tycoon-codex/icons` can still be assigned randomly for temporary upgrade and system art in v1
- The current icon set should guide the theme: bright pixel-art components, cartridges, coils, modules, and other computer-part shapes should influence panel styling and upgrade presentation
- UI chrome should support the icons rather than overpower them; avoid overly dark cyberpunk framing that makes the assets feel out of place
- Final semantic icon mapping can happen later during UI implementation

## 11. Test Plan

### 11.1 Offline Accrual

- Close Chrome for several hours and verify vaults settle exactly once up to cap
- Cross midnight while Chrome is closed and verify daily claim readiness resets correctly

### 11.2 Domain Contribution

- Open three background `youtube.com` tabs and confirm only one background contributor
- Activate one `youtube.com` tab and confirm YouTube becomes active-only
- Close the active tab while another YouTube tab remains open and confirm fallback to background income

### 11.3 Swap Behavior

- Swap a library domain into a slot and verify cooldown consumption, vault reset, and no same-day first-open bonus
- Swap two already slotted domains and verify no cooldown use, no streak loss, and slot bonus transfer

### 11.4 Streak Behavior

- Claim on consecutive days and verify streak growth
- Miss a day and verify streak reset
- Fully unslot a domain and verify streak reset
- Move a domain between two slots and verify streak preservation

### 11.5 Prestige

- Prestige twice at the same lifetime earnings total and verify the second award is `0`
- Increase lifetime earnings and verify only the newly earned prestige delta is awarded

## 12. Open Items

The following remain intentionally open for later balancing or implementation detail:

- exact weekly milestone bonus amount
- final formula for `Storage Duration`
- exact global upgrade list and values
- exact domain presence snapshot schema
- exact numeric formula for `Navigation Bonus`
- exact numeric formula for `Daily First-Open`
- final icon-to-upgrade semantic mapping
