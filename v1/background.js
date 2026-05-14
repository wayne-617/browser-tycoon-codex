importScripts("game-math.js");

const {
  SCI_ZERO,
  UPGRADE_DEFS,
  SLOT_TIERS,
  SLOT_PRESTIGE_COST_SCALE,
  emptyUpgrades,
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
  slotTierCost,
  slotUnlockCost,
  vaultCap,
  vaultRate,
  domainIncomeForState,
  dailyFirstOpenBonus,
  navigationPayoutForLevel,
  wakeBurstForLevel
} = BrowserTycoonMath;

const ALARM_NAME = "browser-tycoon-accrual";
const MAX_SETTLE_SECONDS = 60 * 60 * 24 * 7;
const WELCOME_BACK_MIN_SECONDS = 60;
const TODAY = () => new Date().toLocaleDateString("en-CA");

function normalizeCurrencyState(sync, local) {
  sync.balance = toSci(sync.balance);
  sync.totalLifetimeEarned = toSci(sync.totalLifetimeEarned);
  for (const entry of Object.values(local.domainLibrary || {})) {
    entry.vaultAmount = toSci(entry.vaultAmount);
    entry.lifetimeEarned = toSci(entry.lifetimeEarned);
  }
}

function defaultSyncState() {
  return {
    balance: 0,
    totalLifetimeEarned: 0,
    cachePoints: 0,
    cpAlreadyClaimedFromLifetime: 0,
    cacheCoreLevel: 0,
    unlockedSlots: 3,
    prestigeCount: 0,
    onboardingComplete: false,
    slots: [1, 2, 3].map((id) => ({
      id,
      tier: 0,
      streakBonusTier: 0,
      assignedDomain: null,
      slotSwapUsedOnDate: null
    })),
    compactDomains: {}
  };
}

function defaultLocalState() {
  return {
    domainLibrary: {},
    presence: {},
    lastAccrualAt: Date.now(),
    lastNavigationBonusAt: {},
    lastPopupSeenAt: 0,
    lastPopupBalance: null,
    pendingWelcomeBack: null
  };
}

async function getState() {
  const [syncRaw, localRaw] = await Promise.all([
    chrome.storage.sync.get(defaultSyncState()),
    chrome.storage.local.get(defaultLocalState())
  ]);
  const sync = { ...defaultSyncState(), ...syncRaw };
  sync.slots = normalizeSlots(sync.slots, sync.unlockedSlots);
  const local = { ...defaultLocalState(), ...localRaw };
  normalizeCurrencyState(sync, local);
  return { sync, local };
}

async function saveState(sync, local) {
  await Promise.all([
    chrome.storage.sync.set({
      balance: sync.balance,
      totalLifetimeEarned: sync.totalLifetimeEarned,
      cachePoints: sync.cachePoints,
      cpAlreadyClaimedFromLifetime: sync.cpAlreadyClaimedFromLifetime,
      cacheCoreLevel: sync.cacheCoreLevel,
      unlockedSlots: sync.unlockedSlots,
      prestigeCount: sync.prestigeCount,
      onboardingComplete: sync.onboardingComplete,
      slots: sync.slots,
      compactDomains: sync.compactDomains
    }),
    chrome.storage.local.set({
      domainLibrary: local.domainLibrary,
      presence: local.presence,
      lastAccrualAt: local.lastAccrualAt,
      lastNavigationBonusAt: local.lastNavigationBonusAt,
      lastPopupSeenAt: local.lastPopupSeenAt,
      lastPopupBalance: local.lastPopupBalance,
      pendingWelcomeBack: local.pendingWelcomeBack
    })
  ]);
}

function normalizeSlots(slots, unlockedSlots) {
  const byId = new Map((slots || []).map((slot) => [slot.id, slot]));
  const normalized = [];
  for (let id = 1; id <= unlockedSlots; id += 1) {
    normalized.push({
      id,
      tier: 0,
      streakBonusTier: 0,
      assignedDomain: null,
      slotSwapUsedOnDate: null,
      ...(byId.get(id) || {})
    });
  }
  return normalized;
}

