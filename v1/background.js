const BASE_RATE = 0.25;
const VAULT_RATE = BASE_RATE * 0.02;
const TRAFFIC_ENGINE_MULTIPLIER = 1.2;
const PRESTIGE_DIVISOR = 1000000;
const ALARM_NAME = "browser-tycoon-accrual";
const MAX_SETTLE_SECONDS = 60 * 60 * 24 * 7;
const TODAY = () => new Date().toLocaleDateString("en-CA");
const SCI_ZERO = Object.freeze({ m: 0, e: 0 });

const UPGRADE_DEFS = [
  { id: "tabMultiplier", name: "Tab Multiplier", category: "active", baseCost: 25, growth: 1.6, maxLevel: null },
  { id: "focusBonus", name: "Focus Bonus", category: "active", baseCost: 25, growth: 1.55, maxLevel: null },
  { id: "navigationBonus", name: "Navigation Bonus", category: "active", baseCost: 35, growth: 1.6, maxLevel: null },
  { id: "coldStorage", name: "Cold Storage", category: "vault", baseCost: 60, growth: 1.55, maxLevel: null },
  { id: "storageDuration", name: "Vault Pump", category: "vault", baseCost: 75, growth: 1.55, maxLevel: null },
  { id: "trafficEngine", name: "Traffic Engine", category: "active", baseCost: 25, growth: 1.5, maxLevel: null },
  { id: "dailyBoot", name: "Daily Boot", category: "vault", baseCost: 80, growth: 1.6, maxLevel: null },
  { id: "backgroundHum", name: "Background Hum", category: "background", baseCost: 40, growth: 1.55, maxLevel: null },
  { id: "idleDepth", name: "Idle Depth", category: "background", baseCost: 90, growth: 1.75, maxLevel: null },
  { id: "wakeBonus", name: "Wake Bonus", category: "background", baseCost: 110, growth: 1.6, maxLevel: null }
];

const SLOT_TIERS = [
  { tier: 0, cpCost: 0, bonus: 1 },
  { tier: 1, cpCost: 1, bonus: 1.1 },
  { tier: 2, cpCost: 3, bonus: 1.25 },
  { tier: 3, cpCost: 8, bonus: 1.5 },
  { tier: 4, cpCost: 20, bonus: 2 },
  { tier: 5, cpCost: 50, bonus: 3 }
];
const SLOT_PRESTIGE_COST_SCALE = 1.5;

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

function sciMulNumber(a, factor) {
  return normalizeSci(toSci(a).m * Number(factor || 0), toSci(a).e);
}

function sciMin(a, b) {
  return sciCompare(a, b) <= 0 ? toSci(a) : toSci(b);
}

function prestigeTotalFromLifetime(lifetime) {
  const sci = toSci(lifetime);
  if (sci.m === 0) return 0;
  let mantissa = sci.m;
  let exponent = sci.e - 6;
  if (exponent % 2 !== 0) {
    mantissa *= 10;
    exponent -= 1;
  }
  const cp = Math.sqrt(mantissa) * Math.pow(10, exponent / 2);
  if (!Number.isFinite(cp)) return Number.MAX_SAFE_INTEGER;
  return Math.floor(Math.min(cp, Number.MAX_SAFE_INTEGER));
}

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
    lastNavigationBonusAt: {}
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
      lastNavigationBonusAt: local.lastNavigationBonusAt
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
  return SLOT_TIERS.find((tier) => tier.tier === slot.tier)?.bonus || 1;
}

function slotTierCost(slotId, tier) {
  const baseCost = SLOT_TIERS.find((item) => item.tier === tier)?.cpCost;
  if (!Number.isFinite(baseCost)) return Infinity;
  const slotScale = Math.pow(SLOT_PRESTIGE_COST_SCALE, Math.max(0, Number(slotId) - 3));
  return Math.ceil(baseCost * slotScale);
}

function slotUnlockCost(slotNumber) {
  if (slotNumber <= 3) return 0;
  if (slotNumber === 4) return 500;
  return floorToSignificantFigures(500 * Math.pow(5, Math.pow(slotNumber - 3.75, 1.35)));
}

function vaultCap(entry) {
  const cold = getUpgradeLevel(entry, "coldStorage");
  const trafficScale = Math.sqrt(domainBaseRate(entry) / BASE_RATE);
  const baseCap = BASE_RATE * 60 * 25 * trafficScale;
  return baseCap * Math.pow(1.32, cold);
}

