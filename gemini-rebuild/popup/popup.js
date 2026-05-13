let gameState;
let currentSlotId = null;
let currentDomain = null;
let buyMode = '1';

async function settleAndLoad() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'BT_SETTLE' });
    if (response?.ok) {
      gameState = response.state;
      return;
    }
  } catch (e) {
    // The worker may be waking or unavailable during development reloads.
  }
  gameState = await StorageManager.getGameState();
}

function byId(id) {
  return document.getElementById(id);
}

function switchView(id) {
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === id));
}

function presenceFor(domain) {
  return gameState.local.presenceSnapshot[domain] || { state: 'closed', openCount: 0 };
}

function stateLabel(domain) {
  const state = presenceFor(domain).state;
  if (state === 'active') return 'Focused';
  if (state === 'background') return 'Background';
  return 'Closed';
}

function favicon(domain) {
  const img = document.createElement('img');
  img.className = 'domain-icon';
  img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
  img.alt = '';
  img.addEventListener('error', () => {
    img.replaceWith(letterFallback(domain));
  }, { once: true });
  return img;
}

function letterFallback(domain) {
  const span = document.createElement('span');
  span.className = 'domain-icon fallback';
  span.textContent = domain.slice(0, 1).toUpperCase();
  return span;
}

async function currentTabDomain() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return StorageManager.domainFromUrl(tabs[0]?.url || '');
}

function totalIncomePerSec() {
  return gameState.sync.slots.reduce((sum, slot) => {
    if (!slot.assignedDomain) return sum;
    const entry = gameState.local.domainLibrary[slot.assignedDomain];
    return sum + GameMath.calculateIncomePerSec(entry, slot, presenceFor(slot.assignedDomain));
  }, 0);
}

function renderHeader() {
  byId('balanceDisplay').textContent = GameMath.formatMoney(gameState.sync.balance);
  byId('incomeDisplay').textContent = `${GameMath.formatMoney(totalIncomePerSec())}/sec`;
  byId('cacheDisplay').textContent = `${gameState.sync.cachePoints} CP`;
}

function renderMain() {
  renderHeader();
  const list = byId('slotsList');
  list.innerHTML = '';

  for (const slot of gameState.sync.slots) {
    if (slot.assignedDomain) {
      list.appendChild(renderFilledSlot(slot));
    } else {
      const empty = document.createElement('button');
      empty.className = 'slot empty-slot';
      empty.innerHTML = `<span>+</span><strong>Empty Slot ${slot.id}</strong><small>Add Current Site or Library Domain</small>`;
      empty.addEventListener('click', () => openPicker(slot.id));
      list.appendChild(empty);
    }
  }

  const nextSlot = gameState.sync.unlockedSlots + 1;
  const cost = GameMath.calculateSlotUnlockCost(nextSlot);
  const locked = document.createElement('button');
  locked.className = 'slot locked-slot';
  locked.disabled = gameState.sync.balance < cost;
  locked.innerHTML = `<strong>Locked Slot ${nextSlot}</strong><small>Unlock for ${GameMath.formatMoney(cost)}</small>`;
  locked.addEventListener('click', unlockNextSlot);
  list.appendChild(locked);

  const award = GameMath.calculatePrestigeAward(gameState.sync.totalLifetimeEarned, gameState.sync.cpAlreadyClaimedFromLifetime);
  byId('clearCacheBtn').textContent = `Clear Cache ${award > 0 ? `(+${award} CP)` : ''}`;
  byId('clearCacheBtn').disabled = award <= 0;
}

