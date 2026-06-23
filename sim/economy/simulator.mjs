export const DEFAULT_SIM_OPTIONS = {
  days: 33,
  focusMinutesPerDay: 150,
  backgroundMinutesPerOtherSlotPerDay: 60,
  vaultClaimsPerDay: 2,
  startingCash: 1000,
  startingSlots: 3,
  includeDailyBonus: true,
  enableNavigationBonus: true,
  navigationEventsPerFocusedHour: 5,
  enableWakeBonus: true,
  wakeEventsPerDomainPerDay: 3,
  enableDomainMastery: true,
  maxUpgradePurchasesPerPeriod: 2000,
  slotTier: 0,
  prestigeMode: true,
  prestigeResets: 8,
  prestigeResetDays: [4, 8, 12, 16, 21, 25, 29, 33]
};

function floorToSignificantFigures(value, figures = 2) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const scale = Math.pow(10, Math.floor(Math.log10(value)) - figures + 1);
  return Math.floor(value / scale) * scale;
}

export function slotUnlockCost(slotNumber) {
  if (slotNumber <= 3) return 0;
  return floorToSignificantFigures(1000 * Math.pow(100, Math.max(0, slotNumber - 4)));
}

export function prestigeTotalFromLifetime(lifetime, prestigeDivisor) {
  if (!Number.isFinite(lifetime) || lifetime <= 0) return 0;
  return Math.floor(Math.sqrt(lifetime / prestigeDivisor));
}

export function upgradeCost(def, level) {
  return Math.ceil(def.baseCost * Math.pow(def.growth, level));
}

function emptyUpgrades(upgradeDefs) {
  return Object.fromEntries(upgradeDefs.map((upgrade) => [upgrade.id, 0]));
}

function masteryDefaults() {
  return {
    masteryRank: 0,
    masteryLifetimeEarned: 0
  };
}

function createDomain(index, upgradeDefs, masteryLibrary = new Map()) {
  const id = `domain-${index + 1}`;
  const mastery = masteryLibrary.get(id) || masteryDefaults();
  return {
    id,
    upgrades: emptyUpgrades(upgradeDefs),
    vaultAmount: 0,
    currentStreak: 0,
    lastVisitedHour: 0,
    dailyBonusClaimedDay: 0,
    lifetimeEarned: 0,
    masteryRank: mastery.masteryRank || 0,
    masteryLifetimeEarned: mastery.masteryLifetimeEarned || 0
  };
}

function createSlot(id, tier = 0) {
  return {
    id,
    tier,
    streakBonusTier: 0
  };
}

function level(domain, id) {
  return Number(domain.upgrades[id] || 0);
}

function tierBonus(economy, tier) {
  return economy.slotTiers.find((item) => item.tier === tier)?.bonus || 1;
}

function slotTierCost(economy, slotId, tier) {
  const baseCost = economy.slotTiers.find((item) => item.tier === tier)?.cpCost;
  if (!Number.isFinite(baseCost)) return Infinity;
  const slotScale = Math.pow(economy.slotPrestigeCostScale || 1, Math.max(0, Number(slotId) - 3));
  return Math.ceil(baseCost * slotScale);
}

function cacheCoreMultiplier(economy, level) {
  return Math.pow(economy.cacheCoreMultiplierBase || 1.45, Number(level || 0));
}

function cacheCoreCost(economy, level) {
  return Math.ceil((economy.cacheCoreBaseCost || 5) * Math.pow(economy.cacheCoreCostGrowth || 1.85, Number(level || 0)));
}

function masteryRank(domain, economy) {
  const cap = economy.masteryRankCap ?? 50;
  return Math.max(0, Math.min(cap, Math.floor(Number(domain?.masteryRank || 0))));
}

function masteryIncomeMultiplier(domain, economy) {
  return 1 + masteryRank(domain, economy) * (economy.masteryIncomePerRank ?? 0.02);
}

function masteryVaultCapMultiplier(domain, economy) {
  return 1 + masteryRank(domain, economy) * (economy.masteryVaultCapPerRank ?? 0.02);
}

function masteryLifetimeRequirement(economy, rank) {
  return (economy.masteryLifetimeBase ?? 1000000)
    * Math.pow(rank, economy.masteryLifetimeRankExponent ?? 3)
    * Math.pow(economy.masteryLifetimeGrowth ?? 1.6, rank - 1);
}

