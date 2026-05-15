const app = document.getElementById("app");
let snapshot = null;
let route = { name: "home" };
let buyMode = "1";
let toast = "";
let toastType = "success";
let search = "";
let liveBaseBalance = 0;
let liveBaseAt = Date.now();
let liveIncomePerSecond = 0;
let tickerStarted = false;
let lastRenderedRouteKey = "";
let toastTimer = null;
let modal = null;
let collectBurst = null;
let collectBurstTimer = null;

const iconPath = (index) => `icons/Icon14_${String(index).padStart(2, "0")}.png`;
const BUY_MODES = ["1", "10"];
const {
  BASE_RATE,
  TRAFFIC_ENGINE_MULTIPLIER,
  toSci,
  sciToNumber,
  sciCompare,
  sciAdd,
  sciSub,
  prestigeTotalFromLifetime,
  cacheCoreMultiplier,
  cacheCoreCost,
  getUpgradeLevel: upgradeLevel,
  upgradeCost,
  slotTierBonus,
  slotTierCost: mathSlotTierCost,
  vaultCap: mathVaultCap,
  vaultRate: mathVaultRate,
  domainBaseRate: mathDomainBaseRate,
  tabMultiplier,
  focusMultiplier,
  vaultPumpMultiplier,
  dailyBootMultiplier,
  activeIncomePerSecond: mathActiveIncomePerSecond,
  backgroundIncomePerSecond: mathBackgroundIncomePerSecond,
  dailyFirstOpenBonus: mathDailyFirstOpenBonus,
  dailyFirstOpenBonusForStreak: mathDailyFirstOpenBonusForStreak,
  navigationPayoutForLevel: mathNavigationPayoutForLevel,
  wakeBurstForLevel: mathWakeBurstForLevel
} = BrowserTycoonMath;

function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

async function refresh({ full = false } = {}) {
  snapshot = await send("snapshot");
  syncWelcomeBackModal();
  resetLiveTickerBaseline();
  if (full || !lastRenderedRouteKey) {
    render();
  } else {
    patchDynamicFields();
  }
}

function resetLiveTickerBaseline() {
  liveBaseBalance = visibleBalance(snapshot?.sync?.balance || 0);
  liveBaseAt = Date.now();
  liveIncomePerSecond = pendingWelcomeBack() ? 0 : Number(snapshot?.incomePerSecond || 0);
}

function liveBalance() {
  return sciAdd(liveBaseBalance, ((Date.now() - liveBaseAt) / 1000) * liveIncomePerSecond);
}

function startLiveTicker() {
  if (tickerStarted) return;
  tickerStarted = true;
  setInterval(() => {
    if (!snapshot) return;
    setText("balance", money(liveBalance()));
    setText("income", `+${money(liveIncomePerSecond)}/sec`);
    patchAffordability(liveBalance());
  }, 250);
}

function setText(field, value) {
  app.querySelectorAll(`[data-field="${field}"]`).forEach((node) => {
    if (node.textContent !== String(value)) node.textContent = value;
  });
}

function setDisabled(selector, disabled) {
  app.querySelectorAll(selector).forEach((node) => {
    node.disabled = disabled;
  });
}

function patchDynamicFields() {
  if (!snapshot) return;
  setText("balance", money(liveBalance()));
  setText("income", `+${money(liveIncomePerSecond)}/sec`);
  setText("cacheCredits", String(Math.floor(snapshot.sync.cacheCredits)));
  setText("cacheCoreLevel", String(cacheCoreLevel()));
  patchSlots();
  patchDetail();
  patchLibraryList();
  patchLibrarySummary();
  patchAffordability(liveBalance());
}

function pendingWelcomeBack() {
  return snapshot?.welcomeBack && sciCompare(snapshot.welcomeBack.total, 0) > 0 ? snapshot.welcomeBack : null;
}

function visibleBalance(balance = snapshot?.sync?.balance || 0) {
  const welcomeBack = pendingWelcomeBack();
  return welcomeBack ? sciSub(balance, welcomeBack.total) : toSci(balance);
}

function syncWelcomeBackModal() {
  if (snapshot?.welcomeBack && sciCompare(snapshot.welcomeBack.total, 0) > 0) {
    modal = { name: "welcomeBack" };
  } else if (modal?.name === "welcomeBack") {
    modal = null;
  }
}

function patchLibraryList() {
  if (!["library", "picker"].includes(route.name)) return;
  const list = app.querySelector("[data-library-list]");
  if (!list) return;
  const pickSlotId = route.name === "picker" ? route.slotId : null;
  const domains = filteredLibraryDomains(pickSlotId);
  list.innerHTML = domains.length
    ? domains.map((entry) => renderLibraryItem(entry, pickSlotId)).join("")
    : `<div class="library-item">NO DOMAINS IN LIBRARY YET</div>`;
  list.querySelectorAll("[data-action]").forEach((node) => {
    node.addEventListener("click", handleAction);
  });
}

function patchSlots() {
  for (const slot of snapshot.sync.slots) {
    if (!slot.assignedDomain) continue;
    const domain = slot.assignedDomain;
    const entry = entryFor(domain);
    const state = stateLabel(domain);
    setText(`slot:${domain}:state`, state.text);
    const stateNode = app.querySelector(`[data-field="slot:${domain}:state"]`);
    if (stateNode) stateNode.className = `slot-state ${state.className}`;
    setText(`slot:${domain}:income`, money(incomeFor(domain)));
    setText(`slot:${domain}:vault`, money(entry?.vaultAmount || 0));
    setText(`slot:${domain}:streak`, String(displayStreak(entry)));
    const streakNode = app.querySelector(`[data-field="slot:${domain}:streakBadge"]`);
    if (streakNode) streakNode.className = `slot-streak ${streakDoneToday(entry) ? "active" : "inactive"}`;
    const readyNode = app.querySelector(`[data-field="slot:${domain}:ready"]`);
    if (readyNode) {
      const vaultReady = sciCompare(entry?.vaultAmount || 0, 0) > 0;
      readyNode.hidden = !vaultReady;
    }
  }
}

function patchDetail() {
  if (route.name !== "detail") return;
  const domain = route.domain;
  const entry = entryFor(domain);
  if (!entry) return;
  const state = stateLabel(domain);
  setText("detailVault", money(entry.vaultAmount));
  setText("detailVaultCap", money(vaultCap(entry)));
  setText("detailVaultRate", `${money(vaultRate(entry))}/sec`);
  setText("detailState", state.text);
  setText("detailIncome", `${money(incomeFor(domain))}/sec`);
  setText("detailBaseIncome", `${money(domainBaseRate(entry))}/sec`);
  setText("detailSlotMultiplier", `x${tierBonus(currentSlot(domain)).toFixed(2)}`);
  setText("detailStreak", String(displayStreak(entry)));
  setText("detailLastVisit", dateAgo(entry.lastVisited));
  setDisabled(`[data-action="claim"][data-domain="${CSS.escape(domain)}"]`, sciCompare(entry.vaultAmount, 0) <= 0);
}

function patchLibrarySummary() {
  if (route.name !== "domainSummary") return;
  const entry = entryFor(route.domain);
  if (!entry) return;
  setText("summaryStatus", entry.isSlotted ? `SLOT ${entry.slotId}` : "LIBRARY");
  setText("summaryLifetime", money(entry.lifetimeEarned));
  setText("summaryVault", money(entry.vaultAmount));
  setText("summaryStreak", String(displayStreak(entry)));
  setText("summaryLastVisit", dateAgo(entry.lastVisited));
}