function renderFilledSlot(slot) {
  const entry = gameState.local.domainLibrary[slot.assignedDomain];
  const income = GameMath.calculateIncomePerSec(entry, slot, presenceFor(slot.assignedDomain));
  const cap = GameMath.getVaultCap(entry);
  const fill = cap > 0 ? Math.min(100, (entry.vaultAmount / cap) * 100) : 0;
  const dailyReady = entry.dailyBonusClaimedDate !== StorageManager.todayKey() && entry.insertedOnDate !== StorageManager.todayKey();
  const card = document.createElement('button');
  card.className = 'slot filled-slot';
  card.append(favicon(slot.assignedDomain));
  const body = document.createElement('span');
  body.className = 'slot-body';
  body.innerHTML = `
    <strong>${slot.assignedDomain}</strong>
    <small>${GameMath.formatMoney(income)}/sec · ${stateLabel(slot.assignedDomain)}</small>
    <span class="vault-strip"><span style="width:${fill}%"></span></span>
  `;
  const badge = document.createElement('span');
  badge.className = `status-badge ${dailyReady || fill >= 100 ? 'ready' : ''}`;
  badge.textContent = fill >= 100 ? 'Vault Full' : dailyReady ? 'Daily Ready' : `T${slot.tier}`;
  card.append(body, badge);
  card.addEventListener('click', () => openDetail(slot.id));
  return card;
}

async function openPicker(slotId) {
  currentSlotId = slotId;
  const slot = gameState.sync.slots.find(item => item.id === slotId);
  const domain = await currentTabDomain();
  const btn = byId('addCurrentSiteBtn');
  const isEmptySlot = !slot?.assignedDomain;
  btn.hidden = !isEmptySlot;
  byId('pickerTitle').textContent = isEmptySlot ? `Assign Slot ${slotId}` : `Swap Slot ${slotId}`;
  btn.disabled = !domain || gameState.sync.slots.some(item => item.assignedDomain === domain);
  btn.textContent = domain ? `Add Current Site: ${domain}` : 'Current page cannot be slotted';
  if (domain && btn.disabled) btn.textContent = `${domain} is already slotted`;
  renderPickerLibrary();
  switchView('pickerView');
}

function renderPickerLibrary() {
  renderLibraryList(byId('pickerLibraryList'), byId('pickerSearchInput').value, true);
}

function renderLibrary() {
  renderHeader();
  renderLibraryList(byId('libraryList'), byId('librarySearchInput').value, false);
}

function renderLibraryList(container, query, assignMode) {
  const needle = (query || '').trim().toLowerCase();
  container.innerHTML = '';
  const domains = Object.keys(gameState.local.domainLibrary)
    .filter(domain => domain.includes(needle))
    .sort();

  if (domains.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-message';
    empty.textContent = 'No promoted domains yet.';
    container.appendChild(empty);
    return;
  }

  for (const domain of domains) {
    const entry = gameState.local.domainLibrary[domain];
    const isSlotted = gameState.sync.slots.some(slot => slot.assignedDomain === domain);
    const row = document.createElement('button');
    row.className = 'library-row';
    row.append(favicon(domain));
    const levels = Object.values(entry.upgrades || {}).reduce((sum, lvl) => sum + lvl, 0);
    const body = document.createElement('span');
    body.innerHTML = `<strong>${domain}</strong><small>${GameMath.formatMoney(entry.lifetimeEarned)} lifetime · ${levels} upgrades · ${isSlotted ? 'Slotted' : 'Library'}</small>`;
    row.appendChild(body);
    row.disabled = assignMode && isSlotted;
    row.addEventListener('click', () => {
      if (assignMode) assignDomainToSlot(domain, currentSlotId, true);
      else openDomainSummary(domain);
    });
    container.appendChild(row);
  }
}

