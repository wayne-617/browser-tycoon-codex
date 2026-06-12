importScripts("ExtPay.js", "game-math.js");

const {
  SCI_ZERO,
  UPGRADE_DEFS,
  SLOT_TIERS,
  SLOT_PRESTIGE_COST_SCALE,
  FIRST_PRESTIGE_LIFETIME_REQUIREMENT,
  SUPPORTER_CORE_MULTIPLIER,
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

const EXTPAY_EXTENSION_ID = "browser-tycoon";
const SUPPORTER_CORE_PLAN = "supporter-core";
const PREMIUM_STATUS_MAX_AGE_MS = 10 * 60 * 1000;
const ALARM_NAME = "browser-tycoon-accrual";
const NOTIFICATION_ALARM_NAME = "browser-tycoon-notifications";
const MAX_SETTLE_SECONDS = 60 * 60 * 24 * 7;
const WELCOME_BACK_MIN_SECONDS = 60;
const EVENT_BONUS_COOLDOWN_MS = 60 * 1000;
const ONBOARDING_STARTER_CASH = 1000;
const DOMAIN_LIBRARY_LIMIT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const NOTIFICATION_IDS = {
  vaultFull: "browser-tycoon:vault-full",
  bigPayout: "browser-tycoon:big-payout",
  streakRisk: "browser-tycoon:streak-risk"
};
const CLOUD_SAVE_KEY = "cloudSave";
const CLOUD_SAVE_META_KEY = "cloudSaveMeta";
const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  enabled: false,
  vaultFull: true,
  bigPayout: true,
  streakRisk: true
});

function makeExtPay() {
  return typeof ExtPay === "function" ? ExtPay(EXTPAY_EXTENSION_ID) : null;
}

const extpay = makeExtPay();
if (extpay?.startBackground) extpay.startBackground();

function localDateKey(time = Date.now()) {
  return new Date(time).toLocaleDateString("en-CA");
}

const TODAY = () => localDateKey();

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
    cacheCredits: 0,
    ccAlreadyClaimedFromLifetime: 0,
    cacheCoreLevel: 0,
    unlockedSlots: 3,
    prestigeCount: 0,
    onboardingComplete: false,
    onboardingStep: "intro",
    onboardingStarterCashClaimed: false,
    notificationSettings: null,
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
    premiumStatus: {
      supporterCorePaid: false,
      email: null,
      paidAt: null,
      checkedAt: 0,
      error: null
    },
    lastAccrualAt: Date.now(),
    lastNavigationBonusAt: {},
    lastWakeBonusAt: {},
    lastPopupSeenAt: 0,
    lastPopupBalance: null,
    pendingWelcomeBack: null,
    gameSync: null,
    notificationState: {
      vaultFullNotified: false,
      lastBigPayoutCheckAt: 0,
      lastBigPayoutNotificationAt: 0,
      lastStreakRiskDate: null
    }
  };
}

function normalizeNotificationSettings(settings, onboardingComplete = false) {
  if (!settings || typeof settings !== "object") {
    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      enabled: Boolean(onboardingComplete)
    };
  }
  const anyTypeEnabled = settings.vaultFull !== false || settings.bigPayout !== false || settings.streakRisk !== false;
  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...settings,
    enabled: anyTypeEnabled,
    vaultFull: settings.vaultFull !== false,
    bigPayout: settings.bigPayout !== false,
    streakRisk: settings.streakRisk !== false
  };
}

function normalizeNotificationState(state) {
  return {
    vaultFullNotified: Boolean(state?.vaultFullNotified),
    lastBigPayoutCheckAt: Number(state?.lastBigPayoutCheckAt || 0),
    lastBigPayoutNotificationAt: Number(state?.lastBigPayoutNotificationAt || 0),
    lastStreakRiskDate: state?.lastStreakRiskDate || null
  };
}

async function getState() {
  const syncRequest = {
    ...defaultSyncState(),
    cachePoints: null,
    cpAlreadyClaimedFromLifetime: null
  };
  const [syncRaw, localRaw] = await Promise.all([
    chrome.storage.sync.get(syncRequest),
    chrome.storage.local.get(defaultLocalState())
  ]);
  const local = { ...defaultLocalState(), ...localRaw };
  const gameRaw = localRaw.gameSync && typeof localRaw.gameSync === "object" ? localRaw.gameSync : syncRaw;
  const sync = { ...defaultSyncState(), ...gameRaw };
  if (!localRaw.gameSync && syncRaw.cachePoints != null && syncRaw.cacheCredits == null) sync.cacheCredits = syncRaw.cachePoints;
  if (!localRaw.gameSync && syncRaw.cpAlreadyClaimedFromLifetime != null && syncRaw.ccAlreadyClaimedFromLifetime == null) {
    sync.ccAlreadyClaimedFromLifetime = syncRaw.cpAlreadyClaimedFromLifetime;
  }
  if (!Number.isFinite(sync.cacheCredits)) sync.cacheCredits = 0;
  if (!Number.isFinite(sync.ccAlreadyClaimedFromLifetime)) sync.ccAlreadyClaimedFromLifetime = 0;
  sync.notificationSettings = normalizeNotificationSettings(syncRaw.notificationSettings ?? sync.notificationSettings, sync.onboardingComplete);
  sync.slots = normalizeSlots(sync.slots, sync.unlockedSlots);
  local.notificationState = normalizeNotificationState(local.notificationState);
  normalizeCurrencyState(sync, local);
  return { sync, local };
}