function patchAffordability(displayBalance = snapshot?.sync?.balance || 0) {
  const balance = toSci(displayBalance || 0);
  setDisabled("[data-action='unlock']", sciCompare(balance, snapshot.nextSlotCost) < 0);
  app.querySelectorAll("[data-action='tier'][data-slot]").forEach((button) => {
    const slot = snapshot.sync.slots.find((item) => item.id === Number(button.dataset.slot));
    const nextTier = slot ? nextSlotTier(slot) : null;
    button.disabled = !nextTier || snapshot.sync.cacheCredits < slotTierCost(slot, nextTier);
  });
  app.querySelectorAll("[data-action='upgradeCacheCore']").forEach((button) => {
    button.disabled = snapshot.sync.cacheCredits < cacheCoreCost(cacheCoreLevel());
  });
  app.querySelectorAll("[data-action='buy'][data-upgrade][data-domain]").forEach((button) => {
    const entry = entryFor(button.dataset.domain);
    const def = snapshot.upgradeDefs.find((upgrade) => upgrade.id === button.dataset.upgrade);
    if (!entry || !def) return;
    const level = upgradeLevel(entry, def.id);
    const maxed = def.maxLevel !== null && level >= def.maxLevel;
    button.disabled = maxed || sciCompare(balance, upgradeBulkCost(def, level, selectedBuyQuantity())) < 0;
  });
}

function money(value) {
  const suffixes = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
  const sci = toSci(value);
  if (sci.m === 0) return "$0.00";
  if (sci.e < 3) return `$${sciToNumber(sci).toFixed(2)}`;
  const suffix = Math.floor(sci.e / 3);
  if (suffix >= 0 && suffix < suffixes.length) {
    const amount = sci.m * Math.pow(10, sci.e - suffix * 3);
    return `$${amount.toFixed(suffix === 0 ? 2 : 2)}${suffixes[suffix]}`;
  }
  return `$${sci.m.toFixed(2)}e${sci.e}`;
}

function dateAgo(value) {
  if (!value) return "NEVER";
  const mins = Math.floor((Date.now() - value) / 60000);
  if (mins < 1) return "NOW";
  if (mins < 60) return `${mins}M AGO`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}H AGO`;
  return `${Math.floor(hours / 24)}D AGO`;
}

function entryFor(domain) {
  return snapshot.local.domainLibrary[domain];
}

function currentSlot(domain) {
  return snapshot.sync.slots.find((slot) => slot.assignedDomain === domain);
}

function tierBonus(slot) {
  return slotTierBonus(slot);
}

function tierName(tier) {
  return ["0", "I", "II", "III", "IV", "V"][tier] || String(tier);
}

function tierMaterial(tier) {
  return ["STANDARD", "BRONZE", "SILVER", "GOLD", "PLATINUM", "PRISMATIC"][tier] || `TIER ${tier}`;
}

function tierClass(tier) {
  return `slot-tier-${Math.max(0, Math.min(Number(tier) || 0, 5))}`;
}

function nextSlotTier(slot) {
  return snapshot.slotTiers.find((tier) => tier.tier === slot.tier + 1);
}

function slotTierCost(slot, tier) {
  return mathSlotTierCost(slot?.id, tier);
}

function selectedBuyQuantity() {
  return buyMode === "10" ? 10 : 1;
}

function upgradeBulkCost(def, level, quantity = selectedBuyQuantity()) {
  let total = 0;
  for (let offset = 0; offset < quantity; offset += 1) {
    const nextLevel = level + offset;
    if (def.maxLevel !== null && nextLevel >= def.maxLevel) break;
    total += upgradeCost(def, nextLevel);
  }
  return total;
}

function upgradeTargetLevel(def, level, quantity = selectedBuyQuantity()) {
  if (def.maxLevel === null) return level + quantity;
  return Math.min(def.maxLevel, level + quantity);
}

function cacheCoreLevel() {
  return Number(snapshot?.sync?.cacheCoreLevel || 0);
}

function cacheCoreBaseRate(level = cacheCoreLevel()) {
  return BASE_RATE * cacheCoreMultiplier(level);
}

function domainBaseRate(entry) {
  return mathDomainBaseRate(entry, cacheCoreLevel());
}

function vaultCap(entry, coldLevel) {
  return mathVaultCap(entry, coldLevel, cacheCoreLevel());
}

function vaultRate(entry, storageLevel) {
  return mathVaultRate(entry, storageLevel, cacheCoreLevel());
}

function activeIncomeEstimate(entry, slot) {
  return mathActiveIncomePerSecond(entry, slot, cacheCoreLevel());
}

function backgroundIncomePerSecond(entry, slot, backgroundSince, now) {
  return mathBackgroundIncomePerSecond(entry, slot, backgroundSince, now, cacheCoreLevel());
}

function dailyFirstOpenBonus(entry, slot) {
  return mathDailyFirstOpenBonus(entry, slot, cacheCoreLevel());
}

function dailyFirstOpenBonusForStreak(entry, slot, streak) {
  return mathDailyFirstOpenBonusForStreak(entry, slot, streak, cacheCoreLevel());
}

function navigationPayoutForLevel(entry, slot, level) {
  return mathNavigationPayoutForLevel(entry, slot, level, cacheCoreLevel());
}

function wakeBurstForLevel(entry, slot, level) {
  return mathWakeBurstForLevel(entry, slot, level, cacheCoreLevel());
}

function streakDoneToday(entry) {
  return visitDate(entry) === snapshot.today;
}

function displayStreak(entry) {
  const streak = Number(entry?.currentStreak || 0);
  return streakDoneToday(entry) ? Math.max(1, streak) : streak;
}

function visitDate(entry) {
  return entry?.lastVisited ? new Date(entry.lastVisited).toLocaleDateString("en-CA") : null;
}

function backgroundIncomeEstimate(entry, slot, idleSeconds) {
  const now = Date.now();
  return backgroundIncomePerSecond(entry, slot, now - idleSeconds * 1000, now);
}

function incomeFor(domain) {
  if (snapshot?.slotIncomes && domain in snapshot.slotIncomes) {
    return Number(snapshot.slotIncomes[domain] || 0);
  }
  const entry = entryFor(domain);
  const slot = currentSlot(domain);
  const presence = snapshot.local.presence[domain];
  if (!entry || !slot || !presence) return 0;
  if (presence.state === "active") {
    return activeIncomeEstimate(entry, slot);
  }
  if (presence.state === "background") {
    return backgroundIncomeEstimate(entry, slot, Math.max(0, (Date.now() - (presence.backgroundSince || Date.now())) / 1000));
  }
  return 0;
}

function stateLabel(domain) {
  const state = snapshot.local.presence[domain]?.state || "closed";
  if (state === "active") return { text: "[FOCUSED]", className: "focused" };
  if (state === "background") return { text: "[BACKGROUND]", className: "background" };
  return { text: "[INACTIVE]", className: "closed" };
}

function currentRateTooltip(domain, entry, slot) {
  const presence = snapshot.local.presence[domain];
  const base = money(domainBaseRate(entry));
  const tab = tabMultiplier(upgradeLevel(entry, "tabMultiplier")).toFixed(2);
  const tier = tierBonus(slot).toFixed(2);
  if (presence?.state === "active") {
    const focus = focusMultiplier(upgradeLevel(entry, "focusBonus")).toFixed(2);
    return `Focused rate = base income (${base}/sec) x tab multiplier (${tab}) x focus bonus (${focus}) x slot multiplier (${tier}).`;
  }
  if (presence?.state === "background") {
    const hum = (0.08 * upgradeLevel(entry, "backgroundHum")).toFixed(2);
    const idleSeconds = Math.max(0, (Date.now() - (presence.backgroundSince || Date.now())) / 1000);
    const idle = (1 + 0.1 * upgradeLevel(entry, "idleDepth") * Math.min(idleSeconds / 300, 5)).toFixed(2);
    return `Background rate = base income (${base}/sec) x tab multiplier (${tab}) x background hum (${hum}) x idle depth (currently ${idle}) x slot multiplier (${tier}).`;
  }
  return "Inactive: this domain is not currently open as a focused or background tab, so its current rate is $0.00/sec.";
}

function favicon(domain, className = "slot-icon") {
  return `<img class="${className}" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64" alt="" onerror="this.src='${iconPath(1)}'">`;
}

