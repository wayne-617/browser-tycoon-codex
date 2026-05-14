# Browser Tycoon Game Overview

Browser Tycoon is a Chrome extension idle game about turning everyday browsing into progression. Players assign websites to slots, earn money from the domains they actually use, buy upgrades for those domains, unlock more slots, and eventually use Clear Cache prestige resets for permanent power.

This document is a general design overview. It intentionally avoids detailed economy math and tuning formulas.

## Core Loop

1. Add a website domain to an open slot.
2. Browse normally while slotted domains generate money.
3. Revisit domains to collect vault and daily rewards.
4. Spend money on domain upgrades or new slots.
5. Build a stronger portfolio of frequently used domains.
6. Clear Cache when enough lifetime progress has built up to earn Cache Points.
7. Spend Cache Points on permanent upgrades, then start a stronger run.

## Currency

The main run currency is money, displayed as `$`. It is earned from slotted domains and spent on domain upgrades and slot unlocks.

The prestige currency is Cache Points (`CP`). Cache Points are earned through Clear Cache and spent on permanent upgrades such as slot tiers and Cache Core.

## Domains

A domain is the gameplay identity for a website, such as `youtube.com` or `docs.google.com`.

Only normal `http` and `https` pages with usable hostnames can become gameplay domains. Chrome internal pages, extension pages, blank tabs, local files, and incognito browsing are not valid gameplay sources.

Domain names are normalized before being stored:

- `www.` is collapsed into the base hostname.
- Meaningful subdomains stay separate.
- `www.youtube.com` and `youtube.com` count as the same domain.
- `docs.google.com` and `mail.google.com` count as different domains.

Domains are not added automatically just because the player visits them. A domain becomes part of the game after it has been assigned to a slot at least once.

## Slots

Slots are the core strategic resource. A domain must be assigned to a slot before it can earn money or fill its vault.

The player starts with three free slots. More slots can be unlocked with money. Extra unlocked slots let the player grow a broader portfolio and earn from more domains.

Each slot can hold one domain. A normalized domain can only occupy one slot at a time.

Slot behavior:

- Empty slots can be filled with the current site or with a domain from the library.
- Filled slots can be opened to view upgrades, income, vault status, and slot actions.
- Domains can be removed from slots and kept in the library.
- Domains can be swapped between slots.
- Each slot gets one library-to-slot swap per day.
- Slot upgrades belong to the slot, not the domain.

Higher-tier slots become long-term investments because slot tier upgrades persist through Clear Cache.

## Domain Library

The Domain Library is the player's saved portfolio. It contains domains that have been slotted before.

When a domain leaves a slot, it stays in the library with its upgrade history and lifetime earnings. However, library domains that are not currently slotted do not generate live income and do not fill vaults.

The library exists so players can rotate domains in and out of slots without losing their long-term domain identity.

## Earning Money

Slotted domains can earn through several broad sources.

### Active Income

When a slotted domain is the active foreground tab, it earns active income. This is the most direct browsing reward and is supported by upgrades that improve focused usage.

### Background Income

If a slotted domain is open in a normal tab but is not the active foreground tab, it can earn background income once the relevant upgrades are purchased.

Background income is tracked at the domain level, not the tab level. Multiple background tabs for the same domain still count as one background contributor.

### Navigation Bonus

Navigation Bonus rewards active movement within a slotted domain. It is a small bonus payout for qualifying top-level navigations and has a short per-domain cooldown.

This bonus is meant to reward natural browsing activity, not become the main source of income.

### Wake Bonus

Wake Bonus rewards bringing a backgrounded slotted domain back into focus. It creates a burst payout when the player returns to that domain after it was in the background.

### Vault Payouts

Each slotted domain has a vault. The vault fills over time while the domain is not being visited, up to that domain's vault cap.

When the player returns to the domain, they can collect the stored vault value. Vaults also continue to progress while Chrome is closed, using timestamp-based offline settlement.

### Daily First-Open Bonus

The first visit to a slotted domain each day can grant a daily bonus. Consecutive daily visits build that domain's streak, which improves future daily rewards.

Daily streaks are tied to the domain while it remains slotted. Fully removing a domain from slots resets its streak. Moving a domain between active slots preserves the streak.

## Upgrade Categories

Each domain has its own upgrade tree. Buying an upgrade for one domain does not improve other domains.

### Active Income Upgrades

- `Tab Multiplier`: improves live income when the domain is open.
- `Focus Bonus`: improves income when the domain is the active foreground tab.
- `Navigation Bonus`: enables and improves navigation payouts.
- `Traffic Engine`: improves the domain's base earning power.

### Vault And Passive Storage Upgrades

- `Cold Storage`: increases how much the vault can hold.
- `Vault Pump`: increases how quickly the vault fills.
- `Daily Boot`: improves the daily first-open reward.

### Background Behavior Upgrades

- `Background Hum`: lets the domain earn while open in the background.
- `Idle Depth`: improves background income the longer the domain stays backgrounded.
- `Wake Bonus`: enables and improves return-to-focus burst payouts.

## Slot Upgrades

Slot upgrades are purchased with Cache Points and persist through Clear Cache.

Slot tier upgrades multiply income and wake burst payouts for whichever domain is currently assigned to that slot. Because these upgrades belong to the slot, players can move valuable domains into stronger slots as their strategy changes.

Buying a prestige tier on an extra slot can also make that slot permanently available across future Clear Cache resets.

## Cache Core

Cache Core is a global permanent upgrade purchased with Cache Points. It improves the base earning power of every domain and every slot.

Unlike domain upgrades, Cache Core is not tied to one website. It is a broad account-level progression system for making future runs faster.

## Clear Cache Prestige

Clear Cache is Browser Tycoon's prestige reset.

When the player clears cache, run-level progress is reset in exchange for Cache Points based on lifetime earnings.

Clear Cache resets:

- Current money balance.
- Domain upgrade levels.
- Vault amounts.
- Daily claim availability.
- Domain streaks.
- The short-term run economy.

Clear Cache preserves:

- Domain library entries.
- Lifetime earnings history.
- Cache Points.
- Cache Core level.
- Slot tier upgrades.
- Slot streak upgrades.
- Permanently preserved extra slots.
- Previously claimed lifetime prestige credit.

The intent is that each reset starts smaller, but stronger.

## Offline Progress

Browser Tycoon uses timestamp-based settlement instead of relying on the popup or background worker to run continuously.

When the extension wakes up, the popup opens, tab state changes, or a scheduled check occurs, the game compares the current time with the last settlement time and applies progress for the elapsed period.

This supports:

- Income while the popup is closed.
- Vault filling while Chrome is closed.
- Catch-up rewards after returning later.
- Consistent progress without requiring a constantly running UI.

## Player Strategy

The game supports several natural play styles:

- Focus-heavy players can invest in active income and focus upgrades.
- Players who revisit the same sites daily can lean into vaults and daily bonuses.
- Multitaskers can improve background income and wake bonuses.
- Collectors can unlock more slots and build a broader domain portfolio.
- Prestige-focused players can invest Cache Points into stronger permanent slots and Cache Core.

The main strategic question is always: which domains deserve limited slot space, and which upgrades best match how the player actually browses?