function masteryCcCost(economy, rank) {
  return Math.ceil((economy.masteryCcBaseCost ?? 2)
    * Math.pow(rank, economy.masteryCcRankExponent ?? 1.65)
    * Math.pow(economy.masteryCcGrowth ?? 1.24, rank - 1));
}

function domainBaseRate(domain, economy, cacheCoreLevel = 0) {
  return economy.baseRate * cacheCoreMultiplier(economy, cacheCoreLevel) * Math.pow(economy.trafficEngineMultiplier, level(domain, "trafficEngine"));
}

function activeRate(domain, economy, slotTier, cacheCoreLevel) {
  const tab = 1 + 0.15 * level(domain, "tabMultiplier");
  const focusLevel = level(domain, "focusBonus");
  const focus = 1 + 0.35 * focusLevel + 0.01 * Math.pow(focusLevel, 1.2);
  return domainBaseRate(domain, economy, cacheCoreLevel) * tab * focus * tierBonus(economy, slotTier) * masteryIncomeMultiplier(domain, economy);
}

function backgroundBaseRate(domain, economy, cacheCoreLevel) {
  const coreMultiplier = cacheCoreMultiplier(economy, cacheCoreLevel);
  const trafficRatio = Math.pow(economy.trafficEngineMultiplier, level(domain, "trafficEngine"));
  return economy.baseRate * coreMultiplier * Math.pow(trafficRatio, economy.backgroundTrafficExponent ?? 0.9);
}

function averageIdleDepthFactor(seconds) {
  if (seconds <= 0) return 0;
  const capSeconds = 1500;
  if (seconds <= capSeconds) return seconds / 600;
  return 5 - 3750 / seconds;
}

function backgroundEarnings(domain, economy, slotTier, seconds, cacheCoreLevel) {
  const hum = 0.08 * level(domain, "backgroundHum");
  if (hum <= 0 || seconds <= 0) return 0;
  const idleLevel = level(domain, "idleDepth");
  const idle = 1 + 0.1 * idleLevel * averageIdleDepthFactor(seconds);
  const tab = 1 + 0.15 * level(domain, "tabMultiplier");
  return backgroundBaseRate(domain, economy, cacheCoreLevel) * tab * hum * idle * tierBonus(economy, slotTier) * masteryIncomeMultiplier(domain, economy) * seconds;
}

function vaultTrafficScale(domain, economy, cacheCoreLevel) {
  const coreMultiplier = cacheCoreMultiplier(economy, cacheCoreLevel);
  const trafficRatio = domainBaseRate(domain, economy, cacheCoreLevel) / (economy.baseRate * coreMultiplier);
  return Math.pow(trafficRatio, economy.vaultTrafficExponent ?? 0.9);
}

function vaultUpgradeMultiplier(economy, upgradeLevel) {
  const currentLevel = Math.max(0, Number(upgradeLevel || 0));
  return 1
    + (economy.vaultLinearMultiplier ?? 0.12) * currentLevel
    + (economy.vaultPolyMultiplier ?? 0.005) * Math.pow(currentLevel, economy.vaultPolyExponent ?? 3);
}

function vaultCap(domain, economy, cacheCoreLevel) {
  const cold = level(domain, "coldStorage");
  const coreMultiplier = cacheCoreMultiplier(economy, cacheCoreLevel);
  return economy.baseRate * coreMultiplier * 60 * 25 * vaultTrafficScale(domain, economy, cacheCoreLevel) * vaultUpgradeMultiplier(economy, cold) * masteryVaultCapMultiplier(domain, economy);
}

function vaultRate(domain, economy, cacheCoreLevel) {
  const coreMultiplier = cacheCoreMultiplier(economy, cacheCoreLevel);
  return economy.vaultRate * coreMultiplier * vaultTrafficScale(domain, economy, cacheCoreLevel) * vaultUpgradeMultiplier(economy, level(domain, "storageDuration")) * masteryIncomeMultiplier(domain, economy);
}

function dailyFirstOpenValue(domain, economy, slotTierBonusValue, cacheCoreLevel) {
  const dailyBoot = level(domain, "dailyBoot");
  const baseDaily = Math.max(20, domainBaseRate(domain, economy, cacheCoreLevel) * 60 * (economy.dailyBaseMinutes ?? 60) * masteryIncomeMultiplier(domain, economy));
  const bootMultiplier = 1 + 0.18 * dailyBoot;
  const streak = Math.min(domain.currentStreak, 14);
  const bootAssist = 1 + (economy.dailyStreakBootMultiplier ?? 0.2) * Math.sqrt(dailyBoot);
  const streakMultiplier = 1 + (economy.dailyStreakBaseMultiplier ?? 0.04) * streak * bootAssist;
  return baseDaily * bootMultiplier * streakMultiplier * slotTierBonusValue;
}