function shell(content, activeNav = "slots") {
  const previousRouteKey = lastRenderedRouteKey;
  const nextRouteKey = routeKey();
  const scrollTop = previousRouteKey === nextRouteKey ? app.querySelector(".view")?.scrollTop || 0 : 0;
  app.innerHTML = `
    ${renderHeader()}
    ${content}
    ${renderFooter(activeNav)}
    ${renderModal()}
    ${toast ? `<div class="toast toast-${toastType}">${toast}</div>` : ""}
  `;
  app.querySelectorAll("[data-action]").forEach((node) => {
    node.addEventListener("click", handleAction);
  });
  const searchNode = app.querySelector("[data-search]");
  if (searchNode) {
    searchNode.value = search;
    searchNode.addEventListener("input", (event) => {
      search = event.target.value;
      patchLibraryList();
    });
  }
  lastRenderedRouteKey = nextRouteKey;
  if (scrollTop) {
    requestAnimationFrame(() => {
      const view = app.querySelector(".view");
      if (view) view.scrollTop = scrollTop;
    });
  }
  patchDynamicFields();
}

function renderModal() {
  if (modal?.name === "welcomeBack") return renderWelcomeBackModal();
  if (modal?.name === "slotUpgradeList") return renderSlotUpgradeListModal();
  if (modal?.name === "slotUpgradeDetail") return renderSlotUpgradeDetailModal(modal.slotId);
  if (modal?.name === "swapDomain") return renderSwapDomainModal();
  if (modal?.name === "domainDetails") return renderDomainDetailsModal(modal.domain, modal.source);
  if (modal?.name === "cacheCore") return renderCacheCoreModal();
  if (modal?.name === "confirm") return renderConfirmModal();
  if (modal !== "prestige") return "";
  const award = prestigeAwardEstimate();
  return `
    <div class="modal-scrim" role="presentation">
      <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="prestigeTitle">
        <div class="modal-kicker">PRESTIGE RESET</div>
        <h2 id="prestigeTitle">CLEAR CACHE?</h2>
        <p>Reset cash, upgrades, vaults, and streaks. Slot prestige tiers stay, and tiered slots remain permanently unlocked.</p>
        <div class="modal-reward">
          <span>CACHE CREDITS</span>
          <strong>+${award} CC</strong>
        </div>
        <div class="modal-actions">
          <button class="btn" data-action="cancelModal">CANCEL</button>
          <button class="btn btn-prestige" data-action="confirmPrestige">CLEAR CACHE</button>
        </div>
      </section>
    </div>
  `;
}

function renderCacheCoreModal() {
  const level = cacheCoreLevel();
  const cost = cacheCoreCost(level);
  const affordable = snapshot.sync.cacheCredits >= cost;
  return `
    <div class="modal-scrim" role="presentation">
      <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="cacheCoreTitle">
        <div class="modal-kicker">PERMANENT UPGRADE</div>
        <h2 id="cacheCoreTitle">CACHE CORE</h2>
        <p>${cacheCoreTooltip()}</p>
        <div class="modal-reward">
          <span>GLOBAL BASE RATE</span>
          <strong>${money(cacheCoreBaseRate(level))}/sec -> ${money(cacheCoreBaseRate(level + 1))}/sec</strong>
        </div>
        <div class="detail-stat-section">
          <div class="detail-stat-row">
            <span>LEVEL</span>
            <strong data-field="cacheCoreLevel">${level}</strong>
          </div>
          <div class="detail-stat-row">
            <span>NEXT COST</span>
            <strong>${cost} CC</strong>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" data-action="cancelModal">CLOSE</button>
          <button class="btn btn-prestige" data-action="upgradeCacheCore" ${affordable ? "" : "disabled"}>UPGRADE</button>
        </div>
      </section>
    </div>
  `;
}

function cacheCoreTooltip() {
  return "Raises the base rate for every domain before tab, focus, background, vault, daily, navigation, wake, and slot tier multipliers. Small base-rate gains compound through the whole game.";
}

function renderSlotUpgradeListModal() {
  return `
    <div class="modal-scrim" role="presentation">
      <section class="modal-panel slot-upgrade-modal" role="dialog" aria-modal="true" aria-labelledby="slotUpgradeTitle">
        <div class="modal-kicker">SLOT PRESTIGE</div>
        <h2 id="slotUpgradeTitle">UPGRADE SLOTS</h2>
        <div class="slot-upgrade-grid">
          ${snapshot.sync.slots.map(renderSlotUpgradeOption).join("")}
        </div>
        <div class="modal-actions single">
          <button class="btn" data-action="cancelModal">CLOSE</button>
        </div>
      </section>
    </div>
  `;
}

function renderSlotUpgradeOption(slot) {
  const nextTier = nextSlotTier(slot);
  const cost = nextTier ? slotTierCost(slot, nextTier) : null;
  const disabled = !nextTier;
  return `
    <button class="slot-upgrade-option ${tierClass(slot.tier)}" data-action="slotUpgradeDetail" data-slot="${slot.id}" ${disabled ? "disabled" : ""}>
      <div class="slot-upgrade-bg">${slot.assignedDomain || "EMPTY SLOT"}</div>
      <div class="slot-upgrade-top">
        <span>SLOT ${slot.id}</span>
        <strong>${disabled ? "MAX" : `${cost} CC`}</strong>
      </div>
      <div class="slot-upgrade-tier">TIER ${tierName(slot.tier)}</div>
    </button>
  `;
}

function renderSlotUpgradeDetailModal(slotId) {
  const slot = snapshot.sync.slots.find((item) => item.id === Number(slotId));
  if (!slot) return "";
  const nextTier = nextSlotTier(slot);
  const cost = nextTier ? slotTierCost(slot, nextTier) : null;
  const affordable = nextTier && snapshot.sync.cacheCredits >= cost;
  return `
    <div class="modal-scrim" role="presentation">
      <section class="modal-panel slot-upgrade-modal" role="dialog" aria-modal="true" aria-labelledby="slotUpgradeDetailTitle">
        <div class="modal-kicker">SLOT ${slot.id}</div>
        <h2 id="slotUpgradeDetailTitle">${nextTier ? "CONFIRM UPGRADE" : "SLOT MAXED"}</h2>
        <div class="slot-upgrade-compare">
          ${renderSlotUpgradePreview(slot, slot.tier)}
          <div class="slot-upgrade-arrow">↓</div>
          ${nextTier ? renderSlotUpgradePreview(slot, nextTier.tier) : `<div class="slot-upgrade-max">MAX PRESTIGE</div>`}
        </div>
        <div class="detail-stat-section">
          <div class="detail-stat-row">
            <span>UPGRADE</span>
            <strong>${nextTier ? slotTierUpgradeSummary(slot, nextTier) : "MAX"}</strong>
          </div>
          <div class="detail-stat-row">
            <span>COST</span>
            <strong>${nextTier ? `${cost} CC` : "MAX"}</strong>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" data-action="slotUpgradeList">BACK</button>
          <button class="btn btn-prestige" data-action="confirmSlotUpgrade" data-slot="${slot.id}" ${affordable ? "" : "disabled"}>${nextTier ? "CONFIRM" : "MAX"}</button>
        </div>
      </section>
    </div>
  `;
}

function slotTierUpgradeSummary(slot, nextTier) {
  const currentBonus = tierBonus(slot).toFixed(2);
  const nextBonus = tierBonus({ ...slot, tier: nextTier.tier }).toFixed(2);
  const unlock = slot.id > 3 && slot.tier === 0 && nextTier.tier === 1;
  const baseChange = `SLOT INCOME x${currentBonus} -> x${nextBonus}`;
  return unlock ? `PERMANENT UNLOCK +<br>${baseChange}` : baseChange;
}

