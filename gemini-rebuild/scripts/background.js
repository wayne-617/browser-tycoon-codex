importScripts('gameMath.js', 'storage.js');

const ALARM_NAME = 'browserTycoonAccrual';

function getPresenceForDomain(snapshot, domain) {
  return snapshot[domain] || { state: 'closed', openCount: 0, updatedAt: Date.now() };
}

function applyEarnings(state, domainEntry, amount) {
  if (amount <= 0) return;
  state.sync.balance += amount;
  state.sync.totalLifetimeEarned += amount;
  domainEntry.lifetimeEarned += amount;
}

async function settleAccrual(reason = 'event') {
  const state = await StorageManager.getGameState();
  const now = Date.now();
  const last = Number(state.local.lastAccrualAt || now);
  const elapsedSec = Math.max(0, (now - last) / 1000);
  if (elapsedSec <= 0) return state;

  for (const slot of state.sync.slots) {
    if (!slot.assignedDomain) continue;
    const entry = StorageManager.ensureDomain(state.local, slot.assignedDomain);
    const presence = getPresenceForDomain(state.local.presenceSnapshot, slot.assignedDomain);

    if (presence.state === 'active' || presence.state === 'background') {
      const income = GameMath.calculateIncomePerSec(entry, slot, presence, now) * elapsedSec;
      applyEarnings(state, entry, income);
    } else {
      entry.vaultAmount = GameMath.calculateVaultAccrual(entry, elapsedSec);
      entry.vaultLastTickTime = now;
    }
  }

  state.local.lastAccrualAt = now;
  await Promise.all([
    StorageManager.saveSyncState(state.sync),
    StorageManager.saveLocalState(state.local)
  ]);
  return state;
}

async function buildPresenceSnapshot(previousSnapshot = {}) {
  const tabs = await chrome.tabs.query({});
  const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const activeDomain = activeTabs.length ? StorageManager.domainFromUrl(activeTabs[0].url) : null;
  const now = Date.now();
  const counts = {};

  for (const tab of tabs) {
    if (tab.incognito) continue;
    const domain = StorageManager.domainFromUrl(tab.url);
    if (!domain) continue;
    counts[domain] = (counts[domain] || 0) + 1;
  }

  const snapshot = {};
  for (const [domain, openCount] of Object.entries(counts)) {
    const previous = previousSnapshot[domain] || {};
    const state = domain === activeDomain ? 'active' : 'background';
    snapshot[domain] = {
      state,
      openCount,
      backgroundSince: state === 'background'
        ? (previous.state === 'background' ? previous.backgroundSince : now)
        : null,
      updatedAt: now
    };
  }
  return snapshot;
}

async function claimFirstOpenIfReady(state, domain) {
  const slot = state.sync.slots.find(item => item.assignedDomain === domain);
  if (!slot) return 0;
  const entry = StorageManager.ensureDomain(state.local, domain);
  const today = StorageManager.todayKey();
  if (entry.insertedOnDate === today || entry.dailyBonusClaimedDate === today) return 0;

  const lastVisitDate = entry.lastVisited ? StorageManager.todayKey(new Date(entry.lastVisited)) : null;
  if (lastVisitDate) {
    const lastMidnight = new Date(`${lastVisitDate}T00:00:00`);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    entry.currentStreak = StorageManager.todayKey(yesterday) === StorageManager.todayKey(lastMidnight)
      ? entry.currentStreak + 1
      : 1;
  } else {
    entry.currentStreak = 1;
  }

  const payout = Math.min(entry.vaultAmount, GameMath.getVaultCap(entry))
    + GameMath.calculateDailyFirstOpenBonus(entry, slot);
  entry.vaultAmount = 0;
  entry.dailyBonusClaimedDate = today;
  entry.lastVisited = Date.now();
  applyEarnings(state, entry, payout);
  return payout;
}

async function refreshPresenceAndSettle(reason = 'tabs') {
  const state = await settleAccrual(reason);
  const previousSnapshot = state.local.presenceSnapshot || {};
  const nextSnapshot = await buildPresenceSnapshot(previousSnapshot);

  for (const [domain, presence] of Object.entries(nextSnapshot)) {
    const previous = previousSnapshot[domain];
    const slot = state.sync.slots.find(item => item.assignedDomain === domain);
    if (!slot) continue;
    const entry = StorageManager.ensureDomain(state.local, domain);

    if (presence.state === 'active') {
      await claimFirstOpenIfReady(state, domain);
      if (previous?.state === 'background') {
        applyEarnings(state, entry, GameMath.calculateWakeBonus(entry));
      }
      entry.lastVisited = Date.now();
    }
  }

  state.local.presenceSnapshot = nextSnapshot;
  state.local.lastAccrualAt = Date.now();
  await Promise.all([
    StorageManager.saveSyncState(state.sync),
    StorageManager.saveLocalState(state.local)
  ]);
  await updateBadge(state);
  return state;
}

async function handleNavigation(details) {
  if (details.frameId !== 0) return;
  const state = await refreshPresenceAndSettle('navigation');
  const domain = StorageManager.domainFromUrl(details.url);
  const slot = state.sync.slots.find(item => item.assignedDomain === domain);
  if (!domain || !slot) return;
  const entry = StorageManager.ensureDomain(state.local, domain);
  const now = Date.now();
  if ((now - Number(entry.lastNavigationBonusAt || 0)) < GameMath.NAVIGATION_COOLDOWN_MS) return;
  const bonus = GameMath.calculateNavigationBonus(entry, slot);
  if (bonus <= 0) return;
  entry.lastNavigationBonusAt = now;
  applyEarnings(state, entry, bonus);
  await Promise.all([
    StorageManager.saveSyncState(state.sync),
    StorageManager.saveLocalState(state.local)
  ]);
}

async function updateBadge(state) {
  const total = state.sync.slots.reduce((sum, slot) => {
    if (!slot.assignedDomain) return sum;
    const entry = state.local.domainLibrary[slot.assignedDomain];
    const presence = getPresenceForDomain(state.local.presenceSnapshot, slot.assignedDomain);
    return sum + GameMath.calculateIncomePerSec(entry, slot, presence);
  }, 0);
  await chrome.action.setBadgeText({ text: total > 0 ? `${total.toFixed(1)}/s` : '' });
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  await refreshPresenceAndSettle('install');
});

chrome.runtime.onStartup.addListener(() => refreshPresenceAndSettle('startup'));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete' || changeInfo.url) refreshPresenceAndSettle('tab-updated');
});
chrome.tabs.onActivated.addListener(() => refreshPresenceAndSettle('tab-activated'));
chrome.tabs.onRemoved.addListener(() => refreshPresenceAndSettle('tab-removed'));
chrome.webNavigation.onCommitted.addListener(handleNavigation);
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) refreshPresenceAndSettle('alarm');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'BT_SETTLE') return false;
  refreshPresenceAndSettle('popup').then(state => {
    sendResponse({ ok: true, state });
  }).catch(error => {
    sendResponse({ ok: false, error: error.message });
  });
  return true;
});

chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
refreshPresenceAndSettle('worker-load');