function claimDailyFirstOpen(domain, economy, slotTier, day, includeDailyBonus, cacheCoreLevel) {
  const slotBonus = tierBonus(economy, slotTier);
  if (!includeDailyBonus || domain.dailyBonusClaimedDay === day) return 0;
  domain.currentStreak += 1;
  domain.dailyBonusClaimedDay = day;
  const daily = dailyFirstOpenValue(domain, economy, slotBonus, cacheCoreLevel);
  return daily;
}

function claimVault(domain, economy, slotTier, currentHour, cacheCoreLevel) {
  const stored = Math.min(domain.vaultAmount, vaultCap(domain, economy, cacheCoreLevel));
  domain.lastVisitedHour = currentHour;
  domain.vaultAmount = 0;
  return { vault: stored, total: stored };
}

function addEarnings(state, domain, amount, bucket) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  state.balance += amount;
  state.totalLifetimeEarned += amount;
  state.dailyBuckets[bucket] += amount;
  domain.lifetimeEarned += amount;
  domain.masteryLifetimeEarned += amount;
  if (state.masteryLibrary) {
    const mastery = state.masteryLibrary.get(domain.id) || masteryDefaults();
    mastery.masteryLifetimeEarned += amount;
    mastery.masteryRank = Math.max(mastery.masteryRank || 0, domain.masteryRank || 0);
    state.masteryLibrary.set(domain.id, mastery);
  }
}

function addVaultFill(state, domain, economy, elapsedSeconds) {
  const cap = vaultCap(domain, economy, state.cacheCoreLevel);
  const gain = Math.min(Math.max(0, cap - domain.vaultAmount), vaultRate(domain, economy, state.cacheCoreLevel) * elapsedSeconds);
  if (gain <= 0) return;
  domain.vaultAmount += gain;
  state.dailyBuckets.vaultAccrued += gain;
}

function canBuy(def, currentLevel, balance) {
  if (def.maxLevel !== null && currentLevel >= def.maxLevel) return false;
  return balance >= upgradeCost(def, currentLevel);
}

function spendAvailableMoney(state, economy, dayNumber) {
  let boughtSomething = true;
  let purchasesThisPeriod = 0;
  while (boughtSomething) {
    if (purchasesThisPeriod >= state.config.maxUpgradePurchasesPerPeriod) {
      state.warnings.push({
        day: dayNumber,
        type: "purchase_cap",
        message: `Stopped buying after ${state.config.maxUpgradePurchasesPerPeriod} purchases in one period. Upgrade growth may be too low and causing runaway simulation time.`
      });
      break;
    }
    boughtSomething = false;

    const nextSlot = state.domains.length + 1;
    const nextSlotCost = slotUnlockCost(nextSlot);
    if (state.balance >= nextSlotCost) {
      state.balance -= nextSlotCost;
      state.totalSpent += nextSlotCost;
      state.domains.push(createDomain(state.domains.length, economy.upgradeDefs, state.masteryLibrary));
      state.slots.push(createSlot(nextSlot));
      state.slotUnlocks.push({ slot: nextSlot, day: dayNumber, cost: nextSlotCost });
      purchasesThisPeriod += 1;
      boughtSomething = true;
      continue;
    }

    const candidates = [];
    state.domains.forEach((domain, domainIndex) => {
      economy.upgradeDefs.forEach((def, upgradeIndex) => {
        const currentLevel = level(domain, def.id);
        if (def.maxLevel !== null && currentLevel >= def.maxLevel) return;
        candidates.push({ domain, domainIndex, def, upgradeIndex, level: currentLevel, cost: upgradeCost(def, currentLevel) });
      });
    });

    if (!candidates.length) break;
    const affordable = candidates
      .filter((item) => canBuy(item.def, item.level, state.balance))
      .sort((a, b) => a.cost - b.cost || a.domainIndex - b.domainIndex || a.upgradeIndex - b.upgradeIndex);

    if (!affordable.length) break;
    const purchase = affordable[0];
    state.balance -= purchase.cost;
    state.totalSpent += purchase.cost;
    purchase.domain.upgrades[purchase.def.id] += 1;
    purchasesThisPeriod += 1;
    boughtSomething = true;
  }
}

