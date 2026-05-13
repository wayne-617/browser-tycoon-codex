class GameMath {
  static BASE_RATE = 0.10;
  static VAULT_RATE = 0.05;
  static PRESTIGE_DIVISOR = 1000000;
  static NAVIGATION_COOLDOWN_MS = 15000;

  static upgrades = {
    tabMultiplier: { id: 'tabMultiplier', name: 'Tab Multiplier', desc: '+15% live income', effectText: lvl => `+${lvl * 15}% live`, baseCost: 25, growthRate: 1.6, category: 'Active Income', maxLevel: null, icon: 'Icon14_02.png' },
    focusBonus: { id: 'focusBonus', name: 'Focus Bonus', desc: '+20% when focused', effectText: lvl => `+${lvl * 20}% focus`, baseCost: 40, growthRate: 1.7, category: 'Active Income', maxLevel: null, icon: 'Icon14_05.png' },
    navigationBonus: { id: 'navigationBonus', name: 'Navigation Bonus', desc: 'Small payout on in-domain navigation', effectText: lvl => `${lvl} bonus levels`, baseCost: 35, growthRate: 1.6, category: 'Active Income', maxLevel: null, icon: 'Icon14_06.png' },
    coldStorage: { id: 'coldStorage', name: 'Cold Storage', desc: 'Raises vault cap', effectText: lvl => `+${lvl * 100}% cap`, baseCost: 60, growthRate: 1.6, category: 'Vault Storage', maxLevel: null, icon: 'Icon14_07.png' },
    storageDuration: { id: 'storageDuration', name: 'Storage Duration', desc: 'Extends vault fill duration', effectText: lvl => `+${lvl * 60} min fill`, baseCost: 100, growthRate: 1.7, category: 'Vault Storage', maxLevel: null, icon: 'Icon14_08.png' },
    compoundInterest: { id: 'compoundInterest', name: 'Compound Interest', desc: 'Vault grows while closed', effectText: lvl => `${(lvl * 0.2).toFixed(1)}% / min`, baseCost: 200, growthRate: 2.0, category: 'Vault Storage', maxLevel: 5, icon: 'Icon14_09.png' },
    windfallBonus: { id: 'windfallBonus', name: 'Windfall Bonus', desc: 'Daily revisit burst', effectText: lvl => `${lvl}x windfall`, baseCost: 250, growthRate: 2.0, category: 'Vault Storage', maxLevel: null, icon: 'Icon14_10.png' },
    backgroundHum: { id: 'backgroundHum', name: 'Background Hum', desc: 'Earn while background-open', effectText: lvl => `${lvl * 5}% active rate`, baseCost: 50, growthRate: 1.6, category: 'Background Behavior', maxLevel: null, icon: 'Icon14_11.png' },
    idleDepth: { id: 'idleDepth', name: 'Idle Depth', desc: 'Background rate grows over time', effectText: lvl => `up to +${lvl * 50}% background`, baseCost: 90, growthRate: 1.8, category: 'Background Behavior', maxLevel: null, icon: 'Icon14_12.png' },
    wakeBonus: { id: 'wakeBonus', name: 'Wake Bonus', desc: 'Burst when background becomes focused', effectText: lvl => `${lvl * 30}s base burst`, baseCost: 150, growthRate: 2.0, category: 'Background Behavior', maxLevel: null, icon: 'Icon14_13.png' }
  };

  static calculateUpgradeCost(upgradeId, currentLevel, quantity = 1) {
    const upg = this.upgrades[upgradeId];
    if (!upg || quantity <= 0) return Infinity;
    if (quantity === 1) return upg.baseCost * Math.pow(upg.growthRate, currentLevel);
    return upg.baseCost * Math.pow(upg.growthRate, currentLevel) * ((Math.pow(upg.growthRate, quantity) - 1) / (upg.growthRate - 1));
  }

  static maxAffordableLevels(upgradeId, currentLevel, balance) {
    const upg = this.upgrades[upgradeId];
    if (!upg) return 0;
    let levels = 0;
    let spent = 0;
    while (levels < 1000) {
      if (upg.maxLevel !== null && currentLevel + levels >= upg.maxLevel) break;
      const next = this.calculateUpgradeCost(upgradeId, currentLevel + levels);
      if (spent + next > balance) break;
      spent += next;
      levels += 1;
    }
    return levels;
  }

  static calculateSlotUnlockCost(slotIndex) {
    if (slotIndex <= 3) return 0;
    return 500 * Math.pow(5, slotIndex - 4);
  }

  static calculatePrestigeCost(nextTier) {
    return [0, 1, 3, 8, 20, 50][nextTier] || Infinity;
  }

  static calculatePrestigeAward(totalLifetimeEarned, cpAlreadyClaimed) {
    return Math.max(0, Math.floor(Math.sqrt(totalLifetimeEarned / this.PRESTIGE_DIVISOR)) - cpAlreadyClaimed);
  }

  static slotTierMultiplier(tier) {
    return [1, 1.10, 1.25, 1.50, 2.00, 3.00][tier] || 1;
  }

  static liveBaseIncome(domainData, slot) {
    const tabLvl = domainData.upgrades?.tabMultiplier || 0;
    return this.BASE_RATE * (1 + 0.15 * tabLvl) * this.slotTierMultiplier(slot.tier || 0);
  }

  static calculateIncomePerSec(domainData, slot, presence = { state: 'closed' }, at = Date.now()) {
    if (!domainData || !slot || presence.state === 'closed') return 0;
    const base = this.liveBaseIncome(domainData, slot);
    if (presence.state === 'active') {
      return base * (1 + 0.20 * (domainData.upgrades?.focusBonus || 0));
    }
    const bgLvl = domainData.upgrades?.backgroundHum || 0;
    if (bgLvl <= 0) return 0;
    const idleLvl = domainData.upgrades?.idleDepth || 0;
    const backgroundSince = presence.backgroundSince || presence.updatedAt || at;
    const idleSeconds = Math.max(0, (at - backgroundSince) / 1000);
    const humPct = 0.05 * bgLvl;
    const depth = 1 + 0.1 * idleLvl * Math.min(idleSeconds / 300, 5);
    return base * humPct * depth;
  }

  static getVaultCap(domainData) {
    const coldLvl = domainData.upgrades?.coldStorage || 0;
    const durationLvl = domainData.upgrades?.storageDuration || 0;
    const baseCap = this.VAULT_RATE * 3600;
    return baseCap * (1 + coldLvl) * (1 + 0.5 * durationLvl);
  }

  static calculateVaultAccrual(domainData, elapsedSec) {
    const cap = this.getVaultCap(domainData);
    const current = Math.min(cap, domainData.vaultAmount || 0);
    if (current >= cap) return current;
    const durationLvl = domainData.upgrades?.storageDuration || 0;
    const effectiveElapsed = Math.min(elapsedSec, 3600 * (1 + durationLvl));
    let next = Math.min(cap, current + this.VAULT_RATE * effectiveElapsed);
    const ciLvl = Math.min(5, domainData.upgrades?.compoundInterest || 0);
    if (ciLvl > 0 && next > 0) {
      const minutes = effectiveElapsed / 60;
      next = Math.min(cap, next * Math.pow(1 + 0.002 * ciLvl, minutes));
    }
    return next;
  }

  static calculateDailyFirstOpenBonus(domainData, slot) {
    const windfallLvl = domainData.upgrades?.windfallBonus || 0;
    const streakTier = slot.streakBonusTier || 0;
    const streakMultiplier = 1 + 0.05 * (domainData.currentStreak || 0) * (1 + streakTier);
    return this.BASE_RATE * 300 * (1 + windfallLvl) * streakMultiplier;
  }

  static calculateNavigationBonus(domainData, slot) {
    const lvl = domainData.upgrades?.navigationBonus || 0;
    if (lvl <= 0) return 0;
    return this.calculateDailyFirstOpenBonus(domainData, slot) * 0.10 * (1 + 0.15 * lvl);
  }

  static calculateWakeBonus(domainData) {
    const lvl = domainData.upgrades?.wakeBonus || 0;
    return lvl > 0 ? this.BASE_RATE * 30 * lvl : 0;
  }

  static formatMoney(amount) {
    const value = Number(amount || 0);
    if (value < 1000) return `$${value.toFixed(value < 100 ? 2 : 0)}`;
    const suffixes = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
    const i = Math.min(suffixes.length - 1, Math.floor(Math.log10(value) / 3));
    return `$${(value / Math.pow(1000, i)).toFixed(2).replace(/\.00$/, '')}${suffixes[i]}`;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GameMath;
}
if (typeof window !== 'undefined') {
  window.GameMath = GameMath;
}