function renderSlotUpgradePreview(slot, tier) {
  return `
    <div class="slot-upgrade-preview ${tierClass(tier)}">
      <div class="slot-upgrade-bg">${slot.assignedDomain || "EMPTY SLOT"}</div>
      <div class="slot-upgrade-top">
        <span>SLOT ${slot.id}</span>
      </div>
      <div class="slot-upgrade-tier">TIER ${tierName(tier)}</div>
    </div>
  `;
}

function floorToCent(value) {
  const number = sciToNumber(toSci(value || 0));
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.floor(number * 100) / 100;
}

function welcomeBreakdownItems(award) {
  return [
    ["FOCUS INCOME", award.focus],
    ["BACKGROUND INCOME", award.background],
    ["DAILY FIRST-OPEN", award.daily],
    ["NAVIGATION BONUS", award.navigation],
    ["WAKE BURSTS", award.wake],
    ["OTHER INCOME", award.other]
  ]
    .map(([label, value]) => [label, floorToCent(value)])
    .filter(([, value]) => value > 0);
}

function welcomeBreakdownRows(items) {
  return items
    .map(([label, value]) => `
      <div>
        <span class="welcome-label">
          ${label}
          ${label === "OTHER INCOME" ? `
            <span class="help-icon" data-tooltip="Includes any positive balance gained while the popup was closed that could not be matched to focus, background, daily first-open, navigation, or wake income.">?</span>
          ` : ""}
        </span>
        <strong>${money(value)}</strong>
      </div>
    `)
    .join("");
}

function renderWelcomeBackModal() {
  const award = pendingWelcomeBack();
  if (!award) return "";
  const items = welcomeBreakdownItems(award);
  const rows = welcomeBreakdownRows(items);
  const displayTotal = items.reduce((sum, [, value]) => sum + value, 0);
  return `
    <div class="modal-scrim" role="presentation">
      <section class="modal-panel welcome-back-modal" role="dialog" aria-modal="true" aria-labelledby="welcomeBackTitle">
        <div class="modal-kicker">WELCOME BACK</div>
        <h2 id="welcomeBackTitle">CACHE ACCRUED</h2>
        <p>Your active slots kept generating while the popup was closed.</p>
        <div class="welcome-breakdown">
          ${rows || `
            <div>
              <span>INCOME</span>
              <strong>${money(floorToCent(award.total))}</strong>
            </div>
          `}
          <div class="welcome-total">
            <span>TOTAL EARNED</span>
            <strong>${money(rows ? displayTotal : floorToCent(award.total))}</strong>
          </div>
        </div>
        <div class="modal-actions single">
          <button class="btn btn-collect" data-action="collectWelcomeBack">COLLECT</button>
        </div>
      </section>
    </div>
  `;
}

function renderConfirmModal() {
  const variantClass = modal.variant ? ` modal-${modal.variant}` : "";
  return `
    <div class="modal-scrim" role="presentation">
      <section class="modal-panel${variantClass}" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
        <div class="modal-kicker">${modal.kicker || "CONFIRM ACTION"}</div>
        <h2 id="confirmTitle">${modal.title}</h2>
        <p>${modal.body}</p>
        ${modal.reward ? `
          <div class="modal-reward">
            <span>${modal.reward.label}</span>
            <strong>${modal.reward.value}</strong>
          </div>
        ` : ""}
        <div class="modal-actions">
          <button class="btn" data-action="cancelModal">CANCEL</button>
          <button class="btn ${modal.variant === "danger" ? "btn-danger modal-danger-btn" : "btn-prestige"}" data-action="confirmModal">${modal.confirmLabel || "CONFIRM"}</button>
        </div>
      </section>
    </div>
  `;
}

function renderSwapDomainModal() {
  const sourceSlot = snapshot.sync.slots.find((slot) => slot.id === Number(modal.sourceSlotId));
  const targetSlot = snapshot.sync.slots.find((slot) => slot.id === Number(modal.targetSlotId));
  const sourceDomain = sourceSlot?.assignedDomain || modal.sourceDomain;
  const targetDomain = targetSlot?.assignedDomain || "EMPTY";
  return `
    <div class="modal-scrim" role="presentation">
      <section class="modal-panel swap-modal" role="dialog" aria-modal="true" aria-labelledby="swapTitle">
        <div class="modal-kicker">DOMAIN SWAP</div>
        <h2 id="swapTitle">SWAP SLOTS?</h2>
        <div class="swap-diagram">
          <div class="swap-card">
            <span>${targetDomain}</span>
            <strong>SLOT ${modal.targetSlotId}</strong>
          </div>
          <div class="swap-arrow">⇄</div>
          <div class="swap-card">
            <span>${sourceDomain}</span>
            <strong>SLOT ${modal.sourceSlotId}</strong>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" data-action="cancelModal">CANCEL</button>
          <button class="btn btn-prestige" data-action="confirmSwapDomain">CONFIRM</button>
        </div>
      </section>
    </div>
  `;
}

function renderLibraryDomainInfo(entry) {
  return renderDetailStatSection("LIBRARY INFO", [
    ["Status", entry.isSlotted ? `SLOT ${entry.slotId}` : "LIBRARY"],
    ["Lifetime", money(entry.lifetimeEarned)],
    ["Vault", money(entry.vaultAmount)],
    ["Streak", String(displayStreak(entry))],
    ["Last Visit", dateAgo(entry.lastVisited)]
  ]);
}

function renderDomainDetailsModal(domain, source = "slot") {
  const entry = entryFor(domain);
  const slot = currentSlot(domain);
  if (!entry) return "";
  const fromLibrary = source === "library";
  if (!slot) {
    return `
      <div class="modal-scrim" role="presentation">
        <section class="modal-panel detail-modal" role="dialog" aria-modal="true" aria-labelledby="domainDetailsTitle">
          <div class="modal-kicker">DOMAIN DETAILS</div>
          <h2 id="domainDetailsTitle">${domain.toUpperCase()}</h2>
          <div class="detail-grid">
            ${fromLibrary ? renderLibraryDomainInfo(entry) : ""}
            ${renderDetailStatSection("DOMAIN EARNING", [
              ["Status", "ASSIGN TO A SLOT"],
              ["Focused", "LOCKED"],
              ["Background", "LOCKED"],
              ["Vault", money(entry.vaultAmount)]
            ])}
          </div>
          <div class="modal-actions single">
            <button class="btn btn-prestige" data-action="cancelModal">CLOSE</button>
          </div>
        </section>
      </div>
    `;
  }
  const currentStreak = Number(entry.currentStreak || 0);
  const nextStreak = Math.min(currentStreak + 1, 14);
  const navLevel = upgradeLevel(entry, "navigationBonus");
  const wakeLevel = upgradeLevel(entry, "wakeBonus");
  return `
    <div class="modal-scrim" role="presentation">
      <section class="modal-panel detail-modal" role="dialog" aria-modal="true" aria-labelledby="domainDetailsTitle">
        <div class="modal-kicker">DOMAIN DETAILS</div>
        <h2 id="domainDetailsTitle">${domain.toUpperCase()}</h2>
        <div class="detail-grid">
          ${fromLibrary ? renderLibraryDomainInfo(entry) : ""}
          ${renderDetailStatSection("RATES", [
            ["Focused", `${money(activeIncomeEstimate(entry, slot))}/sec`],
            ["Background", `${money(backgroundIncomeEstimate(entry, slot, 0))}/sec`],
            ["Background Max Idle", `${money(backgroundIncomeEstimate(entry, slot, 1500))}/sec`],
            ["Inactive", "$0.00/sec"]
          ])}
          ${renderDetailStatSection("EVENT BONUSES", [
            ["Navigation", navLevel > 0 ? money(navigationPayoutForLevel(entry, slot, navLevel)) : "LOCKED"],
            ["Wake Burst", wakeLevel > 0 ? money(wakeBurstForLevel(entry, slot, wakeLevel)) : "LOCKED"]
          ])}
          ${renderDetailStatSection("VAULT + STREAK", [
            ["Vault Stored", money(entry.vaultAmount)],
            ["Vault Cap", money(vaultCap(entry))],
            ["Vault Fill", `${money(vaultRate(entry))}/sec`],
            ["Daily First-Open", money(dailyFirstOpenBonus(entry, slot))],
            ["Next Streak Mult", `x${(1 + nextStreak * 0.05 + upgradeLevel(entry, "dailyBoot") * nextStreak * 0.01).toFixed(2)}`],
            ["Next Daily Bonus", money(dailyFirstOpenBonusForStreak(entry, slot, nextStreak))]
          ])}
          ${renderDetailStatSection("MULTIPLIERS", [
            ["Base Income", `${money(domainBaseRate(entry))}/sec`],
            ["Slot Tier", `x${tierBonus(slot).toFixed(2)}`],
            ["Tab", `x${tabMultiplier(upgradeLevel(entry, "tabMultiplier")).toFixed(2)}`],
            ["Focus", `x${focusMultiplier(upgradeLevel(entry, "focusBonus")).toFixed(2)}`],
            ["Daily Boot", `x${dailyBootMultiplier(upgradeLevel(entry, "dailyBoot")).toFixed(2)}`],
            ["Vault Pump", `x${vaultPumpMultiplier(upgradeLevel(entry, "storageDuration")).toFixed(2)}`]
          ])}
        </div>
        <div class="modal-actions single">
          <button class="btn btn-prestige" data-action="cancelModal">CLOSE</button>
        </div>
      </section>
    </div>
  `;
}

