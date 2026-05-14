export const DEFAULT_SIM_OPTIONS = {
  days: 30,
  focusMinutesPerDay: 120,
  backgroundMinutesPerOtherSlotPerDay: 30,
  vaultClaimsPerDay: 2,
  startingSlots: 3,
  includeDailyBonus: true,
  enableNavigationBonus: true,
  navigationEventsPerFocusedHour: 5,
  enableWakeBonus: true,
  wakeEventsPerDomainPerDay: 1,
  slotTier: 0
};

function floorToSignificantFigures(value, figures = 2) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const scale = Math.pow(10, Math.floor(Math.log10(value)) - figures + 1);
  return Math.floor(value / scale) * scale;
}

export function slotUnlockCost(slotNumber) {
  if (slotNumber <= 3) return 0;
  if (slotNumber === 4) return 500;
  return floorToSignificantFigures(500 * Math.pow(5, Math.pow(slotNumber - 3.75, 1.35)));
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

function createDomain(index, upgradeDefs) {
  return {
    id: `domain-${index + 1}`,
    upgrades: emptyUpgrades(upgradeDefs),
    vaultAmount: 0,
    currentStreak: 0,
    lastVisitedHour: 0,
    dailyBonusClaimedDay: 0,
    lifetimeEarned: 0
  };
}

function level(domain, id) {
  return Number(domain.upgrades[id] || 0);
}

function tierBonus(economy, tier) {
  return economy.slotTiers.find((item) => item.tier === tier)?.bonus || 1;
}

function domainBaseRate(domain, economy) {
  return economy.baseRate * Math.pow(economy.trafficEngineMultiplier, level(domain, "trafficEngine"));
}

function activeRate(domain, economy, slotTier) {
  const tab = 1 + 0.15 * level(domain, "tabMultiplier");
  const focusLevel = level(domain, "focusBonus");
  const focus = 1 + 0.35 * focusLevel + 0.01 * Math.pow(focusLevel, 1.2);
  return domainBaseRate(domain, economy) * tab * focus * tierBonus(economy, slotTier);
}

function averageIdleDepthFactor(seconds) {
  if (seconds <= 0) return 0;
  const capSeconds = 1500;
  if (seconds <= capSeconds) return seconds / 600;
  return 5 - 3750 / seconds;
}

function backgroundEarnings(domain, economy, slotTier, seconds) {
  const hum = 0.08 * level(domain, "backgroundHum");
  if (hum <= 0 || seconds <= 0) return 0;
  const idleLevel = level(domain, "idleDepth");
  const idle = 1 + 0.1 * idleLevel * averageIdleDepthFactor(seconds);
  const tab = 1 + 0.15 * level(domain, "tabMultiplier");
  return domainBaseRate(domain, economy) * tab * hum * idle * tierBonus(economy, slotTier) * seconds;
}

function vaultCap(domain, economy) {
  const cold = level(domain, "coldStorage");
  const trafficScale = Math.sqrt(domainBaseRate(domain, economy) / economy.baseRate);
  return economy.baseRate * 60 * 25 * trafficScale * Math.pow(1.32, cold);
}

function vaultRate(domain, economy) {
  const trafficScale = Math.sqrt(domainBaseRate(domain, economy) / economy.baseRate);
  return economy.vaultRate * trafficScale * Math.pow(1.3, level(domain, "storageDuration"));
}

function dailyFirstOpenValue(domain, economy, slotTierBonusValue) {
  const dailyBoot = level(domain, "dailyBoot");
  const baseDaily = Math.max(20, domainBaseRate(domain, economy) * 60 * 35);
  const bootMultiplier = 1 + 0.18 * Math.pow(dailyBoot, 0.95);
  const streakMultiplier = 1 + Math.min(domain.currentStreak, 14) * 0.04;
  return baseDaily * bootMultiplier * streakMultiplier * slotTierBonusValue;
}

function dailyFirstOpenBonus(domain, economy, slotTierBonusValue, day, enabled) {
  if (!enabled || domain.dailyBonusClaimedDay === day) return 0;
  return dailyFirstOpenValue(domain, economy, slotTierBonusValue);
}

function claimVault(domain, economy, slotTier, currentHour, day, includeDailyBonus) {
  const slotBonus = tierBonus(economy, slotTier);
  const stored = Math.min(domain.vaultAmount, vaultCap(domain, economy));
  const daily = dailyFirstOpenBonus(domain, economy, slotBonus, day, includeDailyBonus);

  if (daily > 0) {
    domain.currentStreak += 1;
    domain.dailyBonusClaimedDay = day;
  }

  domain.lastVisitedHour = currentHour;
  domain.vaultAmount = 0;
  return { vault: stored, daily, total: stored + daily };
}

function addEarnings(state, domain, amount, bucket) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  state.balance += amount;
  state.totalLifetimeEarned += amount;
  state.dailyBuckets[bucket] += amount;
  domain.lifetimeEarned += amount;
}

