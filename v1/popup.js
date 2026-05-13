const app = document.getElementById("app");
let snapshot = null;
let route = { name: "home" };
let buyMode = "1";
let toast = "";
let search = "";
let liveBaseBalance = 0;
let liveBaseAt = Date.now();
let liveIncomePerSecond = 0;
let tickerStarted = false;
let lastRenderedRouteKey = "";
let toastTimer = null;

const iconPath = (index) => `icons/Icon14_${String(index).padStart(2, "0")}.png`;
const SCI_ZERO = Object.freeze({ m: 0, e: 0 });
const BASE_RATE = 0.1;
var VAULT_RATE = BASE_RATE * 0.5;
const TRAFFIC_ENGINE_MULTIPLIER = 1.18;

function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

async function refresh({ full = false } = {}) {
  snapshot = await send("snapshot");
  resetLiveTickerBaseline();
  if (full || !lastRenderedRouteKey) {
    render();
  } else {
    patchDynamicFields();
  }
}

function resetLiveTickerBaseline() {
  liveBaseBalance = toSci(snapshot?.sync?.balance || 0);
  liveBaseAt = Date.now();
  liveIncomePerSecond = Number(snapshot?.incomePerSecond || 0);
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
  setText("income", `+${money(snapshot.incomePerSecond)}/sec`);
  setText("cachePoints", `CP: ${Math.floor(snapshot.sync.cachePoints)}`);
  patchSlots();
  patchDetail();
  patchLibraryList();
  patchLibrarySummary();
  patchAffordability(liveBalance());
}