function spendPrestigeOnSlots(state, economy) {
  const purchases = [];
  for (const slot of state.slots) {
    while (slot.tier < economy.slotTiers.length - 1) {
      const nextTier = slot.tier + 1;
      const cost = slotTierCost(economy, slot.id, nextTier);
      if (state.cachePoints < cost) break;
      state.cachePoints -= cost;
      slot.tier = nextTier;
      purchases.push({ slot: slot.id, tier: nextTier, cost });
    }
  }
  return purchases;
}

function spendPrestigeOnCacheCore(state, economy) {
  const purchases = [];
  while (state.cachePoints >= cacheCoreCost(economy, state.cacheCoreLevel)) {
    const cost = cacheCoreCost(economy, state.cacheCoreLevel);
    state.cachePoints -= cost;
    state.cacheCoreLevel += 1;
    purchases.push({
      level: state.cacheCoreLevel,
      cost,
      multiplier: cacheCoreMultiplier(economy, state.cacheCoreLevel)
    });
  }
  return purchases;
}

function strongestMasteryDomain(state) {
  let bestId = null;
  let bestLifetime = -1;
  state.masteryLibrary.forEach((mastery, id) => {
    if ((mastery.masteryLifetimeEarned || 0) > bestLifetime) {
      bestId = id;
      bestLifetime = mastery.masteryLifetimeEarned || 0;
    }
  });
  return bestId;
}

function spendPrestigeOnDomainMastery(state, economy) {
  const purchases = [];
  if (!state.config.enableDomainMastery) return purchases;
  const domainId = strongestMasteryDomain(state);
  if (!domainId) return purchases;
  const mastery = state.masteryLibrary.get(domainId) || masteryDefaults();
  const cap = economy.masteryRankCap ?? 50;
  while (mastery.masteryRank < cap) {
    const nextRank = mastery.masteryRank + 1;
    const requirement = masteryLifetimeRequirement(economy, nextRank);
    const cost = masteryCcCost(economy, nextRank);
    if (mastery.masteryLifetimeEarned < requirement || state.cachePoints < cost) break;
    state.cachePoints -= cost;
    mastery.masteryRank = nextRank;
    purchases.push({
      domainId,
      rank: nextRank,
      cost,
      requirement,
      masteryLifetimeEarned: mastery.masteryLifetimeEarned,
      incomeMultiplier: 1 + nextRank * (economy.masteryIncomePerRank ?? 0.02),
      vaultCapMultiplier: 1 + nextRank * (economy.masteryVaultCapPerRank ?? 0.02)
    });
  }
  state.masteryLibrary.set(domainId, mastery);
  for (const domain of state.domains) {
    if (domain.id !== domainId) continue;
    domain.masteryRank = mastery.masteryRank;
    domain.masteryLifetimeEarned = mastery.masteryLifetimeEarned;
  }
  return purchases;
}

function resetForPrestige(state, economy, day) {
  if (state.prestigeCount < 1 && state.totalLifetimeEarned < (economy.firstPrestigeLifetimeRequirement ?? 10000000)) {
    state.warnings.push({
      day,
      type: "prestige_locked",
      message: `First prestige skipped; lifetime earnings below $${economy.firstPrestigeLifetimeRequirement ?? 10000000}.`
    });
    return null;
  }
  const totalPrestige = prestigeTotalFromLifetime(state.totalLifetimeEarned, economy.prestigeDivisor);
  const award = Math.max(0, totalPrestige - state.cpAlreadyClaimedFromLifetime);
  state.cachePoints += award;
  state.cpAlreadyClaimedFromLifetime = totalPrestige;
  const cacheCorePurchases = spendPrestigeOnCacheCore(state, economy);
  const masteryPurchases = spendPrestigeOnDomainMastery(state, economy);
  const purchases = spendPrestigeOnSlots(state, economy);
  const highestPersistentSlot = state.slots.reduce((highest, slot) => {
    return slot.id <= 3 || slot.tier > 0 ? Math.max(highest, slot.id) : highest;
  }, 3);
  const previousSlots = state.slots.length;
  state.balance = 0;
  state.prestigeCount += 1;
  state.currentRun += 1;
  state.currentRunStartDay = day + 1;
  state.slots = Array.from({ length: highestPersistentSlot }, (_, index) => {
    const id = index + 1;
    const existing = state.slots.find((slot) => slot.id === id);
    return createSlot(id, existing?.tier || 0);
  });
  state.domains = state.slots.map((_, index) => createDomain(index, economy.upgradeDefs, state.masteryLibrary));
  const event = {
    day,
    award,
    totalPrestige,
    cachePointsRemaining: state.cachePoints,
    cacheCoreLevel: state.cacheCoreLevel,
    cacheCorePurchases,
    masteryPurchases,
    highestMasteryRank: highestMasteryRank(state.masteryLibrary),
    slotsBefore: previousSlots,
    slotsAfter: state.slots.length,
    purchases
  };
  state.prestigeEvents.push(event);
  return event;
}