function normalizeDomainFromUrl(url) {
  try {
    const parsed = new URL(url || "");
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizeDomainInput(input) {
  const value = String(input || "").trim().toLowerCase();
  if (!value) return null;
  const withProtocol = /^[a-z]+:\/\//.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) return null;
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function getDomainEntry(local, domain) {
  if (!local.domainLibrary[domain]) {
    local.domainLibrary[domain] = {
      domain,
      upgrades: emptyUpgrades(),
      vaultAmount: { ...SCI_ZERO },
      vaultLastTickTime: Date.now(),
      lastVisited: 0,
      lifetimeEarned: { ...SCI_ZERO },
      dailyBonusClaimedDate: null,
      insertedOnDate: null,
      currentStreak: 0,
      isSlotted: false,
      slotId: null
    };
  }
  const upgrades = { ...(local.domainLibrary[domain].upgrades || {}) };
  if (!upgrades.dailyBoot && upgrades.windfallBonus) upgrades.dailyBoot = upgrades.windfallBonus;
  delete upgrades.windfallBonus;
  local.domainLibrary[domain].upgrades = { ...emptyUpgrades(), ...upgrades };
  local.domainLibrary[domain].vaultAmount = toSci(local.domainLibrary[domain].vaultAmount);
  local.domainLibrary[domain].lifetimeEarned = toSci(local.domainLibrary[domain].lifetimeEarned);
  return local.domainLibrary[domain];
}

function entryVisitDate(entry) {
  return entry?.lastVisited ? new Date(entry.lastVisited).toLocaleDateString("en-CA") : null;
}

function recordFocusedVisit(entry, now = Date.now()) {
  const today = TODAY();
  if (entryVisitDate(entry) === today) return;
  const yesterday = new Date(now - 86400000).toLocaleDateString("en-CA");
  entry.currentStreak = entryVisitDate(entry) === yesterday ? entry.currentStreak + 1 : 1;
  entry.lastVisited = now;
}

function computeVaultPayout(entry, slot, now, cacheCoreLevel = 0) {
  const stored = Math.min(sciToNumber(entry.vaultAmount), vaultCap(entry, undefined, cacheCoreLevel));
  const daily = entry.dailyBonusClaimedDate === TODAY() || entry.insertedOnDate === TODAY() ? 0 : dailyFirstOpenBonus(entry, slot, cacheCoreLevel);
  return {
    vault: stored,
    daily,
    total: stored + daily
  };
}

function addEarnings(sync, entry, amount) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  sync.balance = sciAdd(sync.balance, amount);
  sync.totalLifetimeEarned = sciAdd(sync.totalLifetimeEarned, amount);
  entry.lifetimeEarned = sciAdd(entry.lifetimeEarned, amount);
}

function welcomeBackEstimate(sync, local, from, to) {
  const elapsedSeconds = Math.min(MAX_SETTLE_SECONDS, Math.max(0, (to - from) / 1000));
  const estimate = {
    focus: { ...SCI_ZERO },
    background: { ...SCI_ZERO },
    total: { ...SCI_ZERO },
    seconds: Math.floor(elapsedSeconds),
    generatedAt: to
  };
  if (elapsedSeconds <= 0) return estimate;
  for (const slot of sync.slots) {
    if (!slot.assignedDomain) continue;
    const domain = slot.assignedDomain;
    const entry = getDomainEntry(local, domain);
    const presence = local.presence[domain];
    if (!presence) continue;
    const state = presence.state;
    if (!["active", "background"].includes(state)) continue;
    const rate = domainIncomeForState(entry, slot, presence, to, sync.cacheCoreLevel);
    const amount = Number.isFinite(rate) ? rate * elapsedSeconds : 0;
    if (amount <= 0) continue;
    const bucket = state === "active" ? "focus" : "background";
    estimate[bucket] = sciAdd(estimate[bucket], amount);
    estimate.total = sciAdd(estimate.total, amount);
  }
  return estimate;
}

function updateWelcomeBack(sync, local, now = Date.now()) {
  if (local.pendingWelcomeBack && sciCompare(local.pendingWelcomeBack.total, 0) > 0) {
    local.lastPopupSeenAt = now;
    if (local.lastPopupBalance) {
      const actualTotal = sciSub(sync.balance, local.lastPopupBalance);
      if (sciCompare(actualTotal, local.pendingWelcomeBack.total) > 0) {
        local.pendingWelcomeBack.total = actualTotal;
      }
    }
    return local.pendingWelcomeBack;
  }
  const lastSeen = Number(local.lastPopupSeenAt || 0);
  const lastBalance = local.lastPopupBalance ? toSci(local.lastPopupBalance) : null;
  local.lastPopupSeenAt = now;
  if (!lastSeen || !lastBalance) {
    local.lastPopupBalance = sync.balance;
    return null;
  }
  const elapsedSeconds = (now - lastSeen) / 1000;
  if (elapsedSeconds < WELCOME_BACK_MIN_SECONDS) {
    local.lastPopupBalance = sync.balance;
    return null;
  }
  const actualTotal = sciSub(sync.balance, lastBalance);
  if (sciCompare(actualTotal, 0) <= 0) {
    local.lastPopupBalance = sync.balance;
    return null;
  }
  const estimate = welcomeBackEstimate(sync, local, lastSeen, now);
  estimate.total = actualTotal;
  local.pendingWelcomeBack = estimate;
  return estimate;
}

function settleAccrual(sync, local, now = Date.now()) {
  const elapsedSeconds = Math.min(MAX_SETTLE_SECONDS, Math.max(0, (now - (local.lastAccrualAt || now)) / 1000));
  if (elapsedSeconds <= 0) {
    local.lastAccrualAt = now;
    return;
  }
  for (const slot of sync.slots) {
    if (!slot.assignedDomain) continue;
    const entry = getDomainEntry(local, slot.assignedDomain);
    const presence = local.presence[slot.assignedDomain];
    const liveRate = domainIncomeForState(entry, slot, presence, now, sync.cacheCoreLevel);
    addEarnings(sync, entry, liveRate * elapsedSeconds);
    const cap = vaultCap(entry, undefined, sync.cacheCoreLevel);
    const currentVault = sciToNumber(entry.vaultAmount);
    const vaultGain = Math.min(cap - currentVault, vaultRate(entry, undefined, sync.cacheCoreLevel) * elapsedSeconds);
    if (vaultGain > 0) {
      entry.vaultAmount = sciAdd(entry.vaultAmount, vaultGain);
      entry.vaultLastTickTime = now;
    }
  }
  local.lastAccrualAt = now;
}

async function rebuildPresence(sync, local) {
  const [tabs, activeTabs] = await Promise.all([
    chrome.tabs.query({}),
    chrome.tabs.query({ active: true, lastFocusedWindow: true })
  ]);
  const foregroundDomain = normalizeDomainFromUrl(activeTabs[0]?.url);
  const domains = {};
  for (const tab of tabs) {
    if (tab.incognito) continue;
    const domain = normalizeDomainFromUrl(tab.url);
    if (!domain) continue;
    domains[domain] ||= { openCount: 0, active: false };
    domains[domain].openCount += 1;
    if (domain === foregroundDomain) domains[domain].active = true;
  }
  const slotted = new Set(sync.slots.map((slot) => slot.assignedDomain).filter(Boolean));
  const now = Date.now();
  const next = {};
  for (const domain of slotted) {
    const old = local.presence[domain];
    const seen = domains[domain];
    const slot = sync.slots.find((item) => item.assignedDomain === domain);
    let state = "closed";
    if (seen?.active) state = "active";
    else if (seen?.openCount > 0) state = "background";
    if (old?.state === "background" && state === "active" && slot) {
      const entry = getDomainEntry(local, domain);
      addEarnings(sync, entry, wakeBurstForLevel(entry, slot, getUpgradeLevel(entry, "wakeBonus"), sync.cacheCoreLevel));
    }
    if (state === "active") recordFocusedVisit(getDomainEntry(local, domain), now);
    next[domain] = {
      state,
      openCount: seen?.openCount || 0,
      backgroundSince: state === "background" ? old?.backgroundSince || now : null,
      updatedAt: now
    };
  }
  local.presence = next;
}

async function settleAndSave({ rebuild = true } = {}) {
  const { sync, local } = await getState();
  if (rebuild) await rebuildPresence(sync, local);
  settleAccrual(sync, local);
  await saveState(sync, local);
  await updateBadge(sync);
  return { sync, local };
}

async function updateBadge(sync) {
  const local = await chrome.storage.local.get(defaultLocalState());
  const cps = Math.max(0, Math.floor(currentIncomePerSecond(sync, local.domainLibrary || {}, local.presence || {})));
  await chrome.action.setBadgeText({ text: formatBadgeIncome(cps) });
}

function formatBadgeIncome(value) {
  if (value <= 0) return "";
  if (value < 1000) return `$${value}`;
  const suffixes = ["K", "M", "B", "T"];
  let amount = value;
  let suffixIndex = -1;
  while (amount >= 1000 && suffixIndex < suffixes.length - 1) {
    amount /= 1000;
    suffixIndex += 1;
  }
  const rounded = amount >= 10 ? Math.floor(amount) : Math.floor(amount * 10) / 10;
  return `${rounded}${suffixes[suffixIndex]}`;
}

function currentIncomePerSecond(sync, library, presence) {
  const incomes = currentSlotIncomes(sync, library, presence);
  return Object.values(incomes).reduce((sum, value) => sum + value, 0);
}

function currentSlotIncomes(sync, library, presence, now = Date.now()) {
  return sync.slots.reduce((incomes, slot) => {
    if (!slot.assignedDomain) return incomes;
    const domain = slot.assignedDomain;
    incomes[domain] = domainIncomeForState(library[domain], slot, presence[domain], now, sync.cacheCoreLevel);
    return incomes;
  }, {});
}

async function getSnapshot() {
  const { sync, local } = await settleAndSave();
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const currentDomain = normalizeDomainFromUrl(activeTab?.url);
  const now = Date.now();
  const welcomeBack = updateWelcomeBack(sync, local, now);
  await saveState(sync, local);
  const slotIncomes = currentSlotIncomes(sync, local.domainLibrary, local.presence, now);
  return {
    sync,
    local,
    upgradeDefs: UPGRADE_DEFS,
    slotTiers: SLOT_TIERS,
    slotPrestigeCostScale: SLOT_PRESTIGE_COST_SCALE,
    cacheCore: {
      level: sync.cacheCoreLevel,
      multiplier: cacheCoreMultiplier(sync.cacheCoreLevel),
      nextMultiplier: cacheCoreMultiplier(sync.cacheCoreLevel + 1),
      nextCost: cacheCoreCost(sync.cacheCoreLevel)
    },
    now,
    slotIncomes,
    welcomeBack,
    incomePerSecond: Object.values(slotIncomes).reduce((sum, value) => sum + value, 0),
    nextSlotCost: slotUnlockCost(sync.unlockedSlots + 1),
    today: TODAY(),
    currentSite: {
      domain: currentDomain,
      valid: Boolean(currentDomain),
      reason: currentDomain ? "" : "Open a normal http or https page first."
    }
  };
}

async function collectWelcomeBack() {
  const { sync, local } = await getState();
  const award = local.pendingWelcomeBack;
  local.pendingWelcomeBack = null;
  local.lastPopupSeenAt = Date.now();
  local.lastPopupBalance = sync.balance;
  await saveState(sync, local);
  return { ok: true, award };
}

function buyUpgrade(sync, local, domain, upgradeId, mode) {
  const def = UPGRADE_DEFS.find((upgrade) => upgrade.id === upgradeId);
  const entry = getDomainEntry(local, domain);
  if (!def || !entry) return { ok: false, error: "Upgrade unavailable." };
  let bought = 0;
  const target = mode === "10" ? 10 : mode === "max" ? 9999 : 1;
  while (bought < target) {
    const level = getUpgradeLevel(entry, upgradeId);
    if (def.maxLevel !== null && level >= def.maxLevel) break;
    const cost = upgradeCost(def, level);
    if (sciCompare(sync.balance, cost) < 0) break;
    sync.balance = sciSub(sync.balance, cost);
    entry.upgrades[upgradeId] = level + 1;
    bought += 1;
  }
  return bought > 0 ? { ok: true, bought } : { ok: false, error: "Not enough cash." };
}

async function addCurrentSite(slotId) {
  const domain = await activeTabDomain();
  if (!domain) return { ok: false, error: "This page cannot be added." };
  return assignDomainToSlot(slotId, domain, { fromCurrentSite: true });
}

async function activeTabDomain() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return normalizeDomainFromUrl(tab?.url);
}

async function assignDomainToSlot(slotId, domain, options = {}) {
  domain = normalizeDomainInput(domain);
  if (!domain) return { ok: false, error: "Enter a valid website domain." };
  const { sync, local } = await settleAndSave();
  const slot = sync.slots.find((item) => item.id === slotId);
  if (!slot) return { ok: false, error: "Slot unavailable." };
  const existingSlot = sync.slots.find((item) => item.assignedDomain === domain);
  if (existingSlot && existingSlot.id !== slotId) {
    return { ok: false, error: `${domain} is already in slot ${existingSlot.id}.` };
  }
  const entry = getDomainEntry(local, domain);
  const incomingWasSlotted = Boolean(existingSlot);
  if (slot.assignedDomain && slot.assignedDomain !== domain && !incomingWasSlotted) {
    const today = TODAY();
    if (slot.slotSwapUsedOnDate === today) return { ok: false, error: "This slot already used today's library swap." };
    const outgoing = getDomainEntry(local, slot.assignedDomain);
    outgoing.isSlotted = false;
    outgoing.slotId = null;
    outgoing.vaultAmount = { ...SCI_ZERO };
    outgoing.currentStreak = 0;
    slot.slotSwapUsedOnDate = today;
    entry.vaultAmount = { ...SCI_ZERO };
    entry.insertedOnDate = today;
  }
  slot.assignedDomain = domain;
  entry.isSlotted = true;
  entry.slotId = slot.id;
  if (options.fromCurrentSite) {
    const activeDomain = normalizeDomainInput(options.currentDomain) || await activeTabDomain();
    if (activeDomain === domain) recordFocusedVisit(entry);
  }
  await rebuildPresence(sync, local);
  await saveState(sync, local);
  return { ok: true };
}

async function swapSlots(fromSlotId, toSlotId) {
  const { sync, local } = await settleAndSave();
  const from = sync.slots.find((slot) => slot.id === fromSlotId);
  const to = sync.slots.find((slot) => slot.id === toSlotId);
  if (!from || !to) return { ok: false, error: "Slot unavailable." };
  [from.assignedDomain, to.assignedDomain] = [to.assignedDomain, from.assignedDomain];
  for (const slot of [from, to]) {
    if (!slot.assignedDomain) continue;
    const entry = getDomainEntry(local, slot.assignedDomain);
    entry.isSlotted = true;
    entry.slotId = slot.id;
  }
  await saveState(sync, local);
  return { ok: true };
}

async function removeDomain(slotId) {
  const { sync, local } = await settleAndSave();
  const slot = sync.slots.find((item) => item.id === slotId);
  if (!slot?.assignedDomain) return { ok: false, error: "Slot is empty." };
  const entry = getDomainEntry(local, slot.assignedDomain);
  entry.isSlotted = false;
  entry.slotId = null;
  entry.currentStreak = 0;
  entry.vaultAmount = { ...SCI_ZERO };
  slot.assignedDomain = null;
  await saveState(sync, local);
  return { ok: true };
}

async function claimRevisit(domain) {
  const { sync, local } = await settleAndSave();
  const slot = sync.slots.find((item) => item.assignedDomain === domain);
  if (!slot) return { ok: false, error: "Domain is not slotted." };
  const entry = getDomainEntry(local, domain);
  const payout = computeVaultPayout(entry, slot, Date.now(), sync.cacheCoreLevel);
  if (payout.total <= 0) return { ok: false, error: "Nothing ready to claim yet.", payout };
  entry.dailyBonusClaimedDate = TODAY();
  entry.vaultAmount = { ...SCI_ZERO };
  addEarnings(sync, entry, payout.total);
  await saveState(sync, local);
  return { ok: true, payout };
}

async function unlockNextSlot() {
  const { sync, local } = await settleAndSave();
  const nextId = sync.unlockedSlots + 1;
  const cost = slotUnlockCost(nextId);
  if (sciCompare(sync.balance, cost) < 0) return { ok: false, error: "Not enough cash." };
  sync.balance = sciSub(sync.balance, cost);
  sync.unlockedSlots = nextId;
  sync.slots = normalizeSlots(sync.slots, sync.unlockedSlots);
  await saveState(sync, local);
  return { ok: true };
}

async function upgradeSlotTier(slotId) {
  const { sync, local } = await settleAndSave();
  const slot = sync.slots.find((item) => item.id === slotId);
  if (!slot || slot.tier >= 5) return { ok: false, error: "Slot tier is maxed." };
  const next = SLOT_TIERS.find((tier) => tier.tier === slot.tier + 1);
  const cost = slotTierCost(slot.id, next.tier);
  if (sync.cachePoints < cost) return { ok: false, error: "Not enough CP." };
  sync.cachePoints -= cost;
  slot.tier += 1;
  await saveState(sync, local);
  return { ok: true };
}

async function upgradeCacheCore() {
  const { sync, local } = await settleAndSave();
  const cost = cacheCoreCost(sync.cacheCoreLevel);
  if (sync.cachePoints < cost) return { ok: false, error: "Not enough CP." };
  sync.cachePoints -= cost;
  sync.cacheCoreLevel += 1;
  await saveState(sync, local);
  return {
    ok: true,
    level: sync.cacheCoreLevel,
    cost,
    multiplier: cacheCoreMultiplier(sync.cacheCoreLevel)
  };
}

async function clearCachePrestige() {
  const { sync, local } = await settleAndSave();
  const cpTotal = prestigeTotalFromLifetime(sync.totalLifetimeEarned);
  const award = Math.max(0, cpTotal - sync.cpAlreadyClaimedFromLifetime);
  sync.cachePoints += award;
  sync.cpAlreadyClaimedFromLifetime = cpTotal;
  sync.balance = { ...SCI_ZERO };
  sync.prestigeCount += 1;
  for (const domain of Object.keys(local.domainLibrary)) {
    const entry = local.domainLibrary[domain];
    entry.upgrades = emptyUpgrades();
    entry.vaultAmount = { ...SCI_ZERO };
    entry.dailyBonusClaimedDate = null;
    entry.currentStreak = 0;
  }
  const highestPersistentSlot = sync.slots.reduce((highest, slot) => {
    return slot.id <= 3 || slot.tier > 0 ? Math.max(highest, slot.id) : highest;
  }, 3);
  sync.unlockedSlots = Math.max(3, highestPersistentSlot);
  sync.slots = normalizeSlots(sync.slots, sync.unlockedSlots);
  await saveState(sync, local);
  return { ok: true, award };
}

async function devAddCash(amount = 1000) {
  const { sync, local } = await settleAndSave();
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, error: "Invalid cash amount." };
  sync.balance = sciAdd(sync.balance, value);
  sync.totalLifetimeEarned = sciAdd(sync.totalLifetimeEarned, value);
  await saveState(sync, local);
  return { ok: true, amount: value };
}