function renderDetailStatSection(title, rows) {
  return `
    <div class="detail-stat-section">
      <div class="detail-stat-heading">${title}</div>
      ${rows.map(([label, value]) => `
        <div class="detail-stat-row">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function prestigeAwardEstimate() {
  return Math.max(0, prestigeTotalFromLifetime(snapshot.sync.totalLifetimeEarned) - Number(snapshot.sync.ccAlreadyClaimedFromLifetime || 0));
}

function renderToast() {
  const existing = app.querySelector(".toast");
  if (existing) existing.remove();
  if (!toast) return;
  app.insertAdjacentHTML("beforeend", `<div class="toast toast-${toastType}">${toast}</div>`);
}

function showToast(message, type = "success") {
  toast = message;
  toastType = type;
  renderToast();
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast = "";
    renderToast();
    toastTimer = null;
  }, 1800);
}

function renderHeader() {
  return `
    <header class="header">
      <div class="balance-container">
        <div class="balance-row">
          <div class="balance" data-field="balance">${money(liveBalance())}</div>
          ${collectBurst ? `<div class="collect-burst">+${money(collectBurst)}</div>` : ""}
        </div>
        <div class="income" data-field="income">+${money(liveIncomePerSecond)}/sec</div>
      </div>
      <div class="header-actions">
        <button class="btn btn-reset-cache" data-action="prestige">RESET</button>
        <button class="prestige-currency" data-action="cacheCore" aria-label="Cache Credits and permanent upgrades">
          CC: <strong data-field="cacheCredits">${Math.floor(snapshot.sync.cacheCredits)}</strong>
        </button>
      </div>
    </header>
  `;
}

function renderFooter(activeNav) {
  return `
    <nav class="footer-nav">
      <button class="nav-btn ${activeNav === "slots" ? "active" : ""}" data-action="home">SLOTS</button>
      <button class="nav-btn ${activeNav === "store" ? "active" : ""}" data-action="store">STORE</button>
      <button class="nav-btn ${activeNav === "library" ? "active" : ""}" data-action="library">LIBRARY</button>
    </nav>
  `;
}

function renderStore() {
  shell(`
    <main class="view active store-view">
      <div class="upgrade-section-label">CACHE SHOP</div>
      ${renderCacheCoreStoreItem()}
      ${renderSlotUpgradeStoreItem()}
    </main>
  `, "store");
}

function renderCacheCoreStoreItem() {
  const level = cacheCoreLevel();
  const cost = cacheCoreCost(level);
  const affordable = snapshot.sync.cacheCredits >= cost;
  return `
    <div class="upgrade-item store-upgrade-item">
      <div class="upgrade-info" style="flex:1;">
        <img class="upgrade-icon" src="${iconPath(32)}" alt="">
        <div class="upgrade-details" data-tooltip="${escapeAttribute(cacheCoreTooltip())}">
          <div>
            <span class="upgrade-name">Cache Core</span>
            <span class="upgrade-level">${level <= 0 ? "INACTIVE" : `Lvl ${level}`}</span>
          </div>
          <div class="upgrade-desc">Base rate ${money(cacheCoreBaseRate(level))}/sec -> ${money(cacheCoreBaseRate(level + 1))}/sec</div>
        </div>
      </div>
      <button class="btn btn-buy" data-action="upgradeCacheCore" ${affordable ? "" : "disabled"}>
        <span>BUY</span>
        <span style="font-size:12px">${cost} CC</span>
      </button>
    </div>
  `;
}

function slotUpgradeTooltip() {
  return "Spend Cache Credits to prestige individual slots. Each tier boosts slot income, and extra slots become permanently unlocked once their first prestige is bought.";
}

function renderSlotUpgradeStoreItem() {
  return `
    <div class="upgrade-item store-upgrade-item">
      <div class="upgrade-info" style="flex:1;">
        <img class="upgrade-icon" src="${iconPath(12)}" alt="">
        <div class="upgrade-details" data-tooltip="${escapeAttribute(slotUpgradeTooltip())}">
          <div>
            <span class="upgrade-name">Upgrade Slots</span>
          </div>
          <div class="upgrade-desc">Boost total income from slots.</div>
        </div>
      </div>
      <button class="btn btn-buy" data-action="slotUpgradeList">
        <span>OPEN MENU</span>
      </button>
    </div>
  `;
}

function renderHome() {
  if (!snapshot.sync.onboardingComplete) return renderOnboarding();
  shell(`
    <main class="view active">
      <div class="slots-header">ACTIVE SLOTS</div>
      ${renderDevButtons()}
      <div class="slots-grid">
        ${snapshot.sync.slots.map(renderSlot).join("")}
      </div>
      ${renderUnlockSlot()}
    </main>
  `, "slots");
}

function renderDevButtons() {
  return `
    <div class="dev-controls">
      <button class="btn" data-action="devCash">DEV +$10K</button>
      <button class="btn btn-prestige" data-action="devPrestige">DEV +10 CC</button>
      <button class="btn btn-danger" data-action="devReset">DEV RESET $/CC</button>
    </div>
  `;
}

function renderSlot(slot) {
  if (!slot.assignedDomain) {
    return `<button class="slot slot-empty" data-action="picker" data-slot="${slot.id}">+ ASSIGN DOMAIN</button>`;
  }
  const domain = slot.assignedDomain;
  const entry = entryFor(domain);
  const state = stateLabel(domain);
  const vaultReady = sciCompare(entry?.vaultAmount || 0, 0) > 0;
  return `
    <button class="slot ${tierClass(slot.tier)}" data-action="detail" data-domain="${domain}">
      <div class="slot-info">
        ${favicon(domain)}
        <div>
          <div class="slot-domain">${domain} <span class="slot-state ${state.className}" data-field="slot:${domain}:state">${state.text}</span></div>
          <div class="slot-tier">${tierMaterial(slot.tier)} ${tierName(slot.tier)} | <span data-field="slot:${domain}:income">${money(incomeFor(domain))}</span>/s | VAULT <span data-field="slot:${domain}:vault">${money(entry?.vaultAmount || 0)}</span></div>
        </div>
      </div>
      <div class="slot-badges">
        <div class="slot-streak ${streakDoneToday(entry) ? "active" : "inactive"}" data-field="slot:${domain}:streakBadge">
          <span class="slot-fire">⚡</span>
          <span data-field="slot:${domain}:streak">${displayStreak(entry)}</span>
        </div>
        <div class="slot-vault-ready" data-field="slot:${domain}:ready" ${vaultReady ? "" : "hidden"}>VAULT</div>
      </div>
    </button>
  `;
}

