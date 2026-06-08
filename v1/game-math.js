(function (global) {
  const BASE_RATE = 0.25;
  const VAULT_RATE = BASE_RATE * 0.02;
  const TRAFFIC_ENGINE_MULTIPLIER = 1.15;
  const PRESTIGE_DIVISOR = 100000;
  const SLOT_PRESTIGE_COST_SCALE = 5.0;
  const CACHE_CORE_MULTIPLIER = 1.5;
  const CACHE_CORE_BASE_COST = 5;
  const CACHE_CORE_COST_GROWTH = 1.5;
  const SUPPORTER_CORE_MULTIPLIER = 1.5;
  const COLD_STORAGE_MULTIPLIER = 1.32;
  const SCI_ZERO = Object.freeze({ m: 0, e: 0 });

  const UPGRADE_DEFS = Object.freeze([
    { id: "tabMultiplier", name: "Tab Multiplier", category: "active", baseCost: 35, growth: 1.5, maxLevel: null, icon: 13 },
    { id: "focusBonus", name: "Focus Bonus", category: "active", baseCost: 25, growth: 1.35, maxLevel: null, icon: 16 },
    { id: "navigationBonus", name: "Navigation Bonus", category: "active", baseCost: 100, growth: 1.65, maxLevel: null, icon: 37 },
    { id: "coldStorage", name: "Cold Storage", category: "vault", baseCost: 100, growth: 1.6, maxLevel: null, icon: 22 },
    { id: "storageDuration", name: "Vault Pump", category: "vault", baseCost: 100, growth: 1.6, maxLevel: null, icon: 5 },
    { id: "trafficEngine", name: "Traffic Engine", category: "active", baseCost: 25, growth: 1.4, maxLevel: null, icon: 26 },
    { id: "dailyBoot", name: "Daily Boot", category: "vault", baseCost: 50, growth: 1.35, maxLevel: null, icon: 33 },
    { id: "backgroundHum", name: "Background Hum", category: "background", baseCost: 150, growth: 1.8, maxLevel: null, icon: 30 },
    { id: "idleDepth", name: "Idle Depth", category: "background", baseCost: 150, growth: 1.8, maxLevel: null, icon: 9 },
    { id: "wakeBonus", name: "Wake Bonus", category: "background", baseCost: 75, growth: 1.4, maxLevel: null, icon: 10 }
  ]);

  const SLOT_TIERS = Object.freeze([
    { tier: 0, cpCost: 0, bonus: 1 },
    { tier: 1, cpCost: 1, bonus: 1.2 },
    { tier: 2, cpCost: 3, bonus: 1.5 },
    { tier: 3, cpCost: 8, bonus: 2 },
    { tier: 4, cpCost: 20, bonus: 2.75 },
    { tier: 5, cpCost: 50, bonus: 4 }
  ]);

  const emptyUpgrades = () => Object.fromEntries(UPGRADE_DEFS.map((upgrade) => [upgrade.id, 0]));

  function normalizeSci(m, e = 0) {
    if (!Number.isFinite(m) || m <= 0) return { ...SCI_ZERO };
    let mantissa = m;
    let exponent = Number.isFinite(e) ? Math.trunc(e) : 0;
    while (mantissa >= 10) {
      mantissa /= 10;
      exponent += 1;
    }
    while (mantissa < 1) {
      mantissa *= 10;
      exponent -= 1;
    }
    return { m: mantissa, e: exponent };
  }

  function toSci(value) {
    if (value && typeof value === "object" && "m" in value && "e" in value) {
      return normalizeSci(Number(value.m), Number(value.e));
    }
    if (typeof value === "string") {
      const match = value.trim().match(/^([+-]?\d+(?:\.\d+)?)(?:e([+-]?\d+))?$/i);
      if (match) return normalizeSci(Number(match[1]), Number(match[2] || 0));
    }
    return normalizeSci(Number(value || 0), 0);
  }

  function sciToNumber(value) {
    const sci = toSci(value);
    if (sci.m === 0) return 0;
    if (sci.e > 308) return Number.MAX_VALUE;
    return sci.m * Math.pow(10, sci.e);
  }

  function sciCompare(a, b) {
    const left = toSci(a);
    const right = toSci(b);
    if (left.m === 0 && right.m === 0) return 0;
    if (left.e !== right.e) return left.e > right.e ? 1 : -1;
    if (left.m === right.m) return 0;
    return left.m > right.m ? 1 : -1;
  }

  function sciAdd(a, b) {
    const left = toSci(a);
    const right = toSci(b);
    if (left.m === 0) return right;
    if (right.m === 0) return left;
    const diff = left.e - right.e;
    if (diff > 16) return left;
    if (diff < -16) return right;
    const exponent = Math.max(left.e, right.e);
    const mantissa = left.m * Math.pow(10, left.e - exponent) + right.m * Math.pow(10, right.e - exponent);
    return normalizeSci(mantissa, exponent);
  }

  function sciSub(a, b) {
    if (sciCompare(a, b) <= 0) return { ...SCI_ZERO };
    const left = toSci(a);
    const right = toSci(b);
    const diff = left.e - right.e;
    if (diff > 16) return left;
    const mantissa = left.m - right.m * Math.pow(10, right.e - left.e);
    return normalizeSci(mantissa, left.e);
  }

  function prestigeTotalFromLifetime(lifetime) {
    const sci = toSci(lifetime);
    if (sci.m === 0) return 0;
    const divisor = toSci(PRESTIGE_DIVISOR);
    let mantissa = sci.m / divisor.m;
    let exponent = sci.e - divisor.e;
    if (mantissa > 0 && mantissa < 1) {
      mantissa *= 10;
      exponent -= 1;
    }
    if (exponent % 2 !== 0) {
      mantissa *= 10;
      exponent -= 1;
    }
    const cp = Math.sqrt(mantissa) * Math.pow(10, exponent / 2);
    if (!Number.isFinite(cp)) return Number.MAX_SAFE_INTEGER;
    return Math.floor(Math.min(cp, Number.MAX_SAFE_INTEGER));
  }

  function cacheCoreMultiplier(level) {
    return Math.pow(CACHE_CORE_MULTIPLIER, Number(level || 0));
  }

  function cacheCoreCost(currentLevel) {
    return Math.ceil(CACHE_CORE_BASE_COST * Math.pow(CACHE_CORE_COST_GROWTH, Number(currentLevel || 0)));
  }

  function getUpgradeLevel(entry, id) {
    return Number(entry?.upgrades?.[id] || 0);
  }

  function upgradeCost(def, level) {
    return Math.ceil(def.baseCost * Math.pow(def.growth, level));
  }

  function floorToSignificantFigures(value, figures = 2) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    const scale = Math.pow(10, Math.floor(Math.log10(value)) - figures + 1);
    return Math.floor(value / scale) * scale;
  }

  function slotTierBonus(slot) {
    return SLOT_TIERS.find((tier) => tier.tier === slot?.tier)?.bonus || 1;
  }

  function slotTierCost(slotId, tier) {
    const tierNumber = typeof tier === "object" ? tier?.tier : tier;
    const baseCost = SLOT_TIERS.find((item) => item.tier === tierNumber)?.cpCost;
    if (!Number.isFinite(baseCost)) return Infinity;
    const slotScale = Math.pow(SLOT_PRESTIGE_COST_SCALE, Math.max(0, Number(slotId) - 3));
    return Math.ceil(baseCost * slotScale);
  }

  function slotUnlockCost(slotNumber) {
    if (slotNumber <= 3) return 0;
    if (slotNumber === 4) return 500;
    return floorToSignificantFigures(500 * Math.pow(5, Math.pow(slotNumber - 3.75, 1.35)));
  }

  function domainBaseRate(entry, cacheCoreLevel = 0) {
    return BASE_RATE * cacheCoreMultiplier(cacheCoreLevel) * Math.pow(TRAFFIC_ENGINE_MULTIPLIER, getUpgradeLevel(entry, "trafficEngine"));
  }

  function tabMultiplier(level) {
    return 1 + 0.15 * level;
  }

  function focusMultiplier(level) {
    return 1 + 0.35 * level + 0.01 * Math.pow(level, 1.2);
  }

  function vaultPumpMultiplier(level) {
    return Math.pow(1.3, level);
  }

  function dailyBootMultiplier(level) {
    return 1 + 0.18 * level;
  }

  function vaultCap(entry, coldLevel = getUpgradeLevel(entry, "coldStorage"), cacheCoreLevel = 0, premiumMultiplier = 1) {
    const coreMultiplier = cacheCoreMultiplier(cacheCoreLevel);
    const trafficScale = Math.sqrt(domainBaseRate(entry, cacheCoreLevel) / (BASE_RATE * coreMultiplier));
    const baseCap = BASE_RATE * coreMultiplier * 60 * 25 * trafficScale * premiumMultiplier;
    return baseCap * Math.pow(COLD_STORAGE_MULTIPLIER, coldLevel);
  }

  function vaultRate(entry, storageLevel = getUpgradeLevel(entry, "storageDuration"), cacheCoreLevel = 0, premiumMultiplier = 1) {
    const coreMultiplier = cacheCoreMultiplier(cacheCoreLevel);
    const trafficScale = Math.sqrt(domainBaseRate(entry, cacheCoreLevel) / (BASE_RATE * coreMultiplier));
    return VAULT_RATE * coreMultiplier * trafficScale * vaultPumpMultiplier(storageLevel) * premiumMultiplier;
  }

  function activeIncomePerSecond(entry, slot, cacheCoreLevel = 0, premiumMultiplier = 1) {
    return domainBaseRate(entry, cacheCoreLevel) * tabMultiplier(getUpgradeLevel(entry, "tabMultiplier")) * focusMultiplier(getUpgradeLevel(entry, "focusBonus")) * slotTierBonus(slot) * premiumMultiplier;
  }

  function backgroundIncomePerSecond(entry, slot, backgroundSince, now, cacheCoreLevel = 0, premiumMultiplier = 1) {
    const hum = 0.08 * getUpgradeLevel(entry, "backgroundHum");
    if (hum <= 0) return 0;
    const idleLevel = getUpgradeLevel(entry, "idleDepth");
    const idleSeconds = Math.max(0, (now - (backgroundSince || now)) / 1000);
    const idle = 1 + 0.1 * idleLevel * Math.min(idleSeconds / 300, 5);
    return domainBaseRate(entry, cacheCoreLevel) * tabMultiplier(getUpgradeLevel(entry, "tabMultiplier")) * hum * idle * slotTierBonus(slot) * premiumMultiplier;
  }

  function domainIncomeForState(entry, slot, presence, now, cacheCoreLevel = 0, premiumMultiplier = 1) {
    if (!presence) return 0;
    if (presence.state === "active") return activeIncomePerSecond(entry, slot, cacheCoreLevel, premiumMultiplier);
    if (presence.state === "background") return backgroundIncomePerSecond(entry, slot, presence.backgroundSince, now, cacheCoreLevel, premiumMultiplier);
    return 0;
  }

  function dailyFirstOpenBonusForStreak(entry, slot, streak, cacheCoreLevel = 0, premiumMultiplier = 1) {
    const dailyBoot = getUpgradeLevel(entry, "dailyBoot");
    const slotStreak = slot?.streakBonusTier || 0;
    const baseDaily = Math.max(20, domainBaseRate(entry, cacheCoreLevel) * 60 * 35) * premiumMultiplier;
    const streakLevel = Math.min(Number(streak || 0), 14);
    const streakMultiplier = 1 + streakLevel * 0.05 + dailyBoot * streakLevel * 0.01;
    return baseDaily * dailyBootMultiplier(dailyBoot) * streakMultiplier * (1 + slotStreak * 0.15);
  }

  function dailyFirstOpenBonus(entry, slot, cacheCoreLevel = 0, premiumMultiplier = 1) {
    return dailyFirstOpenBonusForStreak(entry, slot, entry?.currentStreak || 0, cacheCoreLevel, premiumMultiplier);
  }

  function navigationPayoutForLevel(entry, slot, level, cacheCoreLevel = 0, premiumMultiplier = 1) {
    if (!entry || !slot || level <= 0) return 0;
    return dailyFirstOpenBonus(entry, slot, cacheCoreLevel, premiumMultiplier) * 0.07 * (1 + 0.18 * level);
  }

  function wakeBurstForLevel(entry, slot, level, cacheCoreLevel = 0, premiumMultiplier = 1) {
    if (!entry || !slot || level <= 0) return 0;
    return domainBaseRate(entry, cacheCoreLevel) * 65 * Math.pow(level, 1.1) * slotTierBonus(slot) * premiumMultiplier;
  }

  global.BrowserTycoonMath = Object.freeze({
    BASE_RATE,
    VAULT_RATE,
    TRAFFIC_ENGINE_MULTIPLIER,
    PRESTIGE_DIVISOR,
    SLOT_PRESTIGE_COST_SCALE,
    CACHE_CORE_MULTIPLIER,
    CACHE_CORE_BASE_COST,
    CACHE_CORE_COST_GROWTH,
    SUPPORTER_CORE_MULTIPLIER,
    COLD_STORAGE_MULTIPLIER,
    SCI_ZERO,
    UPGRADE_DEFS,
    SLOT_TIERS,
    emptyUpgrades,
    normalizeSci,
    toSci,
    sciToNumber,
    sciCompare,
    sciAdd,
    sciSub,
    prestigeTotalFromLifetime,
    cacheCoreMultiplier,
    cacheCoreCost,
    getUpgradeLevel,
    upgradeCost,
    floorToSignificantFigures,
    slotTierBonus,
    slotTierCost,
    slotUnlockCost,
    domainBaseRate,
    tabMultiplier,
    focusMultiplier,
    vaultPumpMultiplier,
    dailyBootMultiplier,
    vaultCap,
    vaultRate,
    activeIncomePerSecond,
    backgroundIncomePerSecond,
    domainIncomeForState,
    dailyFirstOpenBonus,
    dailyFirstOpenBonusForStreak,
    navigationPayoutForLevel,
    wakeBurstForLevel
  });
})(globalThis);