function patchLibraryList() {
  if (!["library", "picker"].includes(route.name)) return;
  const list = app.querySelector("[data-library-list]");
  if (!list) return;
  const pickSlotId = route.name === "picker" ? route.slotId : null;
  const domains = filteredLibraryDomains();
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
    const readyNode = app.querySelector(`[data-field="slot:${domain}:ready"]`);
    if (readyNode) {
      const vaultReady = sciCompare(entry?.vaultAmount || 0, 0) > 0 || (entry?.dailyBonusClaimedDate !== snapshot.today && entry?.insertedOnDate !== snapshot.today);
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
  setText("detailStreak", String(entry.currentStreak));
  setText("detailLastVisit", dateAgo(entry.lastVisited));
  setText("detailCurrentIncome", `${money(incomeFor(domain))}/sec`);
  setDisabled(`[data-action="claim"][data-domain="${CSS.escape(domain)}"]`, sciCompare(entry.vaultAmount, 0) <= 0 && entry.dailyBonusClaimedDate === snapshot.today);
}

function patchLibrarySummary() {
  if (route.name !== "domainSummary") return;
  const entry = entryFor(route.domain);
  if (!entry) return;
  setText("summaryStatus", entry.isSlotted ? `SLOTTED ${entry.slotId}` : "LIBRARY");
  setText("summaryLifetime", money(entry.lifetimeEarned));
  setText("summaryVault", money(entry.vaultAmount));
  setText("summaryStreak", String(entry.currentStreak));
  setText("summaryLastVisit", dateAgo(entry.lastVisited));
}

function patchAffordability(displayBalance = snapshot?.sync?.balance || 0) {
  const balance = toSci(displayBalance || 0);
  setDisabled("[data-action='unlock']", sciCompare(balance, snapshot.nextSlotCost) < 0);
  app.querySelectorAll("[data-action='buy'][data-upgrade][data-domain]").forEach((button) => {
    const entry = entryFor(button.dataset.domain);
    const def = snapshot.upgradeDefs.find((upgrade) => upgrade.id === button.dataset.upgrade);
    if (!entry || !def) return;
    const level = upgradeLevel(entry, def.id);
    const maxed = def.maxLevel !== null && level >= def.maxLevel;
    button.disabled = maxed || sciCompare(balance, upgradeCost(def, level)) < 0;
  });
}

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

function upgradeLevel(entry, id) {
  return Number(entry?.upgrades?.[id] || 0);
}

function upgradeCost(def, level) {
  return Math.ceil(def.baseCost * Math.pow(def.growth, level));
}

function vaultCap(entry) {
  const cold = upgradeLevel(entry, "coldStorage");
  return BASE_RATE * 60 * 60 * (1 + cold * 0.75);
}

function vaultRate(entry) {
  return BASE_RATE * 0.5 * Math.pow(1.18, upgradeLevel(entry, "storageDuration"));
}

function tierBonus(slot) {
  return snapshot.slotTiers.find((tier) => tier.tier === slot.tier)?.bonus || 1;
}

function tierName(tier) {
  return ["0", "I", "II", "III", "IV", "V"][tier] || String(tier);
}

function domainBaseRate(entry) {
  return BASE_RATE * Math.pow(TRAFFIC_ENGINE_MULTIPLIER, upgradeLevel(entry, "trafficEngine"));
}

function incomeFor(domain) {
  const entry = entryFor(domain);
  const slot = currentSlot(domain);
  const presence = snapshot.local.presence[domain];
  if (!entry || !slot || !presence) return 0;
  const tab = 1 + 0.15 * upgradeLevel(entry, "tabMultiplier");
  if (presence.state === "active") {
    return domainBaseRate(entry) * tab * (1 + 0.2 * upgradeLevel(entry, "focusBonus")) * tierBonus(slot);
  }
  if (presence.state === "background") {
    const hum = 0.05 * upgradeLevel(entry, "backgroundHum");
    const idleSeconds = Math.max(0, (Date.now() - (presence.backgroundSince || Date.now())) / 1000);
    const idle = 1 + 0.1 * upgradeLevel(entry, "idleDepth") * Math.min(idleSeconds / 300, 5);
    return domainBaseRate(entry) * tab * hum * idle * tierBonus(slot);
  }
  return 0;
}

function stateLabel(domain) {
  const state = snapshot.local.presence[domain]?.state || "closed";
  if (state === "active") return { text: "[FOCUSED]", className: "focused" };
  if (state === "background") return { text: "[BACKGROUND]", className: "background" };
  return { text: "[INACTIVE]", className: "closed" };
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
    ${toast ? `<div class="toast">${toast}</div>` : ""}
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

function renderToast() {
  const existing = app.querySelector(".toast");
  if (existing) existing.remove();
  if (!toast) return;
  app.insertAdjacentHTML("beforeend", `<div class="toast">${toast}</div>`);
}

function showToast(message) {
  toast = message;
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
        <div class="balance" data-field="balance">${money(liveBalance())}</div>
        <div class="income" data-field="income">+${money(snapshot.incomePerSecond)}/sec</div>
      </div>
      <button class="btn btn-prestige" data-action="prestige" data-field="cachePoints">CP: ${Math.floor(snapshot.sync.cachePoints)}</button>
    </header>
  `;
}

function renderFooter(activeNav) {
  return `
    <nav class="footer-nav">
      <button class="nav-btn ${activeNav === "slots" ? "active" : ""}" data-action="home">SLOTS</button>
      <button class="nav-btn ${activeNav === "library" ? "active" : ""}" data-action="library">LIBRARY</button>
    </nav>
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
      <button class="btn btn-prestige" data-action="devPrestige">DEV +10 CP</button>
      <button class="btn btn-danger" data-action="devReset">DEV RESET $/CP</button>
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
  const vaultReady = sciCompare(entry?.vaultAmount || 0, 0) > 0 || (entry?.dailyBonusClaimedDate !== snapshot.today && entry?.insertedOnDate !== snapshot.today);
  return `
    <button class="slot" data-action="detail" data-domain="${domain}">
      <div class="slot-info">
        ${favicon(domain)}
        <div>
          <div class="slot-domain">${domain} <span class="slot-state ${state.className}" data-field="slot:${domain}:state">${state.text}</span></div>
          <div class="slot-tier">Tier ${tierName(slot.tier)} | <span data-field="slot:${domain}:income">${money(incomeFor(domain))}</span>/s | VAULT <span data-field="slot:${domain}:vault">${money(entry?.vaultAmount || 0)}</span></div>
        </div>
      </div>
      <div class="slot-vault-ready" data-field="slot:${domain}:ready" ${vaultReady ? "" : "hidden"}>VAULT</div>
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
  const state = stateLabel(domain);
  shell(`
    <main class="view active">
      <div class="view-header">
        <button class="btn btn-back" data-action="home">&lt; BACK</button>
        <span>${domain.toUpperCase()}</span>
      </div>
      <div class="vault-panel">
        <div class="vault-info">
          <div>VAULT: <span data-field="detailVault">${money(entry.vaultAmount)}</span></div>
          <small>CAP: <span data-field="detailVaultCap">${money(vaultCap(entry))}</span> | FILL: <span data-field="detailVaultRate">${money(vaultRate(entry))}/sec</span></small>
          <small><span data-field="detailState">${state.text}</span> | <span data-field="detailIncome">${money(incomeFor(domain))}/sec</span></small>
          <small>STREAK: <span data-field="detailStreak">${entry.currentStreak}</span> | LAST VISIT: <span data-field="detailLastVisit">${dateAgo(entry.lastVisited)}</span></small>
        </div>
        <button class="btn btn-collect" data-action="claim" data-domain="${domain}">COLLECT</button>
      </div>
      <div class="upgrade-toolbar">
        ${["1", "10", "max"].map((mode) => `<button class="btn ${buyMode === mode ? "active" : ""}" data-action="mode" data-mode="${mode}">BUY ${mode === "max" ? "MAX" : mode}</button>`).join("")}
      </div>
      <div class="upgrade-list">
        <div class="helper-text" style="text-align:center;">
          BASE INCOME: ${money(domainBaseRate(entry))}/sec<br>
          <span style="color:var(--primary);">CURRENT DOMAIN INCOME: <span data-field="detailCurrentIncome">${money(incomeFor(domain))}/sec</span></span>
        </div>
        ${renderUpgradeGroups(entry)}
      </div>
      <button class="btn btn-prestige" data-action="tier" data-slot="${slot.id}" style="width:100%; margin-top:10px;">UPGRADE TIER ${tierName(slot.tier)} (CP)</button>
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
  const cost = upgradeCost(def, level);
  const disabled = maxed || sciCompare(snapshot.sync.balance, cost) < 0;
  return `
    <div class="upgrade-item">
      <div class="upgrade-info" style="flex:1;">
        <img class="upgrade-icon" src="${iconPath((snapshot.upgradeDefs.indexOf(def) % 40) + 1)}" alt="">
        <div class="upgrade-details" title="${effectSummary(def.id, level)}">
          <div>
            <span class="upgrade-name">${def.name}</span>
            <span class="upgrade-level">Lvl ${level}${def.maxLevel ? "/" + def.maxLevel : ""}</span>
          </div>
          <div class="upgrade-desc">${effectSummary(def.id, level)}</div>
        </div>
      </div>
      <button class="btn btn-buy" data-action="buy" data-domain="${entry.domain}" data-upgrade="${def.id}" ${disabled ? "disabled" : ""}>
        <span>${maxed ? "MAX" : "BUY"}</span>
        ${maxed ? "" : `<span style="font-size:12px">${money(cost)}</span>`}
      </button>
    </div>
  `;
}

function effectSummary(id, level) {
  const next = level + 1;
  const entry = currentDetailEntry();
  const slot = entry ? currentSlot(entry.domain) : null;
  const cold = upgradeLevel(entry, "coldStorage");
  const map = {
    trafficEngine: `Base income ${money(BASE_RATE * Math.pow(TRAFFIC_ENGINE_MULTIPLIER, level))}/sec -> ${money(BASE_RATE * Math.pow(TRAFFIC_ENGINE_MULTIPLIER, next))}/sec`,
    tabMultiplier: `Live income x${(1 + 0.15 * level).toFixed(2)} -> x${(1 + 0.15 * next).toFixed(2)}`,
    focusBonus: `Focused income x${(1 + 0.2 * level).toFixed(2)} -> x${(1 + 0.2 * next).toFixed(2)}`,
    navigationBonus: `Navigation payout ${money(navigationPayoutForLevel(entry, slot, level))} -> ${money(navigationPayoutForLevel(entry, slot, next))}`,
    coldStorage: `Vault cap ${money(vaultCapForLevels(level))} -> ${money(vaultCapForLevels(next))}`,
    storageDuration: `Vault fill rate ${money(vaultRateForLevel(level))}/sec -> ${money(vaultRateForLevel(next))}/sec`,
    windfallBonus: `Windfall per idle hour ${money(BASE_RATE * 0.1 * level)} -> ${money(BASE_RATE * 0.1 * next)}`,
    backgroundHum: `Background income ${(5 * level).toFixed(0)}% -> ${(5 * next).toFixed(0)}% of live base`,
    idleDepth: `Max idle boost x${(1 + 0.5 * level).toFixed(2)} -> x${(1 + 0.5 * next).toFixed(2)}`,
    wakeBonus: `Wake burst ${money(BASE_RATE * 30 * level)} -> ${money(BASE_RATE * 30 * next)}`
  };
  return map[id] || "";
}

function currentDetailEntry() {
  return route.name === "detail" ? entryFor(route.domain) : null;
}

function vaultCapForLevels(cold) {
  return BASE_RATE * 60 * 60 * (1 + cold * 0.75);
}

function vaultRateForLevel(level) {
  return BASE_RATE * 0.5 * Math.pow(1.18, level);
}

function navigationPayoutForLevel(entry, slot, level) {
  if (!entry || !slot || level <= 0) return 0;
  return dailyFirstOpenBonusEstimate(entry, slot) * (domainBaseRate(entry) / BASE_RATE) * 0.1 * (1 + 0.15 * level);
}

function dailyFirstOpenBonusEstimate(entry, slot) {
  const windfall = upgradeLevel(entry, "windfallBonus");
  return 20 * (1 + windfall * 0.2) * (1 + entry.currentStreak * 0.08) * (1 + (slot.streakBonusTier || 0) * 0.15);
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
  `, "library");
}

function filteredLibraryDomains() {
  return Object.values(snapshot.local.domainLibrary)
    .filter((entry) => entry.domain.includes(search.trim().toLowerCase()))
    .sort((a, b) => (b.isSlotted - a.isSlotted) || sciCompare(b.lifetimeEarned, a.lifetimeEarned));
}

function renderLibraryItem(entry, pickSlotId) {
  const isSlotted = Boolean(entry.isSlotted);
  const upgradeTotal = Object.values(entry.upgrades || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  return `
    <div class="library-item">
      <div class="slot-info">
        ${favicon(entry.domain)}
        <div>
          <div class="slot-domain">${entry.domain}</div>
          <div class="slot-tier">${isSlotted ? `SLOTTED ${entry.slotId}` : "LIBRARY"} | ${upgradeTotal} UPGRADES | ${money(entry.lifetimeEarned)}</div>
        </div>
      </div>
      <button class="btn" data-action="${pickSlotId ? "assign" : "domainSummary"}" data-domain="${entry.domain}" ${pickSlotId ? `data-slot="${pickSlotId}"` : ""} ${pickSlotId && isSlotted ? "disabled" : ""}>
        ${pickSlotId ? (isSlotted ? "SLOTTED" : "ASSIGN") : "VIEW"}
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
          <div>STATUS: <span data-field="summaryStatus">${entry.isSlotted ? `SLOTTED ${entry.slotId}` : "LIBRARY"}</span></div>
          <small>LIFETIME: <span data-field="summaryLifetime">${money(entry.lifetimeEarned)}</span> | VAULT: <span data-field="summaryVault">${money(entry.vaultAmount)}</span></small>
          <small>STREAK: <span data-field="summaryStreak">${entry.currentStreak}</span> | LAST VISIT: <span data-field="summaryLastVisit">${dateAgo(entry.lastVisited)}</span></small>
        </div>
      </div>
    </main>
  `, "library");
}

async function handleAction(event) {
  const node = event.currentTarget;
  const action = node.dataset.action;
  toast = "";

  if (action === "home") route = { name: "home" };
  if (action === "detail") route = { name: "detail", domain: node.dataset.domain };
  if (action === "library") route = { name: "library" };
  if (action === "domainSummary") route = { name: "domainSummary", domain: node.dataset.domain };
  if (action === "picker") route = { name: "picker", slotId: Number(node.dataset.slot) };
  if (action === "mode") buyMode = node.dataset.mode;
  if (action === "finishOnboarding") await act("completeOnboarding");
  if (action === "addCurrent") await act("addCurrentSite", { slotId: Number(node.dataset.slot) });
  if (action === "assignTyped") {
    const slotId = Number(node.dataset.slot);
    const input = app.querySelector(`[data-manual-domain][data-slot="${slotId}"]`);
    await act("assignDomain", { slotId, domain: input?.value || "" });
  }
  if (action === "assign") {
    if (confirm(`Assign ${node.dataset.domain} to slot ${node.dataset.slot}?`)) {
      await act("assignDomain", { slotId: Number(node.dataset.slot), domain: node.dataset.domain });
    }
  }
  if (action === "buy") await act("buyUpgrade", { domain: node.dataset.domain, upgradeId: node.dataset.upgrade, mode: buyMode });
  if (action === "claim") await act("claimRevisit", { domain: node.dataset.domain });
  if (action === "unlock") await act("unlockSlot");
  if (action === "tier") await act("upgradeSlotTier", { slotId: Number(node.dataset.slot) });
  if (action === "devCash") await act("devAddCash", { amount: 10000 });
  if (action === "devPrestige") await act("devAddCachePoints", { amount: 10 });
  if (action === "devReset" && confirm("Reset only current cash and CP?")) await act("devResetCashAndCachePoints");
  if (action === "remove" && confirm("Remove this domain from the slot?")) await act("removeDomain", { slotId: Number(node.dataset.slot) });
  if (action === "prestige" && confirm("Clear Cache resets cash, upgrades, vaults, and streaks for Cache Points.")) await act("prestige");

  render();
}

async function act(type, payload = {}) {
  const result = await send(type, payload);
  if (!result?.ok) showToast(result?.error || "Action failed.");
  else if (type === "prestige") showToast(`CLEAR CACHE AWARDED ${result.award} CP.`);
  else showToast("SUCCESS");
  snapshot = await send("snapshot");
  resetLiveTickerBaseline();
}

function render() {
  if (!snapshot) return;
  if (route.name === "detail") return renderDetail(route.domain);
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