function highestUpgradeLevels(domains, upgradeDefs) {
  return Object.fromEntries(upgradeDefs.map((def) => [
    def.id,
    Math.max(...domains.map((domain) => level(domain, def.id)))
  ]));
}

function averageUpgradeLevels(domains, upgradeDefs) {
  return Object.fromEntries(upgradeDefs.map((def) => [
    def.id,
    domains.reduce((sum, domain) => sum + level(domain, def.id), 0) / domains.length
  ]));
}

function totalVaultStored(domains) {
  return domains.reduce((sum, domain) => sum + domain.vaultAmount, 0);
}

function highestMasteryRank(masteryLibrary) {
  let highest = 0;
  masteryLibrary.forEach((mastery) => {
    highest = Math.max(highest, mastery.masteryRank || 0);
  });
  return highest;
}

function topMasteryLifetime(masteryLibrary) {
  let highest = 0;
  masteryLibrary.forEach((mastery) => {
    highest = Math.max(highest, mastery.masteryLifetimeEarned || 0);
  });
  return highest;
}

function normalizePrestigeResetDays(config) {
  if (!config.prestigeMode) return new Set();
  const validDays = [...new Set((config.prestigeResetDays || [])
    .map((day) => Math.floor(Number(day)))
    .filter((day) => day >= 1 && day <= config.days))]
    .sort((a, b) => a - b);
  const count = Math.max(0, Math.floor(Number(config.prestigeResets) || 0));
  return new Set(validDays.slice(0, count));
}