function renderUnlockSlot() {
  return `<button class="btn btn-unlock" data-action="unlock" ${sciCompare(snapshot.sync.balance, snapshot.nextSlotCost) < 0 ? "disabled" : ""}>UNLOCK SLOT ${snapshot.sync.unlockedSlots + 1} (${money(snapshot.nextSlotCost)})</button>`;
}

function renderOnboarding() {
  const previousRouteKey = lastRenderedRouteKey;
  const nextRouteKey = routeKey();
  const scrollTop = previousRouteKey === nextRouteKey ? app.querySelector(".tutorial-overlay")?.scrollTop || 0 : 0;
  app.innerHTML = `
    <div class="tutorial-overlay">
      <h2>WELCOME TO BROWSER TYCOON</h2>
      <p>Transform your browsing into an idle clicker game.</p>
      <p>Only slotted domains earn. Open a normal site, then fill your first slot with Add Current Site.</p>
      <p>Upgrades, vaults, and Clear Cache prestige live inside each slotted domain.</p>
      <button class="btn btn-prestige" data-action="finishOnboarding">START EARNING</button>
    </div>
  `;
  app.querySelectorAll("[data-action]").forEach((node) => node.addEventListener("click", handleAction));
  lastRenderedRouteKey = nextRouteKey;
  if (scrollTop) {
    requestAnimationFrame(() => {
      const view = app.querySelector(".tutorial-overlay");
      if (view) view.scrollTop = scrollTop;
    });
  }
}

function renderDetail(domain) {
  const entry = entryFor(domain);
  const slot = currentSlot(domain);
  if (!entry || !slot) {
    route = { name: "home" };
    return renderHome();
  }
  if (!BUY_MODES.includes(buyMode)) buyMode = "1";
  const state = stateLabel(domain);
  const nextTier = nextSlotTier(slot);
  const nextTierCost = nextTier ? slotTierCost(slot, nextTier) : null;
  shell(`
    <main class="view active">
      <div class="view-header">
        <button class="btn btn-back" data-action="home">&lt; BACK</button>
        <div class="detail-domain-heading">
          ${favicon(domain, "detail-favicon")}
          <span class="detail-title">${domain.toUpperCase()}</span>
          <button class="btn btn-icon" data-action="openDomain" data-domain="${domain}" aria-label="Open ${domain} in a new tab">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 3h7v7"></path>
              <path d="M10 14 21 3"></path>
              <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"></path>
            </svg>
          </button>
        </div>
        <button class="btn btn-detail" data-action="domainDetails" data-domain="${domain}">DETAILS</button>
      </div>
      <div class="vault-panel domain-status-panel">
        <div class="vault-info">
          <div>
            <span data-field="detailState">${state.text}</span> | <span data-field="detailIncome">${money(incomeFor(domain))}/sec</span>
            <span class="help-icon help-icon-muted" data-tooltip="${escapeAttribute(currentRateTooltip(domain, entry, slot))}">?</span>
          </div>
          <small>BASE INCOME: <span data-field="detailBaseIncome">${money(domainBaseRate(entry))}/sec</span></small>
          <small>SLOT MULTIPLIER: <span data-field="detailSlotMultiplier">x${tierBonus(slot).toFixed(2)}</span></small>
          <small>STREAK: <span data-field="detailStreak">${displayStreak(entry)}</span> | LAST VISIT: <span data-field="detailLastVisit">${dateAgo(entry.lastVisited)}</span></small>
        </div>
      </div>
      <div class="vault-panel">
        <div class="vault-info">
          <div>VAULT: <span data-field="detailVault">${money(entry.vaultAmount)}</span></div>
          <small>CAP: <span data-field="detailVaultCap">${money(vaultCap(entry))}</span> | FILL: <span data-field="detailVaultRate">${money(vaultRate(entry))}/sec</span></small>
        </div>
        <button class="btn btn-collect" data-action="claim" data-domain="${domain}" ${sciCompare(entry.vaultAmount, 0) > 0 ? "" : "disabled"}>COLLECT</button>
      </div>
      <div class="upgrade-toolbar">
        ${BUY_MODES.map((mode) => `<button class="btn ${buyMode === mode ? "active" : ""}" data-action="mode" data-mode="${mode}">BUY ${mode}</button>`).join("")}
      </div>
      <div class="upgrade-list">
        ${renderUpgradeGroups(entry)}
      </div>
      <button class="btn btn-prestige" data-action="tier" data-slot="${slot.id}" style="width:100%; margin-top:10px;" ${nextTier && snapshot.sync.cacheCredits >= nextTierCost ? "" : "disabled"}>${nextTier ? `UPGRADE TO ${tierMaterial(nextTier.tier)} (${nextTierCost} CC)` : "SLOT MAXED"}</button>
      <button class="btn" data-action="picker" data-slot="${slot.id}" style="width:100%; margin-top:10px;">SWAP DOMAIN</button>
      <button class="btn btn-danger" data-action="remove" data-slot="${slot.id}">REMOVE FROM SLOT</button>
    </main>
  `, "slots");
}

function renderUpgradeGroups(entry) {
  const labels = { active: "ACTIVE INCOME", vault: "VAULT STORAGE", background: "BACKGROUND BEHAVIOR" };
  return Object.keys(labels).map((category) => `
    <div class="upgrade-section-label">${labels[category]}</div>
    ${snapshot.upgradeDefs.filter((def) => def.category === category).map((def) => renderUpgrade(entry, def)).join("")}
  `).join("");
}