async function devAddCachePoints(amount = 10) {
  const { sync, local } = await settleAndSave();
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, error: "Invalid CP amount." };
  sync.cachePoints += value;
  await saveState(sync, local);
  return { ok: true, amount: value };
}

async function devResetCashAndCachePoints() {
  const { sync, local } = await settleAndSave();
  sync.balance = { ...SCI_ZERO };
  sync.cachePoints = 0;
  await saveState(sync, local);
  return { ok: true };
}

async function navigationBonus(details) {
  if (details.frameId !== 0) return;
  const domain = normalizeDomainFromUrl(details.url);
  if (!domain) return;
  const { sync, local } = await settleAndSave();
  const slot = sync.slots.find((item) => item.assignedDomain === domain);
  if (!slot) return;
  const entry = getDomainEntry(local, domain);
  const level = getUpgradeLevel(entry, "navigationBonus");
  if (level <= 0) {
    await saveState(sync, local);
    return;
  }
  const now = Date.now();
  const last = local.lastNavigationBonusAt[domain] || 0;
  if (now - last < 15000) {
    await saveState(sync, local);
    return;
  }
  const amount = navigationPayoutForLevel(entry, slot, level, sync.cacheCoreLevel);
  local.lastNavigationBonusAt[domain] = now;
  addEarnings(sync, entry, amount);
  await saveState(sync, local);
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  await settleAndSave();
});