function openDomainSummary(domain) {
  currentDomain = domain;
  const slot = gameState.sync.slots.find(item => item.assignedDomain === domain);
  if (slot) openDetail(slot.id);
  else {
    renderHeader();
    const entry = gameState.local.domainLibrary[domain];
    byId('detailTitle').textContent = domain;
    byId('detailSummary').innerHTML = `
      <div class="summary-top">
        <strong>${domain}</strong>
        <span>Library</span>
      </div>
      <div class="summary-grid">
        <span>Lifetime</span><b>${GameMath.formatMoney(entry.lifetimeEarned)}</b>
        <span>Vault</span><b>${GameMath.formatMoney(entry.vaultAmount)}</b>
        <span>Last Visit</span><b>${entry.lastVisited ? new Date(entry.lastVisited).toLocaleDateString() : 'Never'}</b>
        <span>Upgrades</span><b>${Object.values(entry.upgrades || {}).reduce((sum, lvl) => sum + lvl, 0)}</b>
      </div>
    `;
    byId('upgradeSections').innerHTML = '';
    byId('swapSlotBtn').hidden = true;
    byId('removeSlotBtn').hidden = true;
    byId('upgradeTierBtn').hidden = true;
    byId('buyMode').hidden = true;
    switchView('detailView');
  }
}

function openDetail(slotId) {
  currentSlotId = slotId;
  const slot = gameState.sync.slots.find(item => item.id === slotId);
  if (!slot || !slot.assignedDomain) return;
  currentDomain = slot.assignedDomain;
  byId('swapSlotBtn').hidden = false;
  byId('removeSlotBtn').hidden = false;
  byId('upgradeTierBtn').hidden = false;
  byId('buyMode').hidden = false;
  renderDetail();
  switchView('detailView');
}

function renderDetail() {
  renderHeader();
  const slot = gameState.sync.slots.find(item => item.id === currentSlotId);
  const entry = gameState.local.domainLibrary[slot.assignedDomain];
  const presence = presenceFor(slot.assignedDomain);
  const income = GameMath.calculateIncomePerSec(entry, slot, presence);
  const cap = GameMath.getVaultCap(entry);
  byId('detailTitle').textContent = `Slot ${slot.id} · ${slot.assignedDomain}`;
  byId('detailSummary').innerHTML = `
    <div class="summary-top">
      <strong>${slot.assignedDomain}</strong>
      <span>${stateLabel(slot.assignedDomain)}</span>
    </div>
    <div class="summary-grid">
      <span>Current</span><b>${GameMath.formatMoney(income)}/sec</b>
      <span>Active</span><b>${GameMath.formatMoney(GameMath.calculateIncomePerSec(entry, slot, { state: 'active' }))}/sec</b>
      <span>Background</span><b>${GameMath.formatMoney(GameMath.calculateIncomePerSec(entry, slot, { state: 'background', backgroundSince: Date.now() - 300000 }))}/sec</b>
      <span>Vault</span><b>${GameMath.formatMoney(entry.vaultAmount)} / ${GameMath.formatMoney(cap)}</b>
      <span>Daily</span><b>${entry.dailyBonusClaimedDate === StorageManager.todayKey() ? 'Claimed' : 'Ready on visit'}</b>
      <span>Navigation</span><b>${GameMath.formatMoney(GameMath.calculateNavigationBonus(entry, slot))}</b>
    </div>
  `;
  renderUpgrades(slot, entry);
  const nextTier = slot.tier + 1;
  const tierCost = GameMath.calculatePrestigeCost(nextTier);
  byId('upgradeTierBtn').textContent = nextTier <= 5 ? `Upgrade Slot Tier ${nextTier} · ${tierCost} CP` : 'Max Slot Tier';
  byId('upgradeTierBtn').disabled = nextTier > 5 || gameState.sync.cachePoints < tierCost;
}

