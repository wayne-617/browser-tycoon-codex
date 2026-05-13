class StorageManager {
  static todayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  static defaultSyncState() {
    return {
      balance: 0,
      totalLifetimeEarned: 0,
      cachePoints: 0,
      cpAlreadyClaimedFromLifetime: 0,
      unlockedSlots: 3,
      prestigeCount: 0,
      slots: [
        { id: 1, tier: 0, streakBonusTier: 0, assignedDomain: null, slotSwapUsedOnDate: null },
        { id: 2, tier: 0, streakBonusTier: 0, assignedDomain: null, slotSwapUsedOnDate: null },
        { id: 3, tier: 0, streakBonusTier: 0, assignedDomain: null, slotSwapUsedOnDate: null }
      ]
    };
  }

  static defaultLocalState() {
    return {
      domainLibrary: {},
      lastAccrualAt: Date.now(),
      presenceSnapshot: {},
      tutorialCompleted: false
    };
  }

  static migrateSyncState(raw) {
    const sync = { ...this.defaultSyncState(), ...(raw || {}) };
    if (typeof sync.totalLifetimeEarned !== 'number') {
      sync.totalLifetimeEarned = Number(sync.totalEarned || 0);
    }
    delete sync.totalEarned;
    sync.balance = Number(sync.balance || 0);
    sync.cachePoints = Number(sync.cachePoints || 0);
    sync.cpAlreadyClaimedFromLifetime = Number(sync.cpAlreadyClaimedFromLifetime || 0);
    sync.unlockedSlots = Math.max(3, Number(sync.unlockedSlots || 3));
    sync.prestigeCount = Number(sync.prestigeCount || 0);

    const slots = Array.isArray(sync.slots) ? sync.slots : [];
    sync.slots = [];
    for (let i = 1; i <= sync.unlockedSlots; i += 1) {
      const existing = slots.find(slot => Number(slot.id) === i) || {};
      sync.slots.push({
        id: i,
        tier: Math.max(0, Math.min(5, Number(existing.tier || 0))),
        streakBonusTier: Number(existing.streakBonusTier || 0),
        assignedDomain: existing.assignedDomain || null,
        slotSwapUsedOnDate: existing.slotSwapUsedOnDate || null
      });
    }
    return sync;
  }

  static migrateDomain(domain, raw = {}) {
    return {
      domain,
      upgrades: raw.upgrades || {},
      vaultAmount: Number(raw.vaultAmount || 0),
      vaultLastTickTime: Number(raw.vaultLastTickTime || Date.now()),
      lastVisited: Number(raw.lastVisited || 0),
      lifetimeEarned: Number(raw.lifetimeEarned || 0),
      dailyBonusClaimedDate: raw.dailyBonusClaimedDate || null,
      insertedOnDate: raw.insertedOnDate || null,
      currentStreak: Number(raw.currentStreak || 0),
      isSlotted: Boolean(raw.isSlotted),
      slotId: raw.slotId || null
    };
  }

  static migrateLocalState(raw, sync) {
    const local = { ...this.defaultLocalState(), ...(raw || {}) };
    local.domainLibrary = local.domainLibrary || {};
    for (const domain of Object.keys(local.domainLibrary)) {
      local.domainLibrary[domain] = this.migrateDomain(domain, local.domainLibrary[domain]);
    }
    local.lastAccrualAt = Number(local.lastAccrualAt || local.lastTickTime || Date.now());
    delete local.lastTickTime;
    local.presenceSnapshot = local.presenceSnapshot || {};
    local.tutorialCompleted = Boolean(local.tutorialCompleted);

    const slotted = new Map(sync.slots.filter(slot => slot.assignedDomain).map(slot => [slot.assignedDomain, slot.id]));
    for (const [domain, entry] of Object.entries(local.domainLibrary)) {
      entry.isSlotted = slotted.has(domain);
      entry.slotId = slotted.get(domain) || null;
    }
    return local;
  }

  static async getGameState() {
    const [syncData, localData] = await Promise.all([
      chrome.storage.sync.get('syncState'),
      chrome.storage.local.get('localState')
    ]);
    const sync = this.migrateSyncState(syncData.syncState);
    const local = this.migrateLocalState(localData.localState, sync);
    return { sync, local };
  }

  static async saveSyncState(syncState) {
    await chrome.storage.sync.set({ syncState: this.migrateSyncState(syncState) });
  }

  static async saveLocalState(localState) {
    await chrome.storage.local.set({ localState });
  }

  static normalizeDomain(input) {
    if (!input) return null;
    try {
      const value = input.includes('://') ? input : `https://${input}`;
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) return null;
      return url.hostname.toLowerCase().replace(/^www\./, '');
    } catch (e) {
      return null;
    }
  }

  static domainFromUrl(url) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return null;
      return parsed.hostname.toLowerCase().replace(/^www\./, '');
    } catch (e) {
      return null;
    }
  }

  static ensureDomain(localState, domain) {
    if (!localState.domainLibrary[domain]) {
      localState.domainLibrary[domain] = this.migrateDomain(domain, {
        lastVisited: 0,
        vaultLastTickTime: Date.now()
      });
    }
    return localState.domainLibrary[domain];
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StorageManager;
}
if (typeof window !== 'undefined') {
  window.StorageManager = StorageManager;
}