function renderUpgrade(entry, def) {
  const level = upgradeLevel(entry, def.id);
  const maxed = def.maxLevel !== null && level >= def.maxLevel;
  const quantity = selectedBuyQuantity();
  const cost = upgradeBulkCost(def, level, quantity);
  const disabled = maxed || sciCompare(snapshot.sync.balance, cost) < 0;
  const summary = effectSummary(def.id, level, upgradeTargetLevel(def, level, quantity));
  const tooltip = upgradeTooltip(def.id, level);
  return `
    <div class="upgrade-item">
      <div class="upgrade-info" style="flex:1;">
        <img class="upgrade-icon" src="${iconPath(def.icon)}" alt="">
        <div class="upgrade-details" data-tooltip="${escapeAttribute(tooltip)}">
          <div>
            <span class="upgrade-name">${def.name}</span>
            <span class="upgrade-level">${level <= 0 ? "INACTIVE" : `Lvl ${level}${def.maxLevel ? "/" + def.maxLevel : ""}`}</span>
          </div>
          <div class="upgrade-desc">${summary}</div>
        </div>
      </div>
      <button class="btn btn-buy" data-action="buy" data-domain="${entry.domain}" data-upgrade="${def.id}" ${disabled ? "disabled" : ""}>
        <span>${maxed ? "MAX" : "BUY"}</span>
        ${maxed ? "" : `<span style="font-size:12px">${money(cost)}</span>`}
      </button>
    </div>
  `;
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function effectSummary(id, level, targetLevel = level + 1) {
  const next = targetLevel;
  const entry = currentDetailEntry();
  const slot = entry ? currentSlot(entry.domain) : null;
  const map = {
    trafficEngine: `Base income ${money(BASE_RATE * cacheCoreMultiplier(cacheCoreLevel()) * Math.pow(TRAFFIC_ENGINE_MULTIPLIER, level))}/sec -> ${money(BASE_RATE * cacheCoreMultiplier(cacheCoreLevel()) * Math.pow(TRAFFIC_ENGINE_MULTIPLIER, next))}/sec`,
    tabMultiplier: `Live income x${(1 + 0.15 * level).toFixed(2)} -> x${(1 + 0.15 * next).toFixed(2)}`,
    focusBonus: `Focused income x${focusMultiplier(level).toFixed(2)} -> x${focusMultiplier(next).toFixed(2)}`,
    navigationBonus: `Navigation payout ${money(navigationPayoutForLevel(entry, slot, level))} -> ${money(navigationPayoutForLevel(entry, slot, next))}`,
    coldStorage: `Vault cap ${money(vaultCapForLevels(level))} -> ${money(vaultCapForLevels(next))}`,
    storageDuration: `Vault fill rate ${money(vaultRateForLevel(level))}/sec -> ${money(vaultRateForLevel(next))}/sec`,
    dailyBoot: `Daily bonus x${dailyBootMultiplier(level).toFixed(2)} -> x${dailyBootMultiplier(next).toFixed(2)}`,
    backgroundHum: `Background income ${(8 * level).toFixed(0)}% -> ${(8 * next).toFixed(0)}% of live base`,
    idleDepth: `Max idle boost x${(1 + 0.5 * level).toFixed(2)} -> x${(1 + 0.5 * next).toFixed(2)}`,
    wakeBonus: `Wake burst ${money(wakeBurstForLevel(entry, slot, level))} -> ${money(wakeBurstForLevel(entry, slot, next))}`
  };
  return map[id] || "";
}

function upgradeTooltip(id, level) {
  const lines = {
    trafficEngine: [
      "Traffic Engine raises this domain's base income before tab, focus, background, and slot tier multipliers are applied."
    ],
    tabMultiplier: [
      "Tab Multiplier boosts live income whenever this domain is open, including focused and background income."
    ],
    focusBonus: [
      "Focus Bonus boosts income while this domain is the active tab in the focused browser window."
    ],
    navigationBonus: [
      "Navigation Bonus pays when you make a top-level navigation inside this slotted domain. It has a 1 minute cooldown per domain."
    ],
    coldStorage: [
      "Cold Storage increases the vault cap, letting this domain store more offline/background money before you collect."
    ],
    storageDuration: [
      "Vault Pump increases how quickly the vault fills over time. It does not change live income directly."
    ],
    dailyBoot: [
      "Daily Boot increases the first-open daily bonus for this domain. Streak and slot streak bonuses multiply this payout too."
    ],
    backgroundHum: [
      "Background Hum lets this domain keep earning while it is open in a non-focused tab."
    ],
    idleDepth: [
      "Idle Depth increases background income the longer the domain stays open in the background, reaching max boost after 25 minutes."
    ],
    wakeBonus: [
      "Wake Bonus pays a burst when this domain returns from background to focused. It has a 1 minute cooldown per domain and still requires a background-to-focused transition."
    ]
  };
  return (lines[id] || [effectSummary(id, level)]).join("\n");
}

function currentDetailEntry() {
  return route.name === "detail" ? entryFor(route.domain) : null;
}

function vaultCapForLevels(cold) {
  const entry = currentDetailEntry();
  return vaultCap(entry || { upgrades: {} }, cold);
}

function vaultRateForLevel(level) {
  const entry = currentDetailEntry();
  return vaultRate(entry || { upgrades: {} }, level);
}

function renderLibrary(pickSlotId = null) {
  const pickSlot = pickSlotId ? snapshot.sync.slots.find((slot) => slot.id === pickSlotId) : null;
  const showManualAssign = Boolean(pickSlot);
  const currentSite = snapshot.currentSite || { valid: false, reason: "Open a normal http or https page first." };
  const manualDefault = currentSite.valid ? currentSite.domain : "";
  const domains = filteredLibraryDomains();

  shell(`
    <main class="view active">
      <div class="view-header">
        <button class="btn btn-back" data-action="home">&lt; BACK</button>
        <span>${pickSlotId ? `ASSIGN SLOT ${pickSlotId}` : "DOMAIN LIBRARY"}</span>
      </div>
      ${showManualAssign ? `
        <div class="library-controls">
          <input class="input-text" data-manual-domain data-slot="${pickSlotId}" value="${manualDefault}" placeholder="Enter domain (e.g. github.com)">
          <button class="btn" data-action="assignTyped" data-slot="${pickSlotId}">${pickSlot.assignedDomain ? "SWAP IN" : "ADD TO SLOT"}</button>
        </div>
        <div class="helper-text">${currentSite.valid ? "CURRENT TAB IS PREFILLED. EDIT IT OR SELECT FROM LIBRARY BELOW." : `${currentSite.reason} ENTER A DOMAIN MANUALLY OR SELECT FROM LIBRARY BELOW.`}</div>
      ` : ""}
      <div class="library-controls">
        <input class="input-text" data-search placeholder="Search library">
      </div>
      <div class="library-list" data-library-list>
        ${domains.length ? domains.map((entry) => renderLibraryItem(entry, pickSlotId)).join("") : `<div class="library-item">NO DOMAINS IN LIBRARY YET</div>`}
      </div>
    </main>
  `, pickSlotId ? "slots" : "library");
}

function filteredLibraryDomains(pickSlotId = null) {
  return Object.values(snapshot.local.domainLibrary)
    .filter((entry) => entry.domain.includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      if (pickSlotId) {
        if (!a.isSlotted && !b.isSlotted) return a.domain.localeCompare(b.domain);
        if (a.isSlotted !== b.isSlotted) return a.isSlotted ? 1 : -1;
        return Number(a.slotId || 0) - Number(b.slotId || 0);
      }
      if (a.isSlotted && b.isSlotted) return Number(a.slotId || 0) - Number(b.slotId || 0);
      if (a.isSlotted !== b.isSlotted) return b.isSlotted - a.isSlotted;
      return a.domain.localeCompare(b.domain);
    });
}