function renderUpgrades(slot, entry) {
  const host = byId('upgradeSections');
  host.innerHTML = '';
  const grouped = Object.values(GameMath.upgrades).reduce((acc, upg) => {
    acc[upg.category] = acc[upg.category] || [];
    acc[upg.category].push(upg);
    return acc;
  }, {});
  for (const [category, upgrades] of Object.entries(grouped)) {
    const section = document.createElement('details');
    section.className = 'upgrade-section';
    section.open = true;
    section.innerHTML = `<summary>${category}</summary>`;
    for (const upg of upgrades) {
      const lvl = entry.upgrades[upg.id] || 0;
      const maxed = upg.maxLevel !== null && lvl >= upg.maxLevel;
      const qty = buyQuantity(upg.id, lvl);
      const cost = maxed ? Infinity : GameMath.calculateUpgradeCost(upg.id, lvl, qty);
      const row = document.createElement('div');
      row.className = 'upgrade-row';
      row.innerHTML = `
        <img src="../icons/${upg.icon}" alt="">
        <span><strong>${upg.name} <em>Lvl ${lvl}${upg.maxLevel ? `/${upg.maxLevel}` : ''}</em></strong><small>${upg.effectText(lvl)} · ${upg.desc}</small></span>
        <button class="btn buy" ${maxed || qty <= 0 || gameState.sync.balance < cost ? 'disabled' : ''}>${maxed ? 'Max' : `${qty} · ${GameMath.formatMoney(cost)}`}</button>
      `;
      row.querySelector('button').addEventListener('click', () => buyUpgrade(upg.id, qty, cost));
      section.appendChild(row);
    }
    host.appendChild(section);
  }
}

function buyQuantity(upgradeId, currentLevel) {
  const upg = GameMath.upgrades[upgradeId];
  if (buyMode === 'max') return GameMath.maxAffordableLevels(upgradeId, currentLevel, gameState.sync.balance);
  const desired = Number(buyMode);
  if (upg.maxLevel === null) return desired;
  return Math.max(0, Math.min(desired, upg.maxLevel - currentLevel));
}

async function buyUpgrade(upgradeId, qty, cost) {
  if (qty <= 0 || gameState.sync.balance < cost) return;
  const entry = gameState.local.domainLibrary[currentDomain];
  gameState.sync.balance -= cost;
  entry.upgrades[upgradeId] = (entry.upgrades[upgradeId] || 0) + qty;
  await saveAndRefresh();
  renderDetail();
}

async function assignDomainToSlot(domain, slotId, fromLibrary = false) {
  const slot = gameState.sync.slots.find(item => item.id === slotId);
  if (!slot) return;
  const normalized = StorageManager.normalizeDomain(domain);
  if (!normalized) return;
  const duplicate = gameState.sync.slots.find(item => item.assignedDomain === normalized && item.id !== slotId);
  if (duplicate) {
    alert(`${normalized} is already in Slot ${duplicate.id}.`);
    return;
  }

  const today = StorageManager.todayKey();
  const outgoing = slot.assignedDomain;
  const consumesSwap = fromLibrary && outgoing && !gameState.sync.slots.some(item => item.assignedDomain === normalized);
  if (consumesSwap && slot.slotSwapUsedOnDate === today) {
    alert('This slot already used its library swap today.');
    return;
  }

  if (outgoing && gameState.local.domainLibrary[outgoing]) {
    const previous = gameState.local.domainLibrary[outgoing];
    previous.isSlotted = false;
    previous.slotId = null;
    previous.vaultAmount = 0;
    previous.currentStreak = 0;
  }

  const entry = StorageManager.ensureDomain(gameState.local, normalized);
  entry.isSlotted = true;
  entry.slotId = slot.id;
  entry.vaultAmount = consumesSwap ? 0 : entry.vaultAmount;
  entry.insertedOnDate = consumesSwap ? today : entry.insertedOnDate;
  slot.assignedDomain = normalized;
  if (consumesSwap) slot.slotSwapUsedOnDate = today;
  await saveAndRefresh();
  switchView('mainView');
  renderMain();
}

async function removeCurrentSlot() {
  const slot = gameState.sync.slots.find(item => item.id === currentSlotId);
  if (!slot?.assignedDomain) return;
  const entry = gameState.local.domainLibrary[slot.assignedDomain];
  entry.isSlotted = false;
  entry.slotId = null;
  entry.vaultAmount = 0;
  entry.currentStreak = 0;
  slot.assignedDomain = null;
  await saveAndRefresh();
  switchView('mainView');
  renderMain();
}