chrome.runtime.onStartup.addListener(() => settleAndSave());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) settleAndSave();
});
chrome.tabs.onActivated.addListener(() => settleAndSave());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === "complete") settleAndSave();
});
chrome.tabs.onRemoved.addListener(() => settleAndSave());
chrome.webNavigation.onCommitted.addListener(navigationBonus);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === "snapshot") return getSnapshot();
      if (message.type === "addCurrentSite") return addCurrentSite(message.slotId);
      if (message.type === "assignDomain") return assignDomainToSlot(message.slotId, message.domain, {
        fromCurrentSite: Boolean(message.fromCurrentSite),
        currentDomain: message.currentDomain
      });
      if (message.type === "swapSlots") return swapSlots(message.fromSlotId, message.toSlotId);
      if (message.type === "removeDomain") return removeDomain(message.slotId);
      if (message.type === "buyUpgrade") {
        const { sync, local } = await settleAndSave();
        const result = buyUpgrade(sync, local, message.domain, message.upgradeId, message.mode);
        await saveState(sync, local);
        return result;
      }
      if (message.type === "claimRevisit") return claimRevisit(message.domain);
      if (message.type === "collectWelcomeBack") return collectWelcomeBack();
      if (message.type === "unlockSlot") return unlockNextSlot();
      if (message.type === "upgradeSlotTier") return upgradeSlotTier(message.slotId);
      if (message.type === "upgradeCacheCore") return upgradeCacheCore();
      if (message.type === "prestige") return clearCachePrestige();
      if (message.type === "devAddCash") return devAddCash(message.amount);
      if (message.type === "devAddCachePoints") return devAddCachePoints(message.amount);
      if (message.type === "devResetCashAndCachePoints") return devResetCashAndCachePoints();
      if (message.type === "completeOnboarding") {
        const { sync, local } = await getState();
        sync.onboardingComplete = true;
        await saveState(sync, local);
        return { ok: true };
      }
      return { ok: false, error: "Unknown action." };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  })().then(sendResponse);
  return true;
});