function localStoragePayload(sync, local) {
  return {
    gameSync: {
      balance: sync.balance,
      totalLifetimeEarned: sync.totalLifetimeEarned,
      cacheCredits: sync.cacheCredits,
      ccAlreadyClaimedFromLifetime: sync.ccAlreadyClaimedFromLifetime,
      cacheCoreLevel: sync.cacheCoreLevel,
      unlockedSlots: sync.unlockedSlots,
      prestigeCount: sync.prestigeCount,
      onboardingComplete: sync.onboardingComplete,
      onboardingStep: sync.onboardingStep,
      onboardingStarterCashClaimed: sync.onboardingStarterCashClaimed,
      slots: sync.slots,
      compactDomains: sync.compactDomains
    },
    domainLibrary: local.domainLibrary,
    presence: local.presence,
    premiumStatus: local.premiumStatus,
    lastAccrualAt: local.lastAccrualAt,
    lastNavigationBonusAt: local.lastNavigationBonusAt,
    lastWakeBonusAt: local.lastWakeBonusAt,
    lastPopupSeenAt: local.lastPopupSeenAt,
    lastPopupBalance: local.lastPopupBalance,
    pendingWelcomeBack: local.pendingWelcomeBack,
    notificationState: local.notificationState
  };
}

async function saveState(sync, local) {
  await chrome.storage.local.set(localStoragePayload(sync, local));
}

async function saveOnboardingState(sync, local, complete, step, { grantStarterCash = false, resetStarterCash = false } = {}) {
  const nextComplete = Boolean(complete);
  const nextStep = step || (nextComplete ? "complete" : "intro");
  const nextStarterCashClaimed = resetStarterCash ? false : sync.onboardingStarterCashClaimed;
  const shouldGrantStarterCash = grantStarterCash && !sync.onboardingStarterCashClaimed;
  const shouldEnableNotifications = nextComplete && !sync.onboardingComplete;
  if (
    sync.onboardingComplete === nextComplete &&
    sync.onboardingStep === nextStep &&
    sync.onboardingStarterCashClaimed === nextStarterCashClaimed &&
    !shouldGrantStarterCash &&
    !shouldEnableNotifications
  ) {
    return;
  }
  sync.onboardingComplete = nextComplete;
  sync.onboardingStep = nextStep;
  sync.onboardingStarterCashClaimed = nextStarterCashClaimed;
  if (shouldEnableNotifications) {
    sync.notificationSettings = {
      ...normalizeNotificationSettings(sync.notificationSettings, false),
      enabled: true
    };
  }
  if (shouldGrantStarterCash) {
    sync.balance = sciAdd(sync.balance, ONBOARDING_STARTER_CASH);
    sync.totalLifetimeEarned = sciAdd(sync.totalLifetimeEarned, ONBOARDING_STARTER_CASH);
    sync.onboardingStarterCashClaimed = true;
  }
  await saveState(sync, local);
  if (shouldEnableNotifications) await chrome.storage.sync.set({ notificationSettings: sync.notificationSettings });
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

// Tracks whether the extension popup is currently open and which normal window
// was focused when it opened. This lets getEligibleFocusedWindow() keep counting
// that window as eligible while the popup is in the foreground.
let popupOpen = false;
let popupAnchorWindowId = null;
let popupAnchorReady = Promise.resolve();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "popup") return;
  popupOpen = true;
  // Capture the focused normal window at the moment the popup opens.
  popupAnchorReady = chrome.windows.getLastFocused().then((win) => {
    if (win && win.type === "normal" && win.state !== "minimized") {
      popupAnchorWindowId = win.id;
    }
  });
  port.onDisconnect.addListener(() => {
    popupOpen = false;
    popupAnchorWindowId = null;
    popupAnchorReady = Promise.resolve();
    settleAndSave();
  });
});