export function simulateEconomy(economy, options = {}) {
  const config = { ...DEFAULT_SIM_OPTIONS, ...options };
  const startingCash = Math.max(0, Number(config.startingCash || 0));
  const state = {
    config,
    balance: startingCash,
    totalLifetimeEarned: startingCash,
    totalSpent: 0,
    cachePoints: 0,
    cpAlreadyClaimedFromLifetime: 0,
    cacheCoreLevel: 0,
    prestigeCount: 0,
    currentRun: 1,
    currentRunStartDay: 1,
    masteryLibrary: new Map(),
    domains: Array.from({ length: config.startingSlots }, (_, index) => createDomain(index, economy.upgradeDefs)),
    slots: Array.from({ length: config.startingSlots }, (_, index) => createSlot(index + 1, config.slotTier)),
    slotUnlocks: Array.from({ length: config.startingSlots }, (_, index) => ({ slot: index + 1, day: 1, cost: 0 })),
    prestigeEvents: [],
    warnings: [],
    dailyBuckets: null
  };
  state.domains.forEach((domain) => {
    state.masteryLibrary.set(domain.id, {
      masteryRank: domain.masteryRank,
      masteryLifetimeEarned: domain.masteryLifetimeEarned
    });
  });

  const daily = [];
  const resetDays = normalizePrestigeResetDays(config);
  const periodsPerDay = Math.max(1, Math.floor(config.vaultClaimsPerDay));
  const periodSeconds = 86400 / periodsPerDay;

  spendAvailableMoney(state, economy, 0);

  for (let day = 1; day <= config.days; day += 1) {
    state.dailyBuckets = {
      focus: 0,
      background: 0,
      vaultAccrued: 0,
      vaultClaimed: 0,
      dailyBonus: 0,
      navigation: 0,
      wake: 0
    };

    for (let period = 1; period <= periodsPerDay; period += 1) {
      const currentHour = (day - 1) * 24 + period * (24 / periodsPerDay);
      const domainsAtPeriodStart = state.domains.length;
      const focusSecondsPerDomain = (config.focusMinutesPerDay * 60 / domainsAtPeriodStart) / periodsPerDay;
      const backgroundSecondsPerDomain = (config.backgroundMinutesPerOtherSlotPerDay * 60 * Math.max(0, domainsAtPeriodStart - 1) / domainsAtPeriodStart) / periodsPerDay;

      state.domains.forEach((domain, domainIndex) => {
        const slot = state.slots[domainIndex] || createSlot(domainIndex + 1);
        addVaultFill(state, domain, economy, periodSeconds);

        const daily = claimDailyFirstOpen(domain, economy, slot.tier, day, config.includeDailyBonus, state.cacheCoreLevel);
        addEarnings(state, domain, daily, "dailyBonus");

        const focused = activeRate(domain, economy, slot.tier, state.cacheCoreLevel) * focusSecondsPerDomain;
        addEarnings(state, domain, focused, "focus");

        const background = backgroundEarnings(domain, economy, slot.tier, backgroundSecondsPerDomain, state.cacheCoreLevel);
        addEarnings(state, domain, background, "background");

        if (config.enableNavigationBonus && config.navigationEventsPerFocusedHour > 0) {
          const events = (focusSecondsPerDomain / 3600) * config.navigationEventsPerFocusedHour;
          const navLevel = level(domain, "navigationBonus");
          const amount = navLevel > 0
            ? activeRate(domain, economy, slot.tier, state.cacheCoreLevel) * (economy.navigationEventSeconds ?? 7) * Math.sqrt(navLevel) * events
            : 0;
          addEarnings(state, domain, amount, "navigation");
        }

        if (config.enableWakeBonus && config.wakeEventsPerDomainPerDay > 0) {
          const events = config.wakeEventsPerDomainPerDay / periodsPerDay;
          const amount = domainBaseRate(domain, economy, state.cacheCoreLevel) * (economy.wakeBurstSeconds ?? 105) * Math.pow(level(domain, "wakeBonus"), 1.1) * tierBonus(economy, slot.tier) * masteryIncomeMultiplier(domain, economy) * events;
          addEarnings(state, domain, amount, "wake");
        }

        const payout = claimVault(domain, economy, slot.tier, currentHour, state.cacheCoreLevel);
        addEarnings(state, domain, payout.vault, "vaultClaimed");
      });

      spendAvailableMoney(state, economy, day + period / periodsPerDay);
    }

    const run = state.currentRun;
    const runDay = day - state.currentRunStartDay + 1;
    const prestigeEvent = resetDays.has(day) ? resetForPrestige(state, economy, day) : null;
    const redeemablePrestige = prestigeTotalFromLifetime(state.totalLifetimeEarned, economy.prestigeDivisor);
    daily.push({
      day,
      run,
      runDay,
      balance: state.balance,
      totalLifetimeEarned: state.totalLifetimeEarned,
      totalSpent: state.totalSpent,
      slots: state.domains.length,
      redeemablePrestige,
      lifetimePrestige: redeemablePrestige,
      claimedPrestige: state.cpAlreadyClaimedFromLifetime,
      cachePoints: state.cachePoints,
      cacheCoreLevel: state.cacheCoreLevel,
      cacheCoreMultiplier: cacheCoreMultiplier(economy, state.cacheCoreLevel),
      highestMasteryRank: highestMasteryRank(state.masteryLibrary),
      topMasteryLifetime: topMasteryLifetime(state.masteryLibrary),
      prestigeCount: state.prestigeCount,
      prestigeAward: prestigeEvent?.award || 0,
      vaultStored: totalVaultStored(state.domains),
      income: { ...state.dailyBuckets },
      highestUpgradeLevels: highestUpgradeLevels(state.domains, economy.upgradeDefs),
      averageUpgradeLevels: averageUpgradeLevels(state.domains, economy.upgradeDefs),
      slotTiers: state.slots.map((slot) => slot.tier)
    });
  }

  return {
    config,
    economy,
    daily,
    slotUnlocks: state.slotUnlocks,
    prestigeEvents: state.prestigeEvents,
    warnings: state.warnings,
    final: daily[daily.length - 1],
    slots: state.slots.map((slot) => ({ ...slot })),
    masteryLibrary: Array.from(state.masteryLibrary, ([id, mastery]) => ({ id, ...mastery })),
    domains: state.domains.map((domain) => ({
      id: domain.id,
      upgrades: { ...domain.upgrades },
      lifetimeEarned: domain.lifetimeEarned,
      masteryLifetimeEarned: domain.masteryLifetimeEarned,
      masteryRank: domain.masteryRank,
      vaultAmount: domain.vaultAmount
    }))
  };
}