function vaultRate(entry) {
  const trafficScale = Math.sqrt(domainBaseRate(entry) / BASE_RATE);
  return VAULT_RATE * trafficScale * Math.pow(1.3, getUpgradeLevel(entry, "storageDuration"));
}

function domainBaseRate(entry) {
  return BASE_RATE * Math.pow(TRAFFIC_ENGINE_MULTIPLIER, getUpgradeLevel(entry, "trafficEngine"));
}

function activeIncomePerSecond(entry, slot) {
  const tab = 1 + 0.15 * getUpgradeLevel(entry, "tabMultiplier");
  const focusLevel = getUpgradeLevel(entry, "focusBonus");
  const focus = 1 + 0.35 * focusLevel + 0.01 * Math.pow(focusLevel, 1.2);
  return domainBaseRate(entry) * tab * focus * slotTierBonus(slot);
}

function backgroundIncomePerSecond(entry, slot, backgroundSince, now) {
  const hum = 0.08 * getUpgradeLevel(entry, "backgroundHum");
  if (hum <= 0) return 0;
  const idleLevel = getUpgradeLevel(entry, "idleDepth");
  const idleSeconds = Math.max(0, (now - (backgroundSince || now)) / 1000);
  const idle = 1 + 0.1 * idleLevel * Math.min(idleSeconds / 300, 5);
  const tab = 1 + 0.15 * getUpgradeLevel(entry, "tabMultiplier");
  return domainBaseRate(entry) * tab * hum * idle * slotTierBonus(slot);
}

function domainIncomeForState(entry, slot, presence, now) {
  if (!presence) return 0;
  if (presence.state === "active") return activeIncomePerSecond(entry, slot);
  if (presence.state === "background") return backgroundIncomePerSecond(entry, slot, presence.backgroundSince, now);
  return 0;
}

function dailyFirstOpenBonus(entry, slot) {
  const dailyBoot = getUpgradeLevel(entry, "dailyBoot");
  const slotStreak = slot?.streakBonusTier || 0;
  const baseDaily = Math.max(20, domainBaseRate(entry) * 60 * 35);
  const bootMultiplier = 1 + 0.18 * Math.pow(dailyBoot, 0.95);
  const streakMultiplier = 1 + Math.min(entry.currentStreak, 14) * 0.04;
  return baseDaily * bootMultiplier * streakMultiplier * (1 + slotStreak * 0.15);
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

function computeVaultPayout(entry, slot, now) {
  const stored = Math.min(sciToNumber(entry.vaultAmount), vaultCap(entry));
  const daily = entry.dailyBonusClaimedDate === TODAY() || entry.insertedOnDate === TODAY() ? 0 : dailyFirstOpenBonus(entry, slot);
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
    const liveRate = domainIncomeForState(entry, slot, presence, now);
    addEarnings(sync, entry, liveRate * elapsedSeconds);
    const cap = vaultCap(entry);
    const currentVault = sciToNumber(entry.vaultAmount);
    const vaultGain = Math.min(cap - currentVault, vaultRate(entry) * elapsedSeconds);
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
      addEarnings(sync, entry, domainBaseRate(entry) * 65 * Math.pow(getUpgradeLevel(entry, "wakeBonus"), 1.1) * slotTierBonus(slot));
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
    incomes[domain] = domainIncomeForState(library[domain], slot, presence[domain], now);
    return incomes;
  }, {});
}

async function getSnapshot() {
  const { sync, local } = await settleAndSave();
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const currentDomain = normalizeDomainFromUrl(activeTab?.url);
  const now = Date.now();
  const slotIncomes = currentSlotIncomes(sync, local.domainLibrary, local.presence, now);
  return {
    sync,
    local,
    upgradeDefs: UPGRADE_DEFS,
    slotTiers: SLOT_TIERS,
    slotPrestigeCostScale: SLOT_PRESTIGE_COST_SCALE,
    now,
    slotIncomes,
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
  const payout = computeVaultPayout(entry, slot, Date.now());
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
  const amount = dailyFirstOpenBonus(entry, slot) * 0.13 * (1 + 0.18 * level);
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
      if (message.type === "unlockSlot") return unlockNextSlot();
      if (message.type === "upgradeSlotTier") return upgradeSlotTier(message.slotId);
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