async function getEligibleFocusedWindow() {
  try {
    const focused = await chrome.windows.getLastFocused();
    // Normal case: a real browser window has OS focus.
    if (focused && focused.focused === true && focused.type === "normal" && focused.state !== "minimized") {
      return focused;
    }
    // Popup case: the extension popup has OS focus.
    if (popupOpen) {
      await popupAnchorReady;
      if (popupAnchorWindowId != null) {
        try {
          const win = await chrome.windows.get(popupAnchorWindowId);
          if (win && win.type === "normal" && win.state !== "minimized") {
            return win;
          }
        } catch {
          // Anchor window was closed.
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function activeTabInEligibleWindow() {
  const win = await getEligibleFocusedWindow();
  if (!win) return null;
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  if (!tab || tab.incognito) return null;
  return tab;
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

function canAddDomain(local, domain) {
  return Boolean(local.domainLibrary[domain]) || Object.keys(local.domainLibrary || {}).length < DOMAIN_LIBRARY_LIMIT;
}

function entryVisitDate(entry) {
  return entry?.lastVisited ? new Date(entry.lastVisited).toLocaleDateString("en-CA") : null;
}

function supporterCoreMultiplier(local) {
  return local?.premiumStatus?.supporterCorePaid ? SUPPORTER_CORE_MULTIPLIER : 1;
}

function normalizePremiumStatus(local) {
  local.premiumStatus = {
    ...defaultLocalState().premiumStatus,
    ...(local.premiumStatus || {})
  };
  return local.premiumStatus;
}

async function refreshPremiumStatus(local, { force = false } = {}) {
  const status = normalizePremiumStatus(local);
  const fresh = Date.now() - Number(status.checkedAt || 0) < PREMIUM_STATUS_MAX_AGE_MS;
  if (!force && fresh && status.supporterCorePaid) return status;
  const currentExtPay = makeExtPay();
  if (!currentExtPay?.getUser) {
    local.premiumStatus = {
      ...status,
      supporterCorePaid: false,
      checkedAt: Date.now(),
      error: "ExtensionPay is not available."
    };
    return local.premiumStatus;
  }
  try {
    const user = await currentExtPay.getUser();
    const planNickname = user?.plan?.nickname || null;
    const paid = Boolean(user?.paid || user?.paidAt);
    const hasSupporterCore = Boolean(paid && (!planNickname || planNickname === SUPPORTER_CORE_PLAN));
    local.premiumStatus = {
      supporterCorePaid: hasSupporterCore,
      email: user?.email || null,
      paidAt: user?.paidAt ? user.paidAt.getTime() : null,
      checkedAt: Date.now(),
      error: null
    };
  } catch (error) {
    local.premiumStatus = {
      ...status,
      checkedAt: Date.now(),
      error: error?.message || "Could not check premium status."
    };
  }
  return local.premiumStatus;
}

function recordFocusedVisit(entry, now = Date.now()) {
  const today = localDateKey(now);
  const previousVisitDate = entryVisitDate(entry);
  if (previousVisitDate === today) {
    entry.lastVisited = now;
    return false;
  }
  const yesterday = localDateKey(now - 86400000);
  entry.currentStreak = previousVisitDate === yesterday ? entry.currentStreak + 1 : 1;
  entry.lastVisited = now;
  return true;
}

function normalizeSlottedDomainProgress(entry, cap, now = Date.now()) {
  if (sciCompare(entry.vaultAmount, cap) > 0) {
    entry.vaultAmount = toSci(cap);
  }
  if (Number(entry.currentStreak || 0) <= 0) return;
  const visitDate = entryVisitDate(entry);
  const yesterday = localDateKey(now - 86400000);
  if (!visitDate || visitDate < yesterday) {
    entry.currentStreak = 0;
  }
}

function computeVaultPayout(entry, slot, now, cacheCoreLevel = 0, premiumMultiplier = 1) {
  const stored = Math.min(sciToNumber(entry.vaultAmount), vaultCap(entry, undefined, cacheCoreLevel, premiumMultiplier));
  return {
    vault: stored,
    daily: 0,
    total: stored
  };
}

function addEarnings(sync, entry, amount) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  sync.balance = sciAdd(sync.balance, amount);
  sync.totalLifetimeEarned = sciAdd(sync.totalLifetimeEarned, amount);
  entry.lifetimeEarned = sciAdd(entry.lifetimeEarned, amount);
}

function createWelcomeBackAward(local, now) {
  return {
    focus: { ...SCI_ZERO },
    background: { ...SCI_ZERO },
    daily: { ...SCI_ZERO },
    navigation: { ...SCI_ZERO },
    wake: { ...SCI_ZERO },
    other: { ...SCI_ZERO },
    total: { ...SCI_ZERO },
    seconds: Math.floor((now - local.lastPopupSeenAt) / 1000),
    generatedAt: now
  };
}

function welcomeBackKnownTotal(award) {
  return ["focus", "background", "daily", "navigation", "wake"].reduce((total, key) => sciAdd(total, award?.[key] || SCI_ZERO), SCI_ZERO);
}

function recordWelcomeBackAward(local, bucket, amount, now) {
  if (!local.lastPopupSeenAt || !local.lastPopupBalance || amount <= 0) return;
  if ((now - local.lastPopupSeenAt) / 1000 < WELCOME_BACK_MIN_SECONDS) return;
  if (!local.pendingWelcomeBack || sciCompare(local.pendingWelcomeBack.total, 0) <= 0) {
    local.pendingWelcomeBack = createWelcomeBackAward(local, now);
  }
  if (!local.pendingWelcomeBack[bucket]) local.pendingWelcomeBack[bucket] = { ...SCI_ZERO };
  local.pendingWelcomeBack[bucket] = sciAdd(local.pendingWelcomeBack[bucket], amount);
  local.pendingWelcomeBack.total = sciAdd(local.pendingWelcomeBack.total, amount);
  local.pendingWelcomeBack.seconds = Math.floor((now - local.lastPopupSeenAt) / 1000);
  local.pendingWelcomeBack.generatedAt = now;
}

function recordWelcomeBackAccrual(local, state, amount, now) {
  if (!["active", "background"].includes(state)) return;
  recordWelcomeBackAward(local, state === "active" ? "focus" : "background", amount, now);
}

function welcomeBackAllBucketTotal(award) {
  return ["focus", "background", "daily", "navigation", "wake", "other"].reduce(
    (total, key) => sciAdd(total, award?.[key] || SCI_ZERO),
    SCI_ZERO
  );
}

function scaleWelcomeBackBucketsToTotal(award, total) {
  const bucketKeys = ["focus", "background", "daily", "navigation", "wake", "other"];
  const bucketTotal = welcomeBackAllBucketTotal(award);
  if (sciCompare(bucketTotal, 0) <= 0) {
    award.other = total;
    award.total = total;
    return award;
  }
  if (sciCompare(bucketTotal, total) <= 0) {
    const remainder = sciSub(total, bucketTotal);
    award.other = sciAdd(award.other || SCI_ZERO, remainder);
    award.total = total;
    return award;
  }
  const scale = sciToNumber(total) / sciToNumber(bucketTotal);
  for (const key of bucketKeys) {
    award[key] = sciToNumber(award[key] || SCI_ZERO) > 0
      ? sciAdd(0, sciToNumber(award[key]) * scale)
      : { ...SCI_ZERO };
  }
  award.total = total;
  return award;
}

function recordFocusedVisitAndDaily(sync, local, entry, slot, now = Date.now()) {
  const today = TODAY();
  const isFirstVisitToday = recordFocusedVisit(entry, now);
  if (!isFirstVisitToday) return 0;
  if (!slot || entry.dailyBonusClaimedDate === today || entry.insertedOnDate === today) return 0;
  const amount = dailyFirstOpenBonus(entry, slot, sync.cacheCoreLevel, supporterCoreMultiplier(local));
  entry.dailyBonusClaimedDate = today;
  addEarnings(sync, entry, amount);
  recordWelcomeBackAward(local, "daily", amount, now);
  return amount;
}

function recordForegroundDomainEvent(sync, local, domain, slot, now = Date.now()) {
  const old = local.presence[domain];
  const entry = getDomainEntry(local, domain);
  const lastWake = local.lastWakeBonusAt[domain] || 0;
  if (old?.state === "background" && now - lastWake >= EVENT_BONUS_COOLDOWN_MS) {
    const amount = wakeBurstForLevel(entry, slot, getUpgradeLevel(entry, "wakeBonus"), sync.cacheCoreLevel, supporterCoreMultiplier(local));
    addEarnings(sync, entry, amount);
    recordWelcomeBackAward(local, "wake", amount, now);
    local.lastWakeBonusAt[domain] = now;
  }
  recordFocusedVisitAndDaily(sync, local, entry, slot, now);
  local.presence[domain] = {
    state: "active",
    openCount: Math.max(1, Number(old?.openCount || 0)),
    backgroundSince: null,
    windowId: old?.windowId || null,
    updatedAt: now
  };
}

function updateWelcomeBack(sync, local, now = Date.now()) {
  const lastSeen = Number(local.lastPopupSeenAt || 0);
  const lastBalance = local.lastPopupBalance ? toSci(local.lastPopupBalance) : null;
  const elapsedSeconds = (now - lastSeen) / 1000;

  if (local.pendingWelcomeBack && sciCompare(local.pendingWelcomeBack.total, 0) > 0) {
    if (lastBalance) {
      const actualTotal = sciSub(sync.balance, lastBalance);
      if (sciCompare(actualTotal, 0) <= 0) {
        local.pendingWelcomeBack = null;
        local.lastPopupSeenAt = now;
        local.lastPopupBalance = sync.balance;
        return null;
      }
      scaleWelcomeBackBucketsToTotal(local.pendingWelcomeBack, actualTotal);
    }
    if (lastSeen) local.pendingWelcomeBack.seconds = Math.floor((now - lastSeen) / 1000);
    local.lastPopupSeenAt = now;
    return local.pendingWelcomeBack;
  }

  local.lastPopupSeenAt = now;
  if (!lastSeen || !lastBalance) {
    local.lastPopupBalance = sync.balance;
    return null;
  }
  if (elapsedSeconds < WELCOME_BACK_MIN_SECONDS) {
    local.lastPopupBalance = sync.balance;
    return null;
  }
  const actualTotal = sciSub(sync.balance, lastBalance);
  if (sciCompare(actualTotal, 0) <= 0) {
    local.lastPopupBalance = sync.balance;
    return null;
  }

  const award = createWelcomeBackAward({ ...local, lastPopupSeenAt: lastSeen }, now);
  award.seconds = Math.floor(elapsedSeconds);
  award.other = actualTotal;
  award.total = actualTotal;
  local.pendingWelcomeBack = award;
  return award;
}

function isLivePresenceEligible(presence, eligibleWindow) {
  if (!["active", "background"].includes(presence?.state)) return false;
  if (!eligibleWindow) return false;
  return Number(presence.windowId) === Number(eligibleWindow.id);
}

function settleAccrual(sync, local, now = Date.now(), eligibleWindow = null) {
  const elapsedSeconds = Math.min(MAX_SETTLE_SECONDS, Math.max(0, (now - (local.lastAccrualAt || now)) / 1000));
  for (const slot of sync.slots) {
    if (!slot.assignedDomain) continue;
    const entry = getDomainEntry(local, slot.assignedDomain);
    const premiumMultiplier = supporterCoreMultiplier(local);
    const cap = vaultCap(entry, undefined, sync.cacheCoreLevel, premiumMultiplier);
    normalizeSlottedDomainProgress(entry, cap, now);
    if (elapsedSeconds <= 0) continue;
    const presence = local.presence[slot.assignedDomain];
    const liveStateEligible = isLivePresenceEligible(presence, eligibleWindow);
    const liveRate = liveStateEligible ? domainIncomeForState(entry, slot, presence, now, sync.cacheCoreLevel, premiumMultiplier) : 0;
    const liveGain = liveRate * elapsedSeconds;
    addEarnings(sync, entry, liveGain);
    if (liveStateEligible) recordWelcomeBackAccrual(local, presence?.state, liveGain, now);
    const currentVault = sciToNumber(entry.vaultAmount);
    const vaultGain = Math.min(cap - currentVault, vaultRate(entry, undefined, sync.cacheCoreLevel, premiumMultiplier) * elapsedSeconds);
    if (vaultGain > 0) {
      entry.vaultAmount = sciAdd(entry.vaultAmount, vaultGain);
      if (sciCompare(entry.vaultAmount, cap) > 0) entry.vaultAmount = toSci(cap);
      entry.vaultLastTickTime = now;
    }
  }
  local.lastAccrualAt = now;
}

async function rebuildPresence(sync, local, eligibleWindow = null) {
  const win = eligibleWindow || await getEligibleFocusedWindow();
  const tabs = win ? await chrome.tabs.query({ windowId: win.id }) : [];
  const activeTab = tabs.find((tab) => tab.active && !tab.incognito);
  const foregroundDomain = normalizeDomainFromUrl(activeTab?.url);
  const domains = {};

  if (win) {
    for (const tab of tabs) {
      if (tab.incognito) continue;
      const domain = normalizeDomainFromUrl(tab.url);
      if (!domain) continue;
      domains[domain] ||= { openCount: 0, active: false };
      domains[domain].openCount += 1;
      if (tab.active && domain === foregroundDomain) domains[domain].active = true;
    }
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

    const sameEligibleWindow = win && Number(old?.windowId) === Number(win.id);
    const lastWake = local.lastWakeBonusAt[domain] || 0;
    if (sameEligibleWindow && old?.state === "background" && state === "active" && slot && now - lastWake >= EVENT_BONUS_COOLDOWN_MS) {
      const entry = getDomainEntry(local, domain);
      const amount = wakeBurstForLevel(entry, slot, getUpgradeLevel(entry, "wakeBonus"), sync.cacheCoreLevel, supporterCoreMultiplier(local));
      addEarnings(sync, entry, amount);
      recordWelcomeBackAward(local, "wake", amount, now);
      local.lastWakeBonusAt[domain] = now;
    }
    if (state === "active") recordFocusedVisitAndDaily(sync, local, getDomainEntry(local, domain), slot, now);
    next[domain] = {
      state,
      openCount: seen?.openCount || 0,
      backgroundSince: state === "background" ? (sameEligibleWindow ? old?.backgroundSince || now : now) : null,
      windowId: ["active", "background"].includes(state) ? win.id : null,
      updatedAt: now
    };
  }
  local.presence = next;
}

async function settleAndSave({ rebuild = true } = {}) {
  const { sync, local } = await getState();
  const eligibleWindow = await getEligibleFocusedWindow();
  settleAccrual(sync, local, Date.now(), eligibleWindow);
  if (rebuild) await rebuildPresence(sync, local, eligibleWindow);
  await saveState(sync, local);
  await updateBadge(sync);
  return { sync, local };
}

async function updateBadge(sync) {
  const local = await chrome.storage.local.get(defaultLocalState());
  normalizePremiumStatus(local);
  const cps = Math.max(0, Math.floor(currentIncomePerSecond(sync, local.domainLibrary || {}, local.presence || {}, supporterCoreMultiplier(local))));
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

function formatNotificationMoney(value) {
  const sci = toSci(value);
  if (sci.m === 0) return "$0.00";
  if (sci.e < 3) return `$${sciToNumber(sci).toFixed(2)}`;
  const suffixes = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
  const suffix = Math.floor(sci.e / 3);
  if (suffix > 0 && suffix < suffixes.length) {
    const amount = sci.m * Math.pow(10, sci.e - suffix * 3);
    return `$${amount.toFixed(2)}${suffixes[suffix]}`;
  }
  return `$${sci.m.toFixed(2)}e${sci.e}`;
}

function makeCloudSave(sync, local) {
  return {
    version: 1,
    savedAt: Date.now(),
    gameSync: localStoragePayload(sync, local).gameSync,
    domainLibrary: local.domainLibrary,
    notificationSettings: sync.notificationSettings,
    metadata: {
      totalLifetimeEarned: sync.totalLifetimeEarned,
      cacheCredits: sync.cacheCredits,
      unlockedSlots: sync.unlockedSlots,
      prestigeCount: sync.prestigeCount
    }
  };
}

function cloudSaveMetadata(save) {
  if (!save?.savedAt || !save?.gameSync) return null;
  return {
    savedAt: save.savedAt,
    totalLifetimeEarned: save.metadata?.totalLifetimeEarned || save.gameSync.totalLifetimeEarned || SCI_ZERO,
    cacheCredits: Number(save.metadata?.cacheCredits ?? save.gameSync.cacheCredits ?? 0),
    unlockedSlots: Number(save.metadata?.unlockedSlots ?? save.gameSync.unlockedSlots ?? 3),
    prestigeCount: Number(save.metadata?.prestigeCount ?? save.gameSync.prestigeCount ?? 0)
  };
}

async function getCloudSaveMeta() {
  const result = await chrome.storage.sync.get({ [CLOUD_SAVE_META_KEY]: null });
  return result[CLOUD_SAVE_META_KEY] || null;
}

async function syncCloudSave() {
  const { sync, local } = await settleAndSave();
  const cloudSave = makeCloudSave(sync, local);
  await chrome.storage.sync.set({
    [CLOUD_SAVE_KEY]: cloudSave,
    [CLOUD_SAVE_META_KEY]: cloudSaveMetadata(cloudSave),
    notificationSettings: sync.notificationSettings
  });
  return { ok: true, cloudSaveMeta: cloudSaveMetadata(cloudSave) };
}

async function loadCloudSave() {
  const result = await chrome.storage.sync.get({ [CLOUD_SAVE_KEY]: null, notificationSettings: null });
  const cloudSave = result[CLOUD_SAVE_KEY];
  if (!cloudSave?.gameSync) return { ok: false, error: "No synced save found." };
  const sync = {
    ...defaultSyncState(),
    ...cloudSave.gameSync,
    notificationSettings: normalizeNotificationSettings(result.notificationSettings ?? cloudSave.notificationSettings, cloudSave.gameSync.onboardingComplete)
  };
  sync.slots = normalizeSlots(sync.slots, sync.unlockedSlots);
  const local = {
    ...defaultLocalState(),
    domainLibrary: cloudSave.domainLibrary || {},
    lastAccrualAt: Date.now(),
    lastPopupSeenAt: Date.now(),
    lastPopupBalance: sync.balance
  };
  normalizeCurrencyState(sync, local);
  await saveState(sync, local);
  if (cloudSave.notificationSettings && !result.notificationSettings) {
    await chrome.storage.sync.set({ notificationSettings: sync.notificationSettings });
  }
  await updateBadge(sync);
  return { ok: true, cloudSaveMeta: cloudSaveMetadata(cloudSave) };
}

function sciMulScalar(value, scalar) {
  const sci = toSci(value);
  if (sci.m === 0 || !Number.isFinite(scalar) || scalar <= 0) return { ...SCI_ZERO };
  return toSci({ m: sci.m * scalar, e: sci.e });
}

function slottedDomains(sync, local) {
  return sync.slots
    .filter((slot) => slot.assignedDomain)
    .map((slot) => ({
      slot,
      entry: getDomainEntry(local, slot.assignedDomain)
    }));
}

function allVaultsFull(sync, local) {
  const domains = slottedDomains(sync, local);
  if (!domains.length) return false;
  const premiumMultiplier = supporterCoreMultiplier(local);
  return domains.every(({ slot, entry }) => {
    return sciCompare(entry.vaultAmount, vaultCap(entry, undefined, sync.cacheCoreLevel, premiumMultiplier)) >= 0;
  });
}

function streakRiskDomains(sync, local, now) {
  const today = localDateKey(now);
  return slottedDomains(sync, local).filter(({ entry }) => {
    return Number(entry.currentStreak || 0) >= 3 && entryVisitDate(entry) !== today;
  });
}

async function notifyPlayer(id, title, message) {
  await chrome.notifications.create(id, {
    type: "basic",
    iconUrl: "icons/Icon14_40.png",
    title,
    message,
    priority: 1
  });
}

async function maybeSendEngagementNotifications() {
  const { sync, local } = await settleAndSave();
  const settings = normalizeNotificationSettings(sync.notificationSettings, sync.onboardingComplete);
  const memory = normalizeNotificationState(local.notificationState);
  local.notificationState = memory;
  const now = Date.now();
  let changed = false;

  if (!settings.enabled || !sync.onboardingComplete) {
    await chrome.storage.local.set({ notificationState: local.notificationState });
    return;
  }

  const fullVaults = allVaultsFull(sync, local);
  if (settings.vaultFull && fullVaults && !memory.vaultFullNotified) {
    await notifyPlayer(
      NOTIFICATION_IDS.vaultFull,
      "All vaults are full",
      "Your domains are capped. Open Browser Tycoon and collect before more cash gets boxed out."
    );
    memory.vaultFullNotified = true;
    changed = true;
  } else if (!fullVaults && memory.vaultFullNotified) {
    memory.vaultFullNotified = false;
    changed = true;
  }

  if (settings.bigPayout && now - Number(local.lastPopupSeenAt || 0) >= DAY_MS && now - memory.lastBigPayoutCheckAt >= DAY_MS) {
    const payout = local.lastPopupBalance ? sciSub(sync.balance, local.lastPopupBalance) : SCI_ZERO;
    const threshold = sciMulScalar(sync.balance, 0.2);
    memory.lastBigPayoutCheckAt = now;
    changed = true;
    if (sciCompare(payout, threshold) >= 0 && sciCompare(payout, 0) > 0) {
      await notifyPlayer(
        NOTIFICATION_IDS.bigPayout,
        `${formatNotificationMoney(payout)} is waiting`,
        "Your browsing empire has been working for a day. Open Browser Tycoon to collect and upgrade."
      );
      memory.lastBigPayoutNotificationAt = now;
    }
  }

  const localHour = Number(new Date(now).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit" }));
  const today = localDateKey(now);
  if (settings.streakRisk && localHour >= 19 && memory.lastStreakRiskDate !== today) {
    const atRisk = streakRiskDomains(sync, local, now);
    if (atRisk.length) {
      const domain = atRisk[0].entry.domain;
      await notifyPlayer(
        NOTIFICATION_IDS.streakRisk,
        "A streak is at risk",
        `${domain} has a ${atRisk[0].entry.currentStreak}-day streak. Visit a slotted domain today to keep it alive.`
      );
      memory.lastStreakRiskDate = today;
      changed = true;
    }
  }

  if (changed) await chrome.storage.local.set({ notificationState: local.notificationState });
}

function currentIncomePerSecond(sync, library, presence, premiumMultiplier = 1) {
  const incomes = currentSlotIncomes(sync, library, presence, Date.now(), premiumMultiplier);
  return Object.values(incomes).reduce((sum, value) => sum + value, 0);
}

function currentSlotIncomes(sync, library, presence, now = Date.now(), premiumMultiplier = 1) {
  return sync.slots.reduce((incomes, slot) => {
    if (!slot.assignedDomain) return incomes;
    const domain = slot.assignedDomain;
    incomes[domain] = domainIncomeForState(library[domain], slot, presence[domain], now, sync.cacheCoreLevel, premiumMultiplier);
    return incomes;
  }, {});
}

async function getSnapshot() {
  const { sync, local } = await settleAndSave();
  await refreshPremiumStatus(local);
  await saveState(sync, local);
  const activeTab = await activeTabInEligibleWindow();
  const currentDomain = normalizeDomainFromUrl(activeTab?.url);
  const now = Date.now();
  const balanceGainSinceLastPopup = local.lastPopupBalance ? sciSub(sync.balance, local.lastPopupBalance) : SCI_ZERO;
  const welcomeBack = updateWelcomeBack(sync, local, now);
  await saveState(sync, local);
  const cloudSaveMeta = await getCloudSaveMeta();
  const premiumMultiplier = supporterCoreMultiplier(local);
  const slotIncomes = currentSlotIncomes(sync, local.domainLibrary, local.presence, now, premiumMultiplier);
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
    premium: {
      supporterCorePaid: Boolean(local.premiumStatus?.supporterCorePaid),
      email: local.premiumStatus?.email || null,
      checkedAt: Number(local.premiumStatus?.checkedAt || 0),
      error: local.premiumStatus?.error || null,
      multiplier: premiumMultiplier,
      productName: "Supporter Core",
      price: "$2.99",
      planNickname: SUPPORTER_CORE_PLAN
    },
    now,
    slotIncomes,
    welcomeBack,
    balanceGainSinceLastPopup,
    cloudSaveMeta,
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

function upgradeBulkCost(def, level, quantity) {
  let total = 0;
  for (let offset = 0; offset < quantity; offset += 1) {
    const nextLevel = level + offset;
    if (def.maxLevel !== null && nextLevel >= def.maxLevel) break;
    total += upgradeCost(def, nextLevel);
  }
  return total;
}

function buyUpgrade(sync, local, domain, upgradeId, mode) {
  const def = UPGRADE_DEFS.find((upgrade) => upgrade.id === upgradeId);
  const entry = getDomainEntry(local, domain);
  if (!def || !entry) return { ok: false, error: "Upgrade unavailable." };
  const target = mode === "10" ? 10 : 1;
  const startLevel = getUpgradeLevel(entry, upgradeId);
  if (def.maxLevel !== null && startLevel >= def.maxLevel) return { ok: false, error: "Upgrade is maxed." };
  const totalCost = upgradeBulkCost(def, startLevel, target);
  if (sciCompare(sync.balance, totalCost) < 0) return { ok: false, error: "Not enough cash." };
  sync.balance = sciSub(sync.balance, totalCost);
  let bought = 0;
  while (bought < target) {
    const level = getUpgradeLevel(entry, upgradeId);
    if (def.maxLevel !== null && level >= def.maxLevel) break;
    entry.upgrades[upgradeId] = level + 1;
    bought += 1;
  }
  return { ok: true, bought };
}

async function addCurrentSite(slotId) {
  const domain = await activeTabDomain();
  if (!domain) return { ok: false, error: "This page cannot be added." };
  return assignDomainToSlot(slotId, domain, { fromCurrentSite: true });
}

async function activeTabDomain() {
  const tab = await activeTabInEligibleWindow();
  return normalizeDomainFromUrl(tab?.url);
}

async function isForegroundTab(tabId) {
  try {
    const [tab, win] = await Promise.all([
      chrome.tabs.get(tabId),
      getEligibleFocusedWindow()
    ]);
    if (!tab?.active || !win) return false;
    if (tab.incognito) return false;
    return Number(tab.windowId) === Number(win.id);
  } catch {
    return false;
  }
}

async function assignDomainToSlot(slotId, domain, options = {}) {
  domain = normalizeDomainInput(domain);
  if (!domain) return { ok: false, error: "Enter a valid website domain." };
  const { sync, local } = await settleAndSave();
  if (!canAddDomain(local, domain)) {
    return { ok: false, error: `Domain library full (${DOMAIN_LIBRARY_LIMIT}/${DOMAIN_LIBRARY_LIMIT}). Delete a domain before adding another.` };
  }
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

async function deleteDomain(domain) {
  domain = normalizeDomainInput(domain);
  if (!domain) return { ok: false, error: "Invalid domain." };
  const { sync, local } = await settleAndSave();
  if (!local.domainLibrary[domain]) return { ok: false, error: "Domain not found." };
  for (const slot of sync.slots) {
    if (slot.assignedDomain === domain) slot.assignedDomain = null;
  }
  delete local.domainLibrary[domain];
  delete local.presence[domain];
  delete local.lastNavigationBonusAt[domain];
  delete local.lastWakeBonusAt[domain];
  local.notificationState = normalizeNotificationState(local.notificationState);
  local.notificationState.vaultFullNotified = false;
  await saveState(sync, local);
  await updateBadge(sync);
  return { ok: true };
}

async function claimRevisit(domain) {
  const { sync, local } = await settleAndSave();
  const slot = sync.slots.find((item) => item.assignedDomain === domain);
  if (!slot) return { ok: false, error: "Domain is not slotted." };
  const entry = getDomainEntry(local, domain);
  const payout = computeVaultPayout(entry, slot, Date.now(), sync.cacheCoreLevel, supporterCoreMultiplier(local));
  if (payout.total <= 0) return { ok: false, error: "Nothing ready to claim yet.", payout };
  entry.vaultAmount = { ...SCI_ZERO };
  local.notificationState = normalizeNotificationState(local.notificationState);
  local.notificationState.vaultFullNotified = false;
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
  if (sync.cacheCredits < cost) return { ok: false, error: "Not enough CC." };
  sync.cacheCredits -= cost;
  slot.tier += 1;
  await saveState(sync, local);
  return { ok: true };
}

async function upgradeCacheCore() {
  const { sync, local } = await settleAndSave();
  const cost = cacheCoreCost(sync.cacheCoreLevel);
  if (sync.cacheCredits < cost) return { ok: false, error: "Not enough CC." };
  sync.cacheCredits -= cost;
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
  if (Number(sync.prestigeCount || 0) < 1 && sciCompare(sync.totalLifetimeEarned, FIRST_PRESTIGE_LIFETIME_REQUIREMENT) < 0) {
    return {
      ok: false,
      error: `First Clear Cache unlocks at $${FIRST_PRESTIGE_LIFETIME_REQUIREMENT.toLocaleString()} lifetime earnings.`
    };
  }
  const cpTotal = prestigeTotalFromLifetime(sync.totalLifetimeEarned);
  const award = Math.max(0, cpTotal - sync.ccAlreadyClaimedFromLifetime);
  sync.cacheCredits += award;
  sync.ccAlreadyClaimedFromLifetime = cpTotal;
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
  if (!Number.isFinite(value) || value <= 0) return { ok: false, error: "Invalid CC amount." };
  sync.cacheCredits += value;
  await saveState(sync, local);
  return { ok: true, amount: value };
}

async function devResetCashAndCachePoints() {
  const { sync, local } = await settleAndSave();
  sync.balance = { ...SCI_ZERO };
  sync.cacheCredits = 0;
  await saveState(sync, local);
  return { ok: true };
}

async function devResetLifetime() {
  const { sync, local } = await settleAndSave();
  sync.totalLifetimeEarned = { ...SCI_ZERO };
  sync.ccAlreadyClaimedFromLifetime = 0;
  for (const entry of Object.values(local.domainLibrary)) {
    entry.lifetimeEarned = { ...SCI_ZERO };
  }
  await saveState(sync, local);
  return { ok: true };
}

async function openPremiumPayment() {
  const currentExtPay = makeExtPay();
  if (!currentExtPay?.openPaymentPage) return { ok: false, error: "ExtensionPay is not available." };
  await currentExtPay.openPaymentPage(SUPPORTER_CORE_PLAN);
  return { ok: true };
}

async function openPremiumLogin() {
  const currentExtPay = makeExtPay();
  if (!currentExtPay?.openLoginPage) return { ok: false, error: "ExtensionPay is not available." };
  await currentExtPay.openLoginPage();
  return { ok: true };
}

async function forceRefreshPremiumStatus() {
  const { sync, local } = await getState();
  const status = await refreshPremiumStatus(local, { force: true });
  await saveState(sync, local);
  return {
    ok: true,
    paid: Boolean(status.supporterCorePaid),
    error: status.error || null
  };
}

async function updateNotificationSettings(patch = {}) {
  const { sync, local } = await getState();
  const cleaned = Object.fromEntries(
    Object.entries(patch || {})
      .filter(([key]) => key in DEFAULT_NOTIFICATION_SETTINGS)
      .map(([key, value]) => [key, Boolean(value)])
  );
  if ("enabled" in cleaned) {
    cleaned.vaultFull = cleaned.enabled;
    cleaned.bigPayout = cleaned.enabled;
    cleaned.streakRisk = cleaned.enabled;
  }
  sync.notificationSettings = {
    ...normalizeNotificationSettings(sync.notificationSettings, sync.onboardingComplete),
    ...cleaned
  };
  sync.notificationSettings = normalizeNotificationSettings(sync.notificationSettings, sync.onboardingComplete);
  await Promise.all([
    saveState(sync, local),
    chrome.storage.sync.set({ notificationSettings: sync.notificationSettings })
  ]);
  return { ok: true, notificationSettings: sync.notificationSettings };
}

async function navigationBonus(details) {
  if (details.frameId !== 0) return;
  const domain = normalizeDomainFromUrl(details.url);
  if (!domain) return;
  const isForeground = await isForegroundTab(details.tabId);
  const eligibleWindow = await getEligibleFocusedWindow();
  const { sync, local } = await getState();
  settleAccrual(sync, local, Date.now(), eligibleWindow);
  const slot = sync.slots.find((item) => item.assignedDomain === domain);
  if (!slot) {
    await rebuildPresence(sync, local, eligibleWindow);
    await saveState(sync, local);
    await updateBadge(sync);
    return;
  }
  const now = Date.now();
  if (!isForeground) {
    await rebuildPresence(sync, local, eligibleWindow);
    await saveState(sync, local);
    await updateBadge(sync);
    return;
  }
  if (isForeground) recordForegroundDomainEvent(sync, local, domain, slot, now);
  const entry = getDomainEntry(local, domain);
  const level = getUpgradeLevel(entry, "navigationBonus");
  if (level <= 0) {
    await rebuildPresence(sync, local, eligibleWindow);
    await saveState(sync, local);
    await updateBadge(sync);
    return;
  }
  const last = local.lastNavigationBonusAt[domain] || 0;
  if (now - last < EVENT_BONUS_COOLDOWN_MS) {
    await rebuildPresence(sync, local, eligibleWindow);
    await saveState(sync, local);
    await updateBadge(sync);
    return;
  }
  const amount = navigationPayoutForLevel(entry, slot, level, sync.cacheCoreLevel, supporterCoreMultiplier(local));
  local.lastNavigationBonusAt[domain] = now;
  addEarnings(sync, entry, amount);
  recordWelcomeBackAward(local, "navigation", amount, now);
  await rebuildPresence(sync, local, eligibleWindow);
  await saveState(sync, local);
  await updateBadge(sync);
}

let pendingSettleTimer = null;

function scheduleSettle(delay = 0) {
  if (pendingSettleTimer) clearTimeout(pendingSettleTimer);
  pendingSettleTimer = setTimeout(() => {
    pendingSettleTimer = null;
    settleAndSave();
  }, delay);
}

async function ensureAlarms() {
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  await chrome.alarms.create(NOTIFICATION_ALARM_NAME, { periodInMinutes: 60 });
}

async function openTycoonFromNotification(notificationId) {
  if (!Object.values(NOTIFICATION_IDS).includes(notificationId)) return;
  await chrome.notifications.clear(notificationId);
  if (chrome.action?.openPopup) {
    try {
      await chrome.action.openPopup();
      return;
    } catch (_error) {}
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureAlarms();
  await settleAndSave();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarms();
  await settleAndSave();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) settleAndSave();
  if (alarm.name === NOTIFICATION_ALARM_NAME) maybeSendEngagementNotifications();
});
chrome.notifications.onClicked.addListener(openTycoonFromNotification);
chrome.tabs.onActivated.addListener(() => settleAndSave());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === "complete") settleAndSave();
});
chrome.tabs.onRemoved.addListener(() => settleAndSave());
chrome.windows.onFocusChanged.addListener(() => settleAndSave());
chrome.windows.onRemoved.addListener(() => settleAndSave());
chrome.windows.onBoundsChanged.addListener(() => scheduleSettle(250));
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
      if (message.type === "deleteDomain") return deleteDomain(message.domain);
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
      if (message.type === "devResetLifetime") return devResetLifetime();
      if (message.type === "openPremiumPayment") return openPremiumPayment();
      if (message.type === "openPremiumLogin") return openPremiumLogin();
      if (message.type === "refreshPremiumStatus") return forceRefreshPremiumStatus();
      if (message.type === "updateNotificationSettings") return updateNotificationSettings(message.settings);
      if (message.type === "syncCloudSave") return syncCloudSave();
      if (message.type === "loadCloudSave") return loadCloudSave();
      if (message.type === "completeOnboarding") {
        const { sync, local } = await getState();
        const alreadyClaimed = Boolean(sync.onboardingStarterCashClaimed);
        await saveOnboardingState(sync, local, true, "complete", { grantStarterCash: true });
        return { ok: true, starterCash: alreadyClaimed ? 0 : ONBOARDING_STARTER_CASH };
      }
      if (message.type === "resetOnboarding") {
        const { sync, local } = await getState();
        await saveOnboardingState(sync, local, false, "intro", { resetStarterCash: true });
        return { ok: true };
      }
      if (message.type === "setOnboardingStep") {
        const { sync, local } = await getState();
        if (sync.onboardingComplete) return { ok: true, ignored: true };
        await saveOnboardingState(sync, local, false, message.step || "intro");
        return { ok: true };
      }
      return { ok: false, error: "Unknown action." };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  })()
    .then((response) => sendResponse(response || { ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || "Action failed." }));
  return true;
});