function addVaultFill(state, domain, economy, elapsedSeconds) {
  const cap = vaultCap(domain, economy);
  const gain = Math.min(Math.max(0, cap - domain.vaultAmount), vaultRate(domain, economy) * elapsedSeconds);
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
  while (boughtSomething) {
    boughtSomething = false;

    const nextSlot = state.domains.length + 1;
    const nextSlotCost = slotUnlockCost(nextSlot);
    if (state.balance >= nextSlotCost) {
      state.balance -= nextSlotCost;
      state.totalSpent += nextSlotCost;
      state.domains.push(createDomain(state.domains.length, economy.upgradeDefs));
      state.slotUnlocks.push({ slot: nextSlot, day: dayNumber, cost: nextSlotCost });
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
    boughtSomething = true;
  }
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

export function simulateEconomy(economy, options = {}) {
  const config = { ...DEFAULT_SIM_OPTIONS, ...options };
  const state = {
    balance: 0,
    totalLifetimeEarned: 0,
    totalSpent: 0,
    domains: Array.from({ length: config.startingSlots }, (_, index) => createDomain(index, economy.upgradeDefs)),
    slotUnlocks: Array.from({ length: config.startingSlots }, (_, index) => ({ slot: index + 1, day: 1, cost: 0 })),
    dailyBuckets: null
  };

  const daily = [];
  const periodsPerDay = Math.max(1, Math.floor(config.vaultClaimsPerDay));
  const periodSeconds = 86400 / periodsPerDay;

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

      for (const domain of state.domains) {
        addVaultFill(state, domain, economy, periodSeconds);

        const focused = activeRate(domain, economy, config.slotTier) * focusSecondsPerDomain;
        addEarnings(state, domain, focused, "focus");

        const background = backgroundEarnings(domain, economy, config.slotTier, backgroundSecondsPerDomain);
        addEarnings(state, domain, background, "background");

        if (config.enableNavigationBonus && config.navigationEventsPerFocusedHour > 0) {
          const events = (focusSecondsPerDomain / 3600) * config.navigationEventsPerFocusedHour;
          const navLevel = level(domain, "navigationBonus");
          const amount = navLevel > 0
            ? dailyFirstOpenValue(domain, economy, tierBonus(economy, config.slotTier)) * 0.13 * (1 + 0.18 * navLevel) * events
            : 0;
          addEarnings(state, domain, amount, "navigation");
        }

        if (config.enableWakeBonus && config.wakeEventsPerDomainPerDay > 0) {
          const events = config.wakeEventsPerDomainPerDay / periodsPerDay;
          const amount = domainBaseRate(domain, economy) * 65 * Math.pow(level(domain, "wakeBonus"), 1.1) * tierBonus(economy, config.slotTier) * events;
          addEarnings(state, domain, amount, "wake");
        }

        const payout = claimVault(domain, economy, config.slotTier, currentHour, day, config.includeDailyBonus);
        addEarnings(state, domain, payout.vault, "vaultClaimed");
        addEarnings(state, domain, payout.daily, "dailyBonus");
      }

      spendAvailableMoney(state, economy, day + period / periodsPerDay);
    }

    const redeemablePrestige = prestigeTotalFromLifetime(state.totalLifetimeEarned, economy.prestigeDivisor);
    daily.push({
      day,
      balance: state.balance,
      totalLifetimeEarned: state.totalLifetimeEarned,
      totalSpent: state.totalSpent,
      slots: state.domains.length,
      redeemablePrestige,
      vaultStored: totalVaultStored(state.domains),
      income: { ...state.dailyBuckets },
      highestUpgradeLevels: highestUpgradeLevels(state.domains, economy.upgradeDefs),
      averageUpgradeLevels: averageUpgradeLevels(state.domains, economy.upgradeDefs)
    });
  }

  return {
    config,
    economy,
    daily,
    slotUnlocks: state.slotUnlocks,
    final: daily[daily.length - 1],
    domains: state.domains.map((domain) => ({
      id: domain.id,
      upgrades: { ...domain.upgrades },
      lifetimeEarned: domain.lifetimeEarned,
      vaultAmount: domain.vaultAmount
    }))
  };
}