function renderLibraryItem(entry, pickSlotId) {
  const isSlotted = Boolean(entry.isSlotted);
  const isCurrentPickSlot = pickSlotId && isSlotted && Number(entry.slotId) === Number(pickSlotId);
  const isSwapCandidate = pickSlotId && isSlotted && !isCurrentPickSlot;
  const action = pickSlotId ? (isSwapCandidate ? "swapDomain" : "assign") : "domainDetails";
  const label = pickSlotId ? (isCurrentPickSlot ? `SLOT ${entry.slotId}` : isSwapCandidate ? "SWAP" : "ASSIGN") : "VIEW";
  const upgradeTotal = Object.values(entry.upgrades || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  return `
    <div class="library-item">
      <div class="slot-info" ${pickSlotId ? "" : `data-action="domainDetails" data-domain="${entry.domain}" data-source="library"`}>
        ${favicon(entry.domain)}
        <div>
          <div class="slot-domain">${entry.domain}</div>
          <div class="slot-tier">${isSlotted ? `SLOT ${entry.slotId}` : "LIBRARY"} | ${upgradeTotal} UPGRADES | ${money(entry.lifetimeEarned)}</div>
        </div>
      </div>
      <button class="btn" data-action="${action}" data-domain="${entry.domain}" ${pickSlotId ? `data-slot="${pickSlotId}"` : `data-source="library"`} ${isSwapCandidate ? `data-source-slot="${entry.slotId}"` : ""} ${isCurrentPickSlot ? "disabled" : ""}>
        ${label}
      </button>
    </div>
  `;
}

function renderDomainSummary(domain) {
  const entry = entryFor(domain);
  shell(`
    <main class="view active">
      <div class="view-header">
        <button class="btn btn-back" data-action="library">&lt; BACK</button>
        <span>${domain.toUpperCase()}</span>
      </div>
      <div class="vault-panel">
        <div class="vault-info">
          <div>STATUS: <span data-field="summaryStatus">${entry.isSlotted ? `SLOT ${entry.slotId}` : "LIBRARY"}</span></div>
          <small>LIFETIME: <span data-field="summaryLifetime">${money(entry.lifetimeEarned)}</span> | VAULT: <span data-field="summaryVault">${money(entry.vaultAmount)}</span></small>
          <small>STREAK: <span data-field="summaryStreak">${displayStreak(entry)}</span> | LAST VISIT: <span data-field="summaryLastVisit">${dateAgo(entry.lastVisited)}</span></small>
        </div>
      </div>
    </main>
  `, "library");
}

async function handleAction(event) {
  const node = event.currentTarget;
  const action = node.dataset.action;
  toast = "";
  toastType = "success";

  if (action === "home") route = { name: "home" };
  if (action === "detail") route = { name: "detail", domain: node.dataset.domain };
  if (action === "library") route = { name: "library" };
  if (action === "store") route = { name: "store" };
  if (action === "domainSummary") route = { name: "domainSummary", domain: node.dataset.domain };
  if (action === "picker") route = { name: "picker", slotId: Number(node.dataset.slot) };
  if (action === "mode" && BUY_MODES.includes(node.dataset.mode)) buyMode = node.dataset.mode;
  if (action === "openDomain") await chrome.tabs.create({ url: `https://${node.dataset.domain}` });
  if (action === "finishOnboarding") await act("completeOnboarding");
  if (action === "addCurrent") {
    const slotId = Number(node.dataset.slot);
    const result = await act("addCurrentSite", { slotId });
    if (result?.ok) routeToAssignedDomain(slotId);
  }
  if (action === "assignTyped") {
    const slotId = Number(node.dataset.slot);
    const input = app.querySelector(`[data-manual-domain][data-slot="${slotId}"]`);
    const result = await act("assignDomain", {
      slotId,
      domain: input?.value || "",
      fromCurrentSite: Boolean(snapshot.currentSite?.valid),
      currentDomain: snapshot.currentSite?.domain || ""
    });
    if (result?.ok) routeToAssignedDomain(slotId);
  }
  if (action === "assign") {
    const slotId = Number(node.dataset.slot);
    modal = {
      name: "confirm",
      kicker: "SLOT ASSIGNMENT",
      title: `ASSIGN SLOT ${slotId}?`,
      body: `Assign ${node.dataset.domain} to this slot.`,
      confirmLabel: "ASSIGN",
      actionType: "assignDomain",
      payload: {
        slotId,
        domain: node.dataset.domain,
        fromCurrentSite: Boolean(snapshot.currentSite?.valid),
        currentDomain: snapshot.currentSite?.domain || ""
      },
      after: { routeAssignedSlot: slotId }
    };
  }
  if (action === "swapDomain") {
    const targetSlotId = Number(node.dataset.slot);
    const sourceSlotId = Number(node.dataset.sourceSlot);
    modal = {
      name: "swapDomain",
      sourceSlotId,
      targetSlotId,
      sourceDomain: node.dataset.domain
    };
  }
  if (action === "buy") await act("buyUpgrade", { domain: node.dataset.domain, upgradeId: node.dataset.upgrade, mode: buyMode });
  if (action === "claim") await act("claimRevisit", { domain: node.dataset.domain });
  if (action === "unlock") await act("unlockSlot");
  if (action === "tier") await act("upgradeSlotTier", { slotId: Number(node.dataset.slot) });
  if (action === "devCash") await act("devAddCash", { amount: 10000 });
  if (action === "devPrestige") await act("devAddCachePoints", { amount: 10 });
  if (action === "devReset") {
    modal = {
      name: "confirm",
      variant: "danger",
      kicker: "DEV RESET",
      title: "RESET CASH + CC?",
      body: "This resets only current cash and Cache Credits. Domain history and slots stay intact.",
      confirmLabel: "RESET",
      actionType: "devResetCashAndCachePoints"
    };
  }
  if (action === "remove") {
    modal = {
      name: "confirm",
      variant: "danger",
      kicker: "SLOT REMOVAL",
      title: "REMOVE DOMAIN?",
      body: "Move this domain back to the library and empty the slot.",
      confirmLabel: "REMOVE",
      actionType: "removeDomain",
      payload: { slotId: Number(node.dataset.slot) }
    };
  }
  if (action === "prestige") modal = "prestige";
  if (action === "cacheCore") modal = { name: "cacheCore" };
  if (action === "upgradeCacheCore") await act("upgradeCacheCore");
  if (action === "slotUpgradeList") modal = { name: "slotUpgradeList" };
  if (action === "slotUpgradeDetail") modal = { name: "slotUpgradeDetail", slotId: Number(node.dataset.slot) };
  if (action === "confirmSlotUpgrade") {
    const slotId = Number(node.dataset.slot);
    const result = await act("upgradeSlotTier", { slotId });
    if (result?.ok) modal = { name: "slotUpgradeList" };
  }
  if (action === "domainDetails") modal = { name: "domainDetails", domain: node.dataset.domain, source: node.dataset.source || "slot" };
  if (action === "cancelModal") modal = null;
  if (action === "confirmPrestige") {
    modal = null;
    await act("prestige");
  }
  if (action === "confirmModal" && modal?.name === "confirm") {
    const pending = modal;
    modal = null;
    const result = await act(pending.actionType, pending.payload || {});
    if (result?.ok && pending.after?.routeAssignedSlot) routeToAssignedDomain(pending.after.routeAssignedSlot);
  }
  if (action === "confirmSwapDomain" && modal?.name === "swapDomain") {
    const pending = modal;
    modal = null;
    const result = await act("swapSlots", { fromSlotId: pending.sourceSlotId, toSlotId: pending.targetSlotId });
    if (result?.ok) routeToAssignedDomain(pending.targetSlotId);
  }
  if (action === "collectWelcomeBack") await collectWelcomeBack();

  render();
}

async function collectWelcomeBack() {
  const result = await send("collectWelcomeBack");
  if (!result?.ok) {
    showToast(result?.error || "Action failed.", "warning");
    return;
  }
  const award = result.award?.total || snapshot?.welcomeBack?.total || 0;
  modal = null;
  snapshot = await send("snapshot");
  syncWelcomeBackModal();
  resetLiveTickerBaseline();
  showCollectBurst(award);
}

function showCollectBurst(amount) {
  collectBurst = amount;
  if (collectBurstTimer) clearTimeout(collectBurstTimer);
  collectBurstTimer = setTimeout(() => {
    collectBurst = null;
    collectBurstTimer = null;
    render();
  }, 1300);
}

function routeToAssignedDomain(slotId) {
  const slot = snapshot?.sync?.slots?.find((item) => item.id === slotId);
  if (slot?.assignedDomain) route = { name: "detail", domain: slot.assignedDomain };
}

async function act(type, payload = {}) {
  const result = await send(type, payload);
  if (!result?.ok) showToast(result?.error || "Action failed.", "warning");
  else if (type === "prestige") showToast(`CLEAR CACHE AWARDED ${result.award} CC.`);
  else if (type === "upgradeCacheCore") showToast(`CACHE CORE LEVEL ${result.level}.`);
  else showToast("SUCCESS");
  snapshot = await send("snapshot");
  resetLiveTickerBaseline();
  return result;
}

function render() {
  if (!snapshot) return;
  if (route.name === "detail") return renderDetail(route.domain);
  if (route.name === "store") return renderStore();
  if (route.name === "library") return renderLibrary();
  if (route.name === "picker") return renderLibrary(route.slotId);
  if (route.name === "domainSummary") return renderDomainSummary(route.domain);
  return renderHome();
}

function routeKey() {
  return JSON.stringify(route);
}

refresh({ full: true });
startLiveTicker();
setInterval(() => refresh({ full: false }), 5000);