async function unlockNextSlot() {
  const nextSlot = gameState.sync.unlockedSlots + 1;
  const cost = GameMath.calculateSlotUnlockCost(nextSlot);
  if (gameState.sync.balance < cost) return;
  gameState.sync.balance -= cost;
  gameState.sync.unlockedSlots = nextSlot;
  gameState.sync.slots.push({ id: nextSlot, tier: 0, streakBonusTier: 0, assignedDomain: null, slotSwapUsedOnDate: null });
  await saveAndRefresh();
  renderMain();
}

async function clearCache() {
  const award = GameMath.calculatePrestigeAward(gameState.sync.totalLifetimeEarned, gameState.sync.cpAlreadyClaimedFromLifetime);
  if (award <= 0 || !confirm(`Clear Cache for ${award} CP?`)) return;
  gameState.sync.cachePoints += award;
  gameState.sync.cpAlreadyClaimedFromLifetime += award;
  gameState.sync.balance = 0;
  gameState.sync.prestigeCount += 1;
  for (const entry of Object.values(gameState.local.domainLibrary)) {
    entry.upgrades = {};
    entry.vaultAmount = 0;
    entry.dailyBonusClaimedDate = null;
    entry.currentStreak = 0;
  }
  await saveAndRefresh();
  renderMain();
}

async function upgradeSlotTier() {
  const slot = gameState.sync.slots.find(item => item.id === currentSlotId);
  const nextTier = slot.tier + 1;
  const cost = GameMath.calculatePrestigeCost(nextTier);
  if (gameState.sync.cachePoints < cost || nextTier > 5) return;
  gameState.sync.cachePoints -= cost;
  slot.tier = nextTier;
  await saveAndRefresh();
  renderDetail();
}

async function saveAndRefresh() {
  await Promise.all([
    StorageManager.saveSyncState(gameState.sync),
    StorageManager.saveLocalState(gameState.local)
  ]);
  await settleAndLoad();
}

function setupEvents() {
  byId('finishTutorialBtn').addEventListener('click', async () => {
    gameState.local.tutorialCompleted = true;
    await StorageManager.saveLocalState(gameState.local);
    byId('tutorialOverlay').classList.add('hidden');
  });
  byId('openLibraryBtn').addEventListener('click', () => { renderLibrary(); switchView('libraryView'); });
  byId('backFromLibraryBtn').addEventListener('click', () => { renderMain(); switchView('mainView'); });
  byId('backFromPickerBtn').addEventListener('click', () => { renderMain(); switchView('mainView'); });
  byId('backFromDetailBtn').addEventListener('click', () => { renderMain(); switchView('mainView'); });
  byId('pickerSearchInput').addEventListener('input', renderPickerLibrary);
  byId('librarySearchInput').addEventListener('input', renderLibrary);
  byId('addCurrentSiteBtn').addEventListener('click', async () => {
    const domain = await currentTabDomain();
    if (domain) assignDomainToSlot(domain, currentSlotId, false);
  });
  byId('swapSlotBtn').addEventListener('click', () => openPicker(currentSlotId));
  byId('removeSlotBtn').addEventListener('click', removeCurrentSlot);
  byId('clearCacheBtn').addEventListener('click', clearCache);
  byId('upgradeTierBtn').addEventListener('click', upgradeSlotTier);
  byId('buyMode').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    buyMode = button.dataset.mode;
    byId('buyMode').querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
    renderDetail();
  });
}

async function init() {
  await settleAndLoad();
  setupEvents();
  if (!gameState.local.tutorialCompleted) byId('tutorialOverlay').classList.remove('hidden');
  renderMain();
}

document.addEventListener('DOMContentLoaded', init);
