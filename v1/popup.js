// Keep a persistent port open for the duration of the popup's lifetime.
// background.js listens for this to know the popup is open and which normal
// window to keep counting as eligible while the popup has OS focus.
chrome.runtime.connect({ name: "popup" });

const app = document.getElementById("app");
let snapshot = null;
let route = { name: "home" };
let buyMode = "1";
let detailTab = "dashboard";
let detailUpgradeTab = "active";
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
let balanceRoll = null;
let balanceRollFrame = null;
let onboardingSurfaceRestored = false;

const FEEDBACK_FORM_URL = "https://forms.gle/GP8nFvBRYaw4nWds5";
const iconPath = (index) => `icons/Icon14_${String(index).padStart(2, "0")}.png`;
const BUY_MODES = ["1", "10"];
const {
  BASE_RATE,
  TRAFFIC_ENGINE_MULTIPLIER,
  FIRST_PRESTIGE_LIFETIME_REQUIREMENT,
  VAULT_TRAFFIC_EXPONENT,
  BACKGROUND_TRAFFIC_EXPONENT,
  DAILY_BASE_MINUTES,
  NAVIGATION_EVENT_SECONDS,
  WAKE_BURST_SECONDS,
  MASTERY_RANK_CAP,
  MASTERY_INCOME_PER_RANK,
  MASTERY_VAULT_CAP_PER_RANK,
  toSci,
  sciToNumber,
  sciCompare,
  sciAdd,
  sciSub,
  prestigeTotalFromLifetime,
  cacheCoreMultiplier,
  cacheCoreCost,
  SUPPORTER_CORE_MULTIPLIER,
  getUpgradeLevel: upgradeLevel,
  masteryRank,
  masteryIncomeMultiplier,
  masteryVaultCapMultiplier,
  masteryLifetimeRequirement,
  masteryCcCost,
  upgradeCost,
  slotTierBonus,
  slotTierCost: mathSlotTierCost,
  vaultCap: mathVaultCap,
  vaultRate: mathVaultRate,
  domainBaseRate: mathDomainBaseRate,
  tabMultiplier,
  focusMultiplier,
  coldStorageMultiplier,
  vaultPumpMultiplier,
  dailyBootMultiplier,
  dailyStreakMultiplier,
  activeIncomePerSecond: mathActiveIncomePerSecond,
  backgroundIncomePerSecond: mathBackgroundIncomePerSecond,
  dailyFirstOpenBonus: mathDailyFirstOpenBonus,
  dailyFirstOpenBonusForStreak: mathDailyFirstOpenBonusForStreak,
  navigationPayoutForLevel: mathNavigationPayoutForLevel,
  wakeBurstForLevel: mathWakeBurstForLevel
} = BrowserTycoonMath;

function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload }).catch((error) => ({
    ok: false,
    error: error?.message || "Background worker did not respond."
  }));
}

function isValidSnapshot(value) {
  return Boolean(
    value?.sync &&
    value?.local &&
    Array.isArray(value.sync.slots) &&
    value.local.domainLibrary &&
    value.local.presence
  );
}

async function refresh({ full = false } = {}) {
  const nextSnapshot = await send("snapshot");
  if (!isValidSnapshot(nextSnapshot)) {
    if (!snapshot) {
      renderLoadError(nextSnapshot?.error || "Could not load game state.");
    } else {
      showToast(nextSnapshot?.error || "Could not refresh game state.", "warning");
    }
    return;
  }
  const shouldAnimateOpeningGain =
    full &&
    !snapshot &&
    displaysAsPositiveMoney(nextSnapshot.balanceGainSinceLastPopup || 0) &&
    !(nextSnapshot.welcomeBack && sciCompare(nextSnapshot.welcomeBack.total, 0) > 0);
  snapshot = nextSnapshot;
  if (!onboardingSurfaceRestored) {
    await restoreOnboardingSurface();
    onboardingSurfaceRestored = true;
  }
  syncWelcomeBackModal();
  resetLiveTickerBaseline();
  if (shouldAnimateOpeningGain) showCollectBurst(nextSnapshot.balanceGainSinceLastPopup);
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

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function balanceRollValue() {
  if (!balanceRoll) return null;
  const progress = Math.min(1, (Date.now() - balanceRoll.startedAt) / balanceRoll.duration);
  if (progress >= 1) return balanceRoll.to;
  const eased = easeOutCubic(progress);
  if (balanceRoll.from.e < 15 && balanceRoll.to.e < 15) {
    const from = sciToNumber(balanceRoll.from);
    const to = sciToNumber(balanceRoll.to);
    return toSci(from + (to - from) * eased);
  }
  if (balanceRoll.from.e === balanceRoll.to.e) {
    return toSci({
      m: balanceRoll.from.m + (balanceRoll.to.m - balanceRoll.from.m) * eased,
      e: balanceRoll.to.e
    });
  }
  return eased < 0.72 ? balanceRoll.from : balanceRoll.to;
}

function displayBalance() {
  return balanceRollValue() || liveBalance();
}

function startLiveTicker() {
  if (tickerStarted) return;
  tickerStarted = true;
  setInterval(() => {
    if (!isValidSnapshot(snapshot)) return;
    setText("balance", money(displayBalance()));
    setText("income", `+${money(liveIncomePerSecond)}/sec`);
    patchAffordability(liveBalance());
  }, 250);
}

function setText(field, value) {
  app.querySelectorAll(`[data-field="${field}"]`).forEach((node) => {
    if (node.textContent !== String(value)) node.textContent = value;
  });
}

function syncCollectBurstNode() {
  app.querySelectorAll("[data-field='collectBurst']").forEach((node) => {
    if (collectBurst && displaysAsPositiveMoney(collectBurst)) {
      node.textContent = `+${money(collectBurst)}`;
      node.hidden = false;
    } else {
      node.textContent = "";
      node.hidden = true;
    }
  });
}

function setDisabled(selector, disabled) {
  app.querySelectorAll(selector).forEach((node) => {
    node.disabled = disabled;
  });
}

function patchDynamicFields() {
  if (!isValidSnapshot(snapshot)) return;
  setText("balance", money(displayBalance()));
  setText("income", `+${money(liveIncomePerSecond)}/sec`);
  syncCollectBurstNode();
  setText("cacheCredits", cc(snapshot.sync.cacheCredits));
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
  if (!snapshot?.sync?.onboardingComplete) {
    if (modal?.name === "welcomeBack") modal = null;
    return;
  }
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
  bindFaviconFallbacks(list);
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
      const cap = vaultCap(entry);
      const vaultReady = sciCompare(entry?.vaultAmount || 0, cap) >= 0;
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
  const cap = vaultCap(entry);
  const vaultPercent = vaultProgressPercent(entry.vaultAmount, cap);
  setText("detailVault", money(entry.vaultAmount));
  setText("detailVaultCap", money(cap));
  setText("detailVaultRate", `${money(vaultRate(entry))}/sec`);
  setText("detailVaultPercent", `${Math.floor(vaultPercent)}%`);
  const vaultProgress = app.querySelector('[data-field="detailVaultProgress"]');
  if (vaultProgress) vaultProgress.style.width = `${vaultPercent}%`;
  const vaultTrack = app.querySelector('[data-field="detailVaultTrack"]');
  if (vaultTrack) {
    vaultTrack.classList.toggle("is-full", vaultPercent >= 100);
    vaultTrack.setAttribute("aria-valuenow", String(Math.floor(vaultPercent)));
  }
  setText("detailState", state.text);
  setText("detailIncome", `${money(incomeFor(domain))}/sec`);
  setText("detailBaseIncome", `${money(domainBaseRate(entry))}/sec`);
  const slot = currentSlot(domain);
  setText("detailSlotMultiplier", `x${tierBonus(slot).toFixed(2)}`);
  const rank = masteryRank(entry);
  const mastery = masteryProgress(entry);
  setText("detailMasteryRank", `${rank}/${MASTERY_RANK_CAP}`);
  setText("detailMasteryIncome", `x${masteryIncomeMultiplier(rank).toFixed(2)}`);
  setText("detailMasteryVault", `x${masteryVaultCapMultiplier(rank).toFixed(2)}`);
  setText("detailMasteryProgressLabel", masteryProgressLabel(entry, mastery));
  const masteryProgressFill = app.querySelector('[data-field="detailMasteryProgress"]');
  if (masteryProgressFill) masteryProgressFill.style.width = `${mastery.percent}%`;
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
  app.querySelectorAll("[data-action='upgradeDomainMastery'][data-domain]").forEach((button) => {
    const entry = entryFor(button.dataset.domain);
    button.disabled = !entry || !canUpgradeMastery(entry);
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

function displaysAsPositiveMoney(value) {
  return money(value) !== "$0.00";
}

function vaultProgressPercent(value, cap) {
  const current = toSci(value);
  const maximum = toSci(cap);
  if (current.m <= 0 || maximum.m <= 0) return 0;
  if (sciCompare(current, maximum) >= 0) return 100;
  const exponentDelta = current.e - maximum.e;
  if (exponentDelta < -16) return 0;
  const ratio = (current.m / maximum.m) * Math.pow(10, exponentDelta);
  return Math.max(0, Math.min(100, ratio * 100));
}

function cc(value) {
  const suffixes = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
  const sci = toSci(value);
  if (sci.m === 0) return "0";
  if (sci.e < 3) return String(Math.floor(sciToNumber(sci)));
  const suffix = Math.floor(sci.e / 3);
  if (suffix >= 0 && suffix < suffixes.length) {
    const amount = sci.m * Math.pow(10, sci.e - suffix * 3);
    return `${Math.floor(amount)}${suffixes[suffix]}`;
  }
  return `${Math.floor(sci.m)}e${sci.e}`;
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
  return ["BASIC", "BRONZE", "SILVER", "GOLD", "PLATINUM", "PRISMATIC"][tier] || `TIER ${tier}`;
}

function slotTierLabel(tier) {
  const material = tierMaterial(tier);
  const rank = tierName(tier);
  return rank === "0" ? material : `${material} ${rank}`;
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

function supporterCoreMultiplier() {
  return Number(snapshot?.premium?.multiplier || 1);
}

function supporterCorePaid() {
  return Boolean(snapshot?.premium?.supporterCorePaid);
}

function domainBaseRate(entry) {
  return mathDomainBaseRate(entry, cacheCoreLevel());
}

function backgroundBaseRateEstimate(entry) {
  const trafficRatio = Math.pow(TRAFFIC_ENGINE_MULTIPLIER, upgradeLevel(entry, "trafficEngine"));
  return BASE_RATE * cacheCoreMultiplier(cacheCoreLevel()) * Math.pow(trafficRatio, BACKGROUND_TRAFFIC_EXPONENT);
}

function vaultTrafficScaleEstimate(entry) {
  return Math.pow(Math.pow(TRAFFIC_ENGINE_MULTIPLIER, upgradeLevel(entry, "trafficEngine")), VAULT_TRAFFIC_EXPONENT);
}

function dailyStreakMultiplierFor(entry, streak = entry?.currentStreak || 0) {
  return dailyStreakMultiplier(streak, upgradeLevel(entry, "dailyBoot"));
}

function masteryUnlocked() {
  return Boolean(snapshot?.mastery?.unlocked || Number(snapshot?.sync?.prestigeCount || 0) >= 1);
}

function masteryLifetime(entry) {
  return toSci(entry?.masteryLifetimeEarned || entry?.lifetimeEarned || 0);
}

function nextMasteryRank(entry) {
  const rank = masteryRank(entry);
  return rank >= MASTERY_RANK_CAP ? null : rank + 1;
}

function masteryProgress(entry) {
  const rank = masteryRank(entry);
  const nextRank = nextMasteryRank(entry);
  if (!nextRank) return { rank, nextRank: null, requirement: 0, percent: 100, cost: 0, eligible: false };
  const requirement = masteryLifetimeRequirement(nextRank);
  const current = sciToNumber(masteryLifetime(entry));
  const percent = Math.max(0, Math.min(100, requirement > 0 ? (current / requirement) * 100 : 0));
  return {
    rank,
    nextRank,
    requirement,
    percent,
    cost: masteryCcCost(nextRank),
    eligible: sciCompare(masteryLifetime(entry), requirement) >= 0
  };
}

function masteryProgressLabel(entry, progress = masteryProgress(entry)) {
  if (!progress.nextRank) return "MAX RANK";
  return `${money(masteryLifetime(entry))} / ${money(progress.requirement)} mastery lifetime`;
}

function canUpgradeMastery(entry) {
  const progress = masteryProgress(entry);
  return masteryUnlocked()
    && progress.nextRank
    && progress.eligible
    && Number(snapshot?.sync?.cacheCredits || 0) >= progress.cost;
}

function vaultCap(entry, coldLevel) {
  return mathVaultCap(entry, coldLevel, cacheCoreLevel(), supporterCoreMultiplier());
}

function vaultRate(entry, storageLevel) {
  return mathVaultRate(entry, storageLevel, cacheCoreLevel(), supporterCoreMultiplier());
}

function activeIncomeEstimate(entry, slot) {
  return mathActiveIncomePerSecond(entry, slot, cacheCoreLevel(), supporterCoreMultiplier());
}

function backgroundIncomePerSecond(entry, slot, backgroundSince, now) {
  return mathBackgroundIncomePerSecond(entry, slot, backgroundSince, now, cacheCoreLevel(), supporterCoreMultiplier());
}

function dailyFirstOpenBonus(entry, slot) {
  return mathDailyFirstOpenBonus(entry, slot, cacheCoreLevel(), supporterCoreMultiplier());
}

function dailyFirstOpenBonusForStreak(entry, slot, streak) {
  return mathDailyFirstOpenBonusForStreak(entry, slot, streak, cacheCoreLevel(), supporterCoreMultiplier());
}

function navigationPayoutForLevel(entry, slot, level) {
  return mathNavigationPayoutForLevel(entry, slot, level, cacheCoreLevel(), supporterCoreMultiplier());
}

function wakeBurstForLevel(entry, slot, level) {
  return mathWakeBurstForLevel(entry, slot, level, cacheCoreLevel(), supporterCoreMultiplier());
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
  if (state === "active") return { text: "[ACTIVE]", className: "focused" };
  if (state === "background") return { text: "[BACKGROUND]", className: "background" };
  return { text: "[INACTIVE]", className: "closed" };
}

function currentRateTooltip(domain, entry, slot) {
  const presence = snapshot.local.presence[domain];
  const base = money(domainBaseRate(entry));
  const cache = cacheCoreMultiplier(cacheCoreLevel()).toFixed(2);
  const traffic = Math.pow(TRAFFIC_ENGINE_MULTIPLIER, upgradeLevel(entry, "trafficEngine")).toFixed(2);
  const tab = tabMultiplier(upgradeLevel(entry, "tabMultiplier")).toFixed(2);
  const tier = tierBonus(slot).toFixed(2);
  const mastery = masteryIncomeMultiplier(entry).toFixed(2);
  const supporter = supporterCorePaid() ? ` x supporter core (${supporterCoreMultiplier().toFixed(2)})` : "";
  if (presence?.state === "active") {
    const focus = focusMultiplier(upgradeLevel(entry, "focusBonus")).toFixed(2);
    return `Active rate = domain base (${base}/sec, global base x Cache Core ${cache} x Traffic Engine ${traffic}) x tab multiplier (${tab}) x focus bonus (${focus}) x slot multiplier (${tier}) x Mastery (${mastery})${supporter}.`;
  }
  if (presence?.state === "background") {
    const backgroundBase = money(backgroundBaseRateEstimate(entry));
    const backgroundTraffic = Math.pow(Math.pow(TRAFFIC_ENGINE_MULTIPLIER, upgradeLevel(entry, "trafficEngine")), BACKGROUND_TRAFFIC_EXPONENT).toFixed(2);
    const hum = (0.08 * upgradeLevel(entry, "backgroundHum")).toFixed(2);
    const idleSeconds = Math.max(0, (Date.now() - (presence.backgroundSince || Date.now())) / 1000);
    const idle = (1 + 0.1 * upgradeLevel(entry, "idleDepth") * Math.min(idleSeconds / 300, 5)).toFixed(2);
    return `Background rate = background base (${backgroundBase}/sec, global base x Cache Core ${cache} x Traffic contribution ${backgroundTraffic} from Traffic Engine^${BACKGROUND_TRAFFIC_EXPONENT.toFixed(2)}) x tab multiplier (${tab}) x background hum (${hum}) x idle depth (currently ${idle}) x slot multiplier (${tier}) x Mastery (${mastery})${supporter}.`;
  }
  return "Inactive: this domain is not currently open as an active or background tab, so its current rate is $0.00/sec.";
}

function vaultTooltip(entry) {
  const cache = cacheCoreMultiplier(cacheCoreLevel()).toFixed(2);
  const traffic = vaultTrafficScaleEstimate(entry).toFixed(2);
  const pump = vaultPumpMultiplier(upgradeLevel(entry, "storageDuration")).toFixed(2);
  const storage = coldStorageMultiplier(upgradeLevel(entry, "coldStorage")).toFixed(2);
  const masteryIncome = masteryIncomeMultiplier(entry).toFixed(2);
  const masteryCap = masteryVaultCapMultiplier(entry).toFixed(2);
  const supporter = supporterCorePaid() ? ` x Supporter Core ${supporterCoreMultiplier().toFixed(2)}` : "";
  return `Vault fill = vault base (${money(BASE_RATE * 0.02)}/sec) x Cache Core ${cache} x vault traffic ${traffic} x Vault Pump ${pump} x Mastery ${masteryIncome}${supporter}. Vault cap = global base (${money(BASE_RATE)}/sec) x Cache Core ${cache} x 25 minutes x vault traffic ${traffic} x Cold Storage ${storage} x Mastery ${masteryCap}${supporter}. Collected vault pays the stored amount.`;
}

function faviconPageUrl(source) {
  const domain = typeof source === "string" ? source : source?.domain;
  const hint = typeof source === "string" ? null : source?.faviconPageUrl;
  try {
    const parsed = new URL(hint || "");
    if (["http:", "https:"].includes(parsed.protocol) && parsed.hostname) return `${parsed.protocol}//${parsed.hostname.toLowerCase()}/`;
  } catch {}
  const normalized = String(domain || "").trim().toLowerCase().replace(/^www\./, "");
  const host = normalized.split(".").length === 2 ? `www.${normalized}` : normalized;
  return `https://${host}/`;
}

function favicon(source, className = "slot-icon") {
  const pageUrl = faviconPageUrl(source);
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", "64");
  return `<img class="${className}" src="${url.toString()}" alt="" data-favicon-fallback>`;
}

function bindFaviconFallbacks(root = app) {
  root.querySelectorAll("[data-favicon-fallback]").forEach((node) => {
    node.addEventListener("error", () => {
      node.removeAttribute("data-favicon-fallback");
      node.src = iconPath(1);
    }, { once: true });
  });
}

function shell(content, activeNav = "slots") {
  const previousRouteKey = lastRenderedRouteKey;
  const nextRouteKey = routeKey();
  const scrollTop = previousRouteKey === nextRouteKey ? app.querySelector(".view")?.scrollTop || 0 : 0;
  app.innerHTML = `
    ${renderHeader()}
    ${content}
    ${renderFooter(activeNav)}
    ${renderGlobalOnboardingPrompt()}
    ${renderModal()}
    ${toast ? `<div class="toast toast-${toastType}">${toast}</div>` : ""}
  `;
  app.querySelectorAll("[data-action]").forEach((node) => {
    node.addEventListener("click", handleAction);
  });
  bindFaviconFallbacks();
  app.querySelectorAll("[data-notification-setting]").forEach((node) => {
    node.addEventListener("change", handleNotificationToggle);
  });
  const searchNode = app.querySelector("[data-search]");
  if (searchNode) {
    searchNode.value = search;
    searchNode.addEventListener("input", (event) => {
      search = event.target.value;
      patchLibraryList();
    });
  }
  app.querySelectorAll("[data-manual-domain]").forEach((node) => {
    node.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      app.querySelector(`[data-action="assignTyped"][data-slot="${node.dataset.slot}"]`)?.click();
    });
  });
  lastRenderedRouteKey = nextRouteKey;
  if (scrollTop) {
    requestAnimationFrame(() => {
      const view = app.querySelector(".view");
      if (view) view.scrollTop = scrollTop;
    });
  }
  patchDynamicFields();
  initUpgradeTooltips();
}

function renderModal() {
  if (modal?.name === "welcomeBack") return renderWelcomeBackModal();
  if (modal?.name === "settings") return renderSettingsModal();
  if (modal?.name === "slotUpgradeList") return renderSlotUpgradeListModal();
  if (modal?.name === "slotUpgradeDetail") return renderSlotUpgradeDetailModal(modal.slotId);
  if (modal?.name === "swapDomain") return renderSwapDomainModal();
  if (modal?.name === "domainDetails") return renderDomainDetailsModal(modal.domain, modal.source);
  if (modal?.name === "cacheCore") return renderCacheCoreModal();
  if (modal?.name === "confirm") return renderConfirmModal();
  if (modal?.name === "domainManage") return renderDomainManageModal(modal.slotId);
  if (modal !== "prestige") return "";
  const award = prestigeAwardEstimate();
  const resetTutorialStep = onboardingStep() === "resetProgress";
  const showFirstPrestigeProgress = resetTutorialStep || Number(snapshot?.sync?.prestigeCount || 0) < 1;
  const firstPrestigeLocked = resetTutorialStep || isFirstPrestigeLocked();
  const progress = showFirstPrestigeProgress
    ? Math.max(0, Math.min(1, sciToNumber(snapshot.sync.totalLifetimeEarned) / FIRST_PRESTIGE_LIFETIME_REQUIREMENT))
    : firstPrestigeProgress();
  const displayedLifetime = showFirstPrestigeProgress && sciCompare(snapshot.sync.totalLifetimeEarned, FIRST_PRESTIGE_LIFETIME_REQUIREMENT) > 0
    ? FIRST_PRESTIGE_LIFETIME_REQUIREMENT
    : snapshot.sync.totalLifetimeEarned;
  return `
    <div class="modal-scrim" role="presentation">
      ${resetTutorialStep ? `
        <div class="onboarding-callout onboarding-callout-reset-progress">
          <strong>Step 12: Unlock your first reset.</strong>
          <span>Reach ${money(FIRST_PRESTIGE_LIFETIME_REQUIREMENT)} in lifetime earnings to unlock your first Clear Cache. Click <strong>CANCEL</strong> to continue.</span>
        </div>
      ` : ""}
      <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="prestigeTitle">
        <div class="modal-kicker">PRESTIGE RESET</div>
        <h2 id="prestigeTitle">CLEAR CACHE?</h2>
        <p>${resetTutorialStep || firstPrestigeLocked ? `Reach ${money(FIRST_PRESTIGE_LIFETIME_REQUIREMENT)} lifetime earnings to unlock your first Clear Cache.` : "Reset cash, upgrades, vaults, and streaks. Slot prestige tiers stay, and tiered slots remain permanently unlocked."}</p>
        ${showFirstPrestigeProgress ? `
          <div class="prestige-lock${resetTutorialStep ? " tutorial-target tutorial-target-panel tutorial-highlight-only" : ""}">
            <div class="prestige-lock-row">
              <span>LIFETIME PROGRESS</span>
              <strong>${money(displayedLifetime)} / ${money(FIRST_PRESTIGE_LIFETIME_REQUIREMENT)}</strong>
            </div>
            <div class="prestige-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(progress * 100)}">
              <div class="prestige-progress-fill" style="width:${Math.max(0, Math.min(100, progress * 100)).toFixed(1)}%"></div>
            </div>
          </div>
        ` : ""}
        ${firstPrestigeLocked ? "" : `<div class="modal-reward">
          <span>CACHE CREDITS</span>
          <strong>+${cc(award)} CC</strong>
        </div>`}
        <div class="modal-actions">
          <button class="btn${resetTutorialStep ? " tutorial-target" : ""}" data-action="cancelModal">CANCEL</button>
          <button class="btn btn-prestige" data-action="confirmPrestige" ${firstPrestigeLocked ? "disabled" : ""}>${firstPrestigeLocked ? "LOCKED" : "CLEAR CACHE"}</button>
        </div>
      </section>
    </div>
  `;
}

function notificationSettings() {
  const settings = {
    enabled: false,
    vaultFull: true,
    bigPayout: true,
    streakRisk: true,
    ...(snapshot?.sync?.notificationSettings || {})
  };
  settings.enabled = Boolean(settings.vaultFull || settings.bigPayout || settings.streakRisk);
  return settings;
}

function renderNotificationToggle(key, label) {
  const settings = notificationSettings();
  return `
    <label class="settings-toggle${key === "enabled" ? " settings-toggle-parent" : " settings-toggle-child"}">
      <span>
        <strong>${label}</strong>
      </span>
      <input type="checkbox" data-notification-setting="${key}" ${settings[key] ? "checked" : ""}>
    </label>
  `;
}

function formatCloudSaveTime(value) {
  if (!value) return "NEVER";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function renderCloudSaveSection() {
  const meta = snapshot?.cloudSaveMeta;
  return `
    <div class="settings-cloud">
      <div>
        <strong>Cloud Save</strong>
        <small>${meta ? `${formatCloudSaveTime(meta.savedAt)} | ${money(meta.totalLifetimeEarned)} lifetime` : "No synced save."}</small>
      </div>
      <div class="settings-cloud-actions">
        <button class="btn" data-action="cloudSyncSave">SYNC SAVE</button>
        <button class="btn" data-action="cloudLoadSave" ${meta ? "" : "disabled"}>LOAD SAVE</button>
      </div>
    </div>
  `;
}

function renderFeedbackSection() {
  return `
    <button class="btn settings-feedback" data-action="openFeedback">LEAVE FEEDBACK</button>
  `;
}

function renderSettingsModal() {
  return `
    <div class="modal-scrim" role="presentation">
      <section class="modal-panel settings-modal" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
        <h2 id="settingsTitle">SETTINGS</h2>
        <div class="settings-list">
          ${renderNotificationToggle("enabled", "Allow notifications")}
          <div class="settings-sublist" aria-label="Notification types">
            ${renderNotificationToggle("vaultFull", "All vaults full")}
            ${renderNotificationToggle("bigPayout", "Big payout")}
            ${renderNotificationToggle("streakRisk", "Streak at risk")}
          </div>
        </div>
        ${renderCloudSaveSection()}
        ${renderFeedbackSection()}
        <div class="modal-actions single">
          <button class="btn btn-prestige" data-action="cancelModal">DONE</button>
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
        <div class="modal-reward modal-reward-stacked">
          <span>GLOBAL BASE RATE</span>
          <strong>${money(cacheCoreBaseRate(level))}/sec → ${money(cacheCoreBaseRate(level + 1))}/sec</strong>
        </div>
        <div class="detail-stat-section">
          <div class="detail-stat-row">
            <span>LEVEL</span>
            <strong data-field="cacheCoreLevel">${level}</strong>
          </div>
          <div class="detail-stat-row">
            <span>NEXT COST</span>
            <strong>${cc(cost)} CC</strong>
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
  return "Raises the base rate for every domain before tab, focus, background, vault, daily, navigation, wake, and slot tier multipliers.";
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
        <strong>${disabled ? "MAX" : `${cc(cost)} CC`}</strong>
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
            <strong>${nextTier ? `${cc(cost)} CC` : "MAX"}</strong>
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
  const baseChange = `SLOT INCOME x${currentBonus} → x${nextBonus}`;
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
            <strong>${money(floorToCent(award.total))}</strong>
          </div>
        </div>
        <div class="modal-actions single">
          <button class="btn btn-collect" data-action="collectWelcomeBack">COLLECT</button>
        </div>
      </section>
    </div>
  `;
}

function renderDomainManageModal(slotId) {
  const slot = snapshot.sync.slots.find((item) => item.id === Number(slotId));
  if (!slot) return "";
  const nextTier = nextSlotTier(slot);
  const nextTierCost = nextTier ? slotTierCost(slot, nextTier) : null;
  const affordable = nextTier && snapshot.sync.cacheCredits >= nextTierCost;

  return `
    <div class="modal-scrim" role="presentation">
      <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="manageTitle">
        <div class="modal-kicker">SLOT ${slot.id}</div>
        <h2 id="manageTitle">MANAGE DOMAIN</h2>
        <div style="margin-bottom: 15px;">
          <button class="btn btn-prestige" data-action="tier" data-slot="${slot.id}" style="width:100%; margin-bottom:10px;" ${nextTier && affordable ? "" : "disabled"}>${nextTier ? `UPGRADE TO ${tierMaterial(nextTier.tier)} (${cc(nextTierCost)} CC)` : "SLOT MAXED"}</button>
          <button class="btn" data-action="picker" data-slot="${slot.id}" style="width:100%; margin-bottom:10px;">SWAP DOMAIN</button>
          <button class="btn btn-danger" data-action="remove" data-slot="${slot.id}" style="width:100%;">REMOVE FROM SLOT</button>
        </div>
        <div class="modal-actions single">
          <button class="btn" data-action="cancelModal">CLOSE</button>
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
        <p style="margin-bottom: 12px;">${modal.body}</p>
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
    ["Mastery", `Rank ${masteryRank(entry)}/${MASTERY_RANK_CAP}`],
    ["Mastery Lifetime", money(masteryLifetime(entry))],
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
              ["Active", "LOCKED"],
              ["Background", "LOCKED"],
              ["Vault", money(entry.vaultAmount)]
            ])}
          </div>
          <div class="modal-actions single">
            ${fromLibrary ? `<button class="btn btn-danger" data-action="deleteDomainPrompt" data-domain="${domain}">DELETE DOMAIN</button>` : ""}
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
  const dailyBootLevel = upgradeLevel(entry, "dailyBoot");
  const slotStreak = slot?.streakBonusTier || 0;
  return `
    <div class="modal-scrim" role="presentation">
      <section class="modal-panel detail-modal" role="dialog" aria-modal="true" aria-labelledby="domainDetailsTitle">
        <div class="modal-kicker">DOMAIN DETAILS</div>
        <h2 id="domainDetailsTitle">${domain.toUpperCase()}</h2>
        <div class="detail-grid">
          ${fromLibrary ? renderLibraryDomainInfo(entry) : ""}
          ${renderDetailStatSection("RATES", [
            ["Active", `${money(activeIncomeEstimate(entry, slot))}/sec`],
            ["Background", `${money(backgroundIncomeEstimate(entry, slot, 0))}/sec`],
            ["Background Max Idle", `${money(backgroundIncomeEstimate(entry, slot, 1500))}/sec`],
            ["Inactive", "$0.00/sec"]
          ])}
          ${renderDetailStatSection("EVENT BONUSES", [
            ["Navigation / event", navLevel > 0 ? money(navigationPayoutForLevel(entry, slot, navLevel)) : "LOCKED"],
            ["Nav Formula", navLevel > 0 ? `active/s x ${NAVIGATION_EVENT_SECONDS}s x sqrt(${navLevel})` : "LOCKED"],
            ["Wake / event", wakeLevel > 0 ? money(wakeBurstForLevel(entry, slot, wakeLevel)) : "LOCKED"],
            ["Wake Formula", wakeLevel > 0 ? `base/s x ${WAKE_BURST_SECONDS}s x level^1.1` : "LOCKED"]
          ])}
          ${renderDetailStatSection("VAULT + STREAK", [
            ["Vault Stored", money(entry.vaultAmount)],
            ["Vault Cap", money(vaultCap(entry))],
            ["Vault Fill", `${money(vaultRate(entry))}/sec`],
            ["Daily First-Open", money(dailyFirstOpenBonus(entry, slot))],
            ["Daily Base", `${money(Math.max(20, domainBaseRate(entry) * 60 * DAILY_BASE_MINUTES * masteryIncomeMultiplier(entry)) * supporterCoreMultiplier())}`],
            ["Daily Boot", `x${dailyBootMultiplier(dailyBootLevel).toFixed(2)}`],
            ["Streak Mult", `x${dailyStreakMultiplierFor(entry, currentStreak).toFixed(2)}`],
            ["Next Streak Mult", `x${dailyStreakMultiplierFor(entry, nextStreak).toFixed(2)}`],
            ["Slot Streak", `x${(1 + slotStreak * 0.15).toFixed(2)}`],
            ["Next Daily Bonus", money(dailyFirstOpenBonusForStreak(entry, slot, nextStreak))]
          ])}
          ${renderDetailStatSection("MASTERY", [
            ["Rank", `${masteryRank(entry)}/${MASTERY_RANK_CAP}`],
            ["Mastery Lifetime", money(masteryLifetime(entry))],
            ["Income", `x${masteryIncomeMultiplier(entry).toFixed(2)}`],
            ["Vault Cap", `x${masteryVaultCapMultiplier(entry).toFixed(2)}`],
            ["Per Rank", `+${Math.round(MASTERY_INCOME_PER_RANK * 100)}% income / +${Math.round(MASTERY_VAULT_CAP_PER_RANK * 100)}% vault cap`],
            ["Next Requirement", nextMasteryRank(entry) ? money(masteryLifetimeRequirement(nextMasteryRank(entry))) : "MAX"],
            ["Next Cost", nextMasteryRank(entry) ? `${cc(masteryCcCost(nextMasteryRank(entry)))} CC` : "MAX"]
          ])}
          ${renderDetailStatSection("MULTIPLIERS", [
            ["Base Income", `${money(domainBaseRate(entry))}/sec`],
            ["Background Base", `${money(backgroundBaseRateEstimate(entry))}/sec`],
            ["Traffic Scale", `x${Math.pow(TRAFFIC_ENGINE_MULTIPLIER, upgradeLevel(entry, "trafficEngine")).toFixed(2)}`],
            ["Vault Traffic", `x${vaultTrafficScaleEstimate(entry).toFixed(2)}`],
            ["Slot Tier", `x${tierBonus(slot).toFixed(2)}`],
            ["Mastery Income", `x${masteryIncomeMultiplier(entry).toFixed(2)}`],
            ["Mastery Vault", `x${masteryVaultCapMultiplier(entry).toFixed(2)}`],
            ...supporterCoreDetailRow(),
            ["Tab", `x${tabMultiplier(upgradeLevel(entry, "tabMultiplier")).toFixed(2)}`],
            ["Focus", `x${focusMultiplier(upgradeLevel(entry, "focusBonus")).toFixed(2)}`],
            ["Cold Storage", `x${coldStorageMultiplier(upgradeLevel(entry, "coldStorage")).toFixed(2)}`],
            ["Vault Pump", `x${vaultPumpMultiplier(upgradeLevel(entry, "storageDuration")).toFixed(2)}`]
          ])}
        </div>
        <div class="modal-actions single">
          ${fromLibrary ? `<button class="btn btn-danger" data-action="deleteDomainPrompt" data-domain="${domain}">DELETE DOMAIN</button>` : ""}
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

function isFirstPrestigeLocked() {
  return Number(snapshot?.sync?.prestigeCount || 0) < 1
    && sciCompare(snapshot?.sync?.totalLifetimeEarned || 0, FIRST_PRESTIGE_LIFETIME_REQUIREMENT) < 0;
}

function firstPrestigeProgress() {
  if (!isFirstPrestigeLocked()) return 1;
  return Math.max(0, Math.min(1, sciToNumber(snapshot.sync.totalLifetimeEarned) / FIRST_PRESTIGE_LIFETIME_REQUIREMENT));
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

function renderLoadError(message) {
  app.innerHTML = `
    <main class="view active">
      <div class="vault-panel">
        <div class="vault-info">
          <div>COULD NOT LOAD GAME STATE</div>
          <small>${escapeHtml(message)}</small>
        </div>
      </div>
    </main>
  `;
}

function renderHeader() {
  const currentTutorialStep = onboardingStep();
  return `
    <header class="header">
      <div class="balance-container">
        <div class="balance-row">
          <div class="balance${balanceRoll ? " balance-rolling" : ""}" data-field="balance">${money(displayBalance())}</div>
          <div class="collect-burst" data-field="collectBurst" ${collectBurst ? "" : "hidden"}>${collectBurst ? `+${money(collectBurst)}` : ""}</div>
        </div>
        <div class="income" data-field="income">+${money(liveIncomePerSecond)}/sec</div>
      </div>
      <div class="header-actions">
        <button class="btn btn-reset-cache${currentTutorialStep === "resetIntro" ? " tutorial-target" : ""}" data-action="prestige">RESET</button>
        <button class="prestige-currency${currentTutorialStep === "cacheCredits" ? " tutorial-target tutorial-highlight-only" : ""}" data-action="cacheCore" aria-label="Cache Credits and permanent upgrades">
          CC: <strong data-field="cacheCredits">${cc(snapshot.sync.cacheCredits)}</strong>
        </button>
        <button class="settings-button" data-action="settings" aria-label="Settings">⚙</button>
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
      <div class="upgrade-section-label" style="margin-top:20px;">PREMIUM STORE</div>
      ${renderSupporterCoreStoreItem()}
    </main>
  `, "store");
}

function renderSupporterCoreStoreItem() {
  const paid = supporterCorePaid();
  const price = snapshot?.premium?.price || "$1.99";
  const tooltip = `One-time ${price} purchase. Supporter Core gives a permanent x${SUPPORTER_CORE_MULTIPLIER.toFixed(2)} multiplier to active income, background income, vault fill, daily bonuses, navigation payouts, and wake bursts.`;
  return `
    <div class="premium-store-block">
      <div class="upgrade-item store-upgrade-item premium-store-item">
        <div class="upgrade-info" style="flex:1;">
          <img class="upgrade-icon" src="${iconPath(37)}" alt="">
          <div class="upgrade-details" data-tooltip="${escapeAttribute(tooltip)}">
            <div>
              <span class="upgrade-name">Supporter Core</span>
            </div>
            <div class="upgrade-desc">Permanent x${SUPPORTER_CORE_MULTIPLIER.toFixed(2)} all-income boost.</div>
          </div>
        </div>
        <button class="btn btn-buy ${paid ? "btn-premium-active" : ""}" ${paid ? "disabled" : `data-action="premiumPurchase"`}>
          <span>${paid ? "ACTIVE" : "BUY"}</span>
          ${paid ? "" : `<span style="font-size:12px">${price} USD</span>`}
        </button>
      </div>
      <button class="btn btn-restore-purchase" data-action="premiumRestore">RESTORE PURCHASE</button>
    </div>
    ${snapshot?.premium?.error ? `<div class="store-note warning-text">${escapeHtml(snapshot.premium.error)}</div>` : ""}
  `;
}

function supporterCoreDetailRow() {
  return supporterCorePaid() ? [["Supporter Core", `x${supporterCoreMultiplier().toFixed(2)} ACTIVE`]] : [];
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
            <span class="upgrade-level">Lvl ${level}</span>
          </div>
          <div class="upgrade-desc">Base rate ${money(cacheCoreBaseRate(level))}/sec → ${money(cacheCoreBaseRate(level + 1))}/sec</div>
        </div>
      </div>
      <button class="btn btn-buy" data-action="upgradeCacheCore" ${affordable ? "" : "disabled"}>
        <span>BUY</span>
        <span style="font-size:12px">${cc(cost)} CC</span>
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
  shell(`
    <main class="view active">
      ${renderOnboardingPrompt("slot")}
      <div class="slots-header">DOMAIN SLOTS</div>
      <div class="slots-grid">
        ${snapshot.sync.slots.map(renderSlot).join("")}
      </div>
      ${renderUnlockSlot()}
    </main>
  `, "slots");
}



function renderSlot(slot) {
  if (!slot.assignedDomain) {
    const tutorialClass = onboardingStep() === "slot" && slot.id === 1 ? " tutorial-target" : "";
    return `<button class="slot slot-empty${tutorialClass}" data-action="picker" data-slot="${slot.id}">+ ASSIGN DOMAIN</button>`;
  }
  const domain = slot.assignedDomain;
  const entry = entryFor(domain);
  const state = stateLabel(domain);
  const vaultReady = sciCompare(entry?.vaultAmount || 0, vaultCap(entry)) >= 0;
  const slotTutorial = onboardingStep() === "slot" && slot.id === 1;
  return `
    <button class="slot ${tierClass(slot.tier)}${slotTutorial ? " tutorial-target" : ""}" data-action="${slotTutorial ? "picker" : "detail"}" data-slot="${slot.id}" data-domain="${domain}">
      <div class="slot-info">
        ${favicon(entry || domain)}
        <div>
          <div class="slot-domain">${domain} <span class="slot-state ${state.className}" data-field="slot:${domain}:state">${state.text}</span></div>
          <div class="slot-tier">${slotTierLabel(slot.tier)} | <span data-field="slot:${domain}:income">${money(incomeFor(domain))}</span>/s | VAULT <span data-field="slot:${domain}:vault">${money(entry?.vaultAmount || 0)}</span></div>
        </div>
      </div>
      <div class="slot-badges">
        <div class="slot-streak ${streakDoneToday(entry) ? "active" : "inactive"}" data-field="slot:${domain}:streakBadge">
          <span class="slot-fire">⚡</span>
          <span data-field="slot:${domain}:streak">${displayStreak(entry)}</span>
        </div>
        <div class="slot-vault-ready" data-field="slot:${domain}:ready" ${vaultReady ? "" : "hidden"}>FULL</div>
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
      <div class="tutorial-logo-frame">
        <img class="tutorial-logo" src="bt-logo-transparent.png" alt="Browser Tycoon">
      </div>
      <h2>BUILD A BROWSING EMPIRE</h2>
      <p>Every site you visit can become a money engine. Slot your favorite domains, keep browsing, and watch your empire hum in the background.</p>
      <div class="tutorial-beats">
        <p><strong>Slot domains.</strong> Only websites in your slots earn cash, fill vaults, and build streaks.</p>
        <p><strong>Collect bursts.</strong> Come back to a site to claim its vault and daily first-open reward.</p>
        <p><strong>Upgrade hard.</strong> Pour earnings into stronger domains, then Clear Cache for permanent power.</p>
      </div>
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

function renderMasteryPanel(entry) {
  const rank = masteryRank(entry);
  const progress = masteryProgress(entry);
  const income = masteryIncomeMultiplier(rank).toFixed(2);
  const vault = masteryVaultCapMultiplier(rank).toFixed(2);
  const progressLabel = masteryProgressLabel(entry, progress);
  if (!masteryUnlocked()) {
    return `
      <div class="mastery-panel mastery-panel-locked">
        <div class="mastery-header">
          <div>
            <div class="mastery-title">DOMAIN MASTERY</div>
            <small>Income <span data-field="detailMasteryIncome">x${income}</span> | Vault cap <span data-field="detailMasteryVault">x${vault}</span></small>
          </div>
          <span class="mastery-rank" data-field="detailMasteryRank">${rank}/${MASTERY_RANK_CAP}</span>
        </div>
        <div class="mastery-progress-track" aria-label="Domain Mastery progress">
          <div class="mastery-progress-fill" data-field="detailMasteryProgress" style="width:${progress.percent}%"></div>
        </div>
        <div class="mastery-footer">
          <small data-field="detailMasteryProgressLabel">${progressLabel}</small>
          <button class="btn btn-prestige" disabled>UNLOCKS AFTER CLEAR CACHE</button>
        </div>
      </div>
    `;
  }
  const buttonLabel = progress.nextRank
    ? `RANK ${progress.nextRank} - ${cc(progress.cost)} CC`
    : "MAX RANK";
  return `
    <div class="mastery-panel">
      <div class="mastery-header">
        <div>
          <div class="mastery-title">DOMAIN MASTERY</div>
          <small>Income <span data-field="detailMasteryIncome">x${income}</span> | Vault cap <span data-field="detailMasteryVault">x${vault}</span></small>
        </div>
        <span class="mastery-rank" data-field="detailMasteryRank">${rank}/${MASTERY_RANK_CAP}</span>
      </div>
      <div class="mastery-progress-track" aria-label="Domain Mastery progress">
        <div class="mastery-progress-fill" data-field="detailMasteryProgress" style="width:${progress.percent}%"></div>
      </div>
      <div class="mastery-footer">
        <small data-field="detailMasteryProgressLabel">${progressLabel}</small>
        <button class="btn btn-prestige" data-action="upgradeDomainMastery" data-domain="${entry.domain}" ${canUpgradeMastery(entry) ? "" : "disabled"}>${buttonLabel}</button>
      </div>
    </div>
  `;
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
  const detailVaultCap = vaultCap(entry);
  const detailVaultPercent = vaultProgressPercent(entry.vaultAmount, detailVaultCap);

  const currentOnboardingStep = onboardingStep();
  const isDashboard = detailTab === "dashboard";
  const isUpgrades = detailTab === "upgrades";

  let content = "";
  if (isDashboard) {
    content = `
      ${renderOnboardingPrompt("dashboard")}
      <div class="vault-panel domain-status-panel${isDashboardOnboardingStep() ? " tutorial-target tutorial-target-panel tutorial-highlight-only" : ""}">
        <div class="vault-info">
          <div>
            <span class="${onboardingStep() === "dashboardStates" ? "tutorial-target tutorial-target-inline tutorial-highlight-only" : ""}" data-field="detailState">${state.text}</span> | <span data-field="detailIncome">${money(incomeFor(domain))}/sec</span>
            <span class="help-icon help-icon-muted" data-tooltip="${escapeAttribute(currentRateTooltip(domain, entry, slot))}">?</span>
          </div>
          <small>BASE INCOME: <span data-field="detailBaseIncome">${money(domainBaseRate(entry))}/sec</span></small>
          <small>SLOT MULTIPLIER: <span data-field="detailSlotMultiplier">x${tierBonus(slot).toFixed(2)}</span></small>
          ${supporterCorePaid() ? `<small>SUPPORTER CORE: <span data-field="detailSupporterCore">x${supporterCoreMultiplier().toFixed(2)} ACTIVE</span></small>` : ""}
          <small>STREAK: <span data-field="detailStreak">${displayStreak(entry)}</span> | LAST VISIT: <span data-field="detailLastVisit">${dateAgo(entry.lastVisited)}</span></small>
        </div>
        <button class="btn btn-detail" data-action="domainDetails" data-domain="${domain}">DETAILS</button>
      </div>
      <div class="vault-panel vault-panel-progress${isVaultOnboardingStep() ? " tutorial-target tutorial-target-panel tutorial-highlight-only" : ""}">
        <div class="vault-main-row">
          <div class="vault-info">
            <div>VAULT: <span data-field="detailVault">${money(entry.vaultAmount)}</span></div>
            <small>CAP: <span data-field="detailVaultCap">${money(detailVaultCap)}</span> | FILL: <span data-field="detailVaultRate">${money(vaultRate(entry))}/sec</span> <span class="help-icon help-icon-muted" data-tooltip="${escapeAttribute(vaultTooltip(entry))}">?</span></small>
          </div>
          <button class="btn btn-collect" data-action="claim" data-domain="${domain}" ${sciCompare(entry.vaultAmount, 0) > 0 ? "" : "disabled"}>COLLECT</button>
        </div>
        <div class="vault-progress-meta">
          <span>STORAGE</span>
          <span data-field="detailVaultPercent">${Math.floor(detailVaultPercent)}%</span>
        </div>
        <div class="vault-progress-track${detailVaultPercent >= 100 ? " is-full" : ""}" data-field="detailVaultTrack" role="progressbar" aria-label="Vault storage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(detailVaultPercent)}">
          <div class="vault-progress-fill" data-field="detailVaultProgress" style="width:${detailVaultPercent}%"></div>
        </div>
      </div>
      ${renderMasteryPanel(entry)}
    `;
  } else {
    const activeUpgradeStep = currentOnboardingStep === "upgradeActive";
    const backgroundUpgradeStep = currentOnboardingStep === "upgradeBackground";
    const vaultUpgradeStep = currentOnboardingStep === "upgradeVault";
    const categoryOnboarding = activeUpgradeStep || backgroundUpgradeStep || vaultUpgradeStep;
    content = `
      ${renderOnboardingPrompt("upgrades")}
      <div class="upgrade-toolbar" style="display:flex; align-items:stretch; gap:10px; margin-bottom:10px;">
        <div class="upgrade-tabs" style="display:flex; gap:4px; flex:1;">
          <button class="btn ${detailUpgradeTab === "active" ? "active" : ""}${activeUpgradeStep ? " tutorial-target tutorial-highlight-only" : ""}" data-action="detailUpgradeTab" data-tab="active" style="flex:1; padding:6px 0; font-size:14px;">ACTIVE</button>
          <button class="btn ${detailUpgradeTab === "background" ? "active" : ""}${backgroundUpgradeStep ? " tutorial-target tutorial-highlight-only" : ""}" data-action="detailUpgradeTab" data-tab="background" style="flex:1; padding:6px 0; font-size:14px;">BACKGROUND</button>
          <button class="btn ${detailUpgradeTab === "vault" ? "active" : ""}${vaultUpgradeStep ? " tutorial-target tutorial-highlight-only" : ""}" data-action="detailUpgradeTab" data-tab="vault" style="flex:1; padding:6px 0; font-size:14px;">VAULT</button>
        </div>
        <div style="width:1px; background:var(--primary); opacity:0.3; margin:4px 0;"></div>
        <button class="btn" data-action="mode" data-mode="${buyMode === "1" ? "10" : "1"}" style="padding:6px; font-size:14px; min-width:64px; flex-shrink:0;">BUY ${buyMode}</button>
      </div>
      <div class="upgrade-list${categoryOnboarding ? " tutorial-target tutorial-target-panel tutorial-highlight-only" : ""}">
        ${renderUpgradeGroups(entry)}
      </div>
    `;
  }

  shell(`
    <main class="view active">
      <div class="view-header">
        <button class="btn btn-back" data-action="home">&lt; BACK</button>
        <div class="detail-domain-heading">
          ${favicon(entry || domain, "detail-favicon")}
          <span class="detail-title">${domain.toUpperCase()}</span>
          <button class="btn btn-icon" data-action="openDomain" data-domain="${domain}" aria-label="Open ${domain} in a new tab">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 3h7v7"></path>
              <path d="M10 14 21 3"></path>
              <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"></path>
            </svg>
          </button>
        </div>
        <button class="btn btn-icon" data-action="domainManage" data-slot="${slot.id}" aria-label="Manage Domain">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
            <circle cx="12" cy="5" r="2"></circle>
            <circle cx="12" cy="12" r="2"></circle>
            <circle cx="12" cy="19" r="2"></circle>
          </svg>
        </button>
      </div>
      <div class="detail-tabs" style="display:flex; gap:10px; margin-bottom:10px;">
        <button class="btn ${isDashboard ? "active" : ""}" style="flex:1;" data-action="detailTab" data-tab="dashboard">DASHBOARD</button>
        <button class="btn ${isUpgrades ? "active" : ""}${isUpgradeTabOnboardingStep() ? " tutorial-target" : ""}" style="flex:1;" data-action="detailTab" data-tab="upgrades">UPGRADES</button>
      </div>
      ${content}
    </main>
  `, "slots");
}

function renderUpgradeGroups(entry) {
  return snapshot.upgradeDefs.filter((def) => def.category === detailUpgradeTab).map((def) => renderUpgrade(entry, def)).join("");
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
            <span class="upgrade-level">Lvl ${level}${def.maxLevel ? "/" + def.maxLevel : ""}</span>
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function effectSummary(id, level, targetLevel = level + 1) {
  const next = targetLevel;
  const entry = currentDetailEntry();
  const slot = entry ? currentSlot(entry.domain) : null;
  const currentStreak = Number(entry?.currentStreak || 0);
  const map = {
    trafficEngine: `Base income ${money(BASE_RATE * cacheCoreMultiplier(cacheCoreLevel()) * Math.pow(TRAFFIC_ENGINE_MULTIPLIER, level))}/sec → ${money(BASE_RATE * cacheCoreMultiplier(cacheCoreLevel()) * Math.pow(TRAFFIC_ENGINE_MULTIPLIER, next))}/sec`,
    tabMultiplier: `Live income x${(1 + 0.15 * level).toFixed(2)} → x${(1 + 0.15 * next).toFixed(2)}`,
    focusBonus: `Active income x${focusMultiplier(level).toFixed(2)} → x${focusMultiplier(next).toFixed(2)}`,
    navigationBonus: `Navigation payout ${money(navigationPayoutForLevel(entry, slot, level))} → ${money(navigationPayoutForLevel(entry, slot, next))}`,
    coldStorage: `Vault cap ${money(vaultCapForLevels(level))} → ${money(vaultCapForLevels(next))}`,
    storageDuration: `Vault fill rate ${money(vaultRateForLevel(level))}/sec → ${money(vaultRateForLevel(next))}/sec`,
    dailyBoot: `Daily bonus x${dailyBootMultiplier(level).toFixed(2)} → x${dailyBootMultiplier(next).toFixed(2)}${currentStreak > 0 ? `<br>Current streak x${dailyStreakMultiplier(currentStreak, level).toFixed(2)} → x${dailyStreakMultiplier(currentStreak, next).toFixed(2)}` : ""}`,
    backgroundHum: `Background income ${(8 * level).toFixed(0)}% → ${(8 * next).toFixed(0)}% of background base`,
    idleDepth: `Max idle boost x${(1 + 0.5 * level).toFixed(2)} → x${(1 + 0.5 * next).toFixed(2)}`,
    wakeBonus: `Wake burst ${money(wakeBurstForLevel(entry, slot, level))} → ${money(wakeBurstForLevel(entry, slot, next))}`
  };
  return map[id] || "";
}

function upgradeTooltip(id, level) {
  const lines = {
    trafficEngine: [
      "Traffic Engine raises this domain's base income before tab, focus, background, and slot tier multipliers are applied."
    ],
    tabMultiplier: [
      "Tab Multiplier boosts live income whenever this domain is open, including active and background income."
    ],
    focusBonus: [
      "Focus Bonus boosts income while this domain is the active tab in the active browser window."
    ],
    navigationBonus: [
      "Navigation Bonus pays when you make a top-level navigation inside this slotted domain. It has a 1 minute cooldown per domain."
    ],
    coldStorage: [
      "Cold Storage increases the vault cap, letting this domain store more offline/background money before you collect."
    ],
    storageDuration: [
      "Vault Pump increases how quickly the vault fills over time."
    ],
    dailyBoot: [
      "Daily Boot increases the first-open daily bonus for this domain. Streak and slot streak bonuses multiply this payout too."
    ],
    backgroundHum: [
      "Background Hum lets this domain keep earning while it is open in a non-active tab."
    ],
    idleDepth: [
      "Idle Depth increases background income the longer the domain stays open in the background, reaching max boost after 25 minutes."
    ],
    wakeBonus: [
      "Wake Bonus pays a burst when this domain returns from background to active. 1 minute cooldown per domain."
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
      ${pickSlotId ? `
        <div class="view-header">
          <button class="btn btn-back" data-action="home">&lt; BACK</button>
          <span>ASSIGN SLOT ${pickSlotId}</span>
        </div>
      ` : `<div class="slots-header library-title-row"><span>DOMAIN LIBRARY</span><small>${Object.keys(snapshot.local.domainLibrary || {}).length}/100</small></div>`}
      ${showManualAssign ? `
        ${renderOnboardingPrompt("domain")}
        <div class="library-controls${onboardingStep() === "domain" ? " tutorial-target tutorial-target-panel" : ""}">
          <input class="input-text" data-manual-domain data-slot="${pickSlotId}" value="${manualDefault}" placeholder="Enter domain (e.g. youtube.com)">
          <button class="btn" data-action="assignTyped" data-slot="${pickSlotId}">${pickSlot.assignedDomain ? "SWAP IN" : "ADD TO SLOT"}</button>
        </div>
        <div class="helper-text">Enter a domain or select from library below.</div>
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

function onboardingStep() {
  if (snapshot?.sync?.onboardingComplete) return "complete";
  return snapshot?.sync?.onboardingStep || "intro";
}

function tutorialAssignedDomain() {
  const slots = snapshot?.sync?.slots || [];
  const library = snapshot?.local?.domainLibrary || {};
  const firstSlot = slots.find((slot) => slot.id === 1 && slot.assignedDomain && library[slot.assignedDomain]);
  const assignedSlot = firstSlot || slots.find((slot) => slot.assignedDomain && library[slot.assignedDomain]);
  return assignedSlot?.assignedDomain || null;
}

async function persistRestoredOnboardingStep(step) {
  const result = await send("setOnboardingStep", { step });
  if (result?.ok) snapshot.sync.onboardingStep = step;
  return Boolean(result?.ok);
}

async function restoreOnboardingSurface() {
  const step = onboardingStep();
  const validSteps = new Set([
    "intro",
    "slot",
    "domain",
    "dashboardEarning",
    "dashboardStates",
    "dashboardVault",
    "dashboardUpgrades",
    "upgradeActive",
    "upgradeBackground",
    "upgradeVault",
    "cacheCredits",
    "resetIntro",
    "resetProgress",
    "pinExtension",
    "tutorialReward",
    "complete"
  ]);
  if (!validSteps.has(step)) {
    await persistRestoredOnboardingStep("intro");
    route = { name: "home" };
    modal = null;
    return;
  }
  if (["intro", "slot", "complete"].includes(step)) {
    route = { name: "home" };
    modal = null;
    return;
  }
  if (step === "domain") {
    const firstSlot = snapshot.sync.slots.find((slot) => slot.id === 1);
    if (!firstSlot) {
      await persistRestoredOnboardingStep("slot");
      route = { name: "home" };
      modal = null;
      return;
    }
    route = { name: "picker", slotId: 1 };
    modal = null;
    return;
  }

  const dashboardSteps = new Set(["dashboardEarning", "dashboardStates", "dashboardVault", "dashboardUpgrades"]);
  const upgradeSteps = new Set(["upgradeActive", "upgradeBackground", "upgradeVault"]);
  if (dashboardSteps.has(step) || upgradeSteps.has(step)) {
    const domain = tutorialAssignedDomain();
    if (!domain) {
      await persistRestoredOnboardingStep("slot");
      route = { name: "home" };
      detailTab = "dashboard";
      detailUpgradeTab = "active";
      modal = null;
      return;
    }
    route = { name: "detail", domain };
    detailTab = dashboardSteps.has(step) ? "dashboard" : "upgrades";
    detailUpgradeTab = step === "upgradeBackground" ? "background" : step === "upgradeVault" ? "vault" : "active";
    modal = null;
    return;
  }

  route = { name: "home" };
  modal = step === "resetProgress" ? "prestige" : null;
}

function isTutorialActionAllowed(action, node) {
  const step = onboardingStep();
  if (step === "complete") return true;
  const expectedNextSteps = {
    dashboardEarning: "dashboardStates",
    dashboardStates: "dashboardVault",
    dashboardVault: "dashboardUpgrades",
    upgradeActive: "upgradeBackground",
    upgradeBackground: "upgradeVault",
    upgradeVault: "cacheCredits",
    cacheCredits: "resetIntro",
    pinExtension: "tutorialReward",
    tutorialReward: "complete"
  };
  if (action === "onboardingNext") return node.dataset.step === expectedNextSteps[step];
  if (step === "intro") return action === "finishOnboarding";
  if (step === "slot") return action === "picker" && Number(node.dataset.slot) === 1;
  if (step === "domain") {
    return ["addCurrent", "assignTyped", "assign", "confirmModal", "cancelModal"].includes(action);
  }
  if (step === "dashboardUpgrades") return action === "detailTab" && node.dataset.tab === "upgrades";
  if (step === "resetIntro") return action === "prestige";
  if (step === "resetProgress") return action === "cancelModal";
  return false;
}

function isDashboardOnboardingStep() {
  return onboardingStep() === "dashboardEarning";
}

function isVaultOnboardingStep() {
  return onboardingStep() === "dashboardVault";
}

function isUpgradeTabOnboardingStep() {
  return onboardingStep() === "dashboardUpgrades";
}

function renderOnboardingPrompt(step) {
  const current = onboardingStep();
  if (step === "slot" && current === "slot") {
    return `
      <div class="onboarding-focus-scrim"></div>
      <div class="onboarding-callout onboarding-callout-slot">
        <strong>Step 1: Claim your first slot.</strong>
        <span>Click the first domain slot. This is where your favorite site starts earning.</span>
      </div>
    `;
  }
  if (step === "domain" && current === "domain") {
    return `
      <div class="onboarding-focus-scrim"></div>
      <div class="onboarding-callout onboarding-callout-domain">
        <strong>Step 2: Pick a site you actually use.</strong>
        <span>Enter a domain like youtube.com, github.com, reddit.com, or whatever you visit every day, then assign it.</span>
      </div>
    `;
  }
  if (step === "dashboard" && current === "dashboardEarning") {
    return `
      <div class="onboarding-focus-scrim"></div>
      <div class="onboarding-callout onboarding-callout-dashboard onboarding-callout-dashboard-earning">
        <strong>Step 3: Watch this domain earn.</strong>
        <span>This block shows the domain's current state and exactly how much cash it is making right now.</span>
        <button class="btn btn-prestige" data-action="onboardingNext" data-step="dashboardStates">NEXT</button>
      </div>
    `;
  }
  if (step === "dashboard" && current === "dashboardStates") {
    return `
      <div class="onboarding-focus-scrim"></div>
      <div class="onboarding-callout onboarding-callout-dashboard onboarding-callout-dashboard-states">
        <strong>Step 4: Learn the earning states.</strong>
        <span><strong>Active</strong> means the site is your current tab. <strong>Background</strong> means it is open but not active. <strong>Inactive</strong> means it is not open, so live income is $0/sec.</span>
        <button class="btn btn-prestige" data-action="onboardingNext" data-step="dashboardVault">NEXT</button>
      </div>
    `;
  }
  if (step === "dashboard" && current === "dashboardVault") {
    return `
      <div class="onboarding-focus-scrim"></div>
      <div class="onboarding-callout onboarding-callout-dashboard onboarding-callout-vault">
        <strong>Step 5: Check the vault.</strong>
        <span>The vault stores extra cash while this domain is away from active use. Come back later, then collect the burst.</span>
        <button class="btn btn-prestige" data-action="onboardingNext" data-step="dashboardUpgrades">NEXT</button>
      </div>
    `;
  }
  if (step === "dashboard" && current === "dashboardUpgrades") {
    return `
      <div class="onboarding-focus-scrim"></div>
      <div class="onboarding-callout onboarding-callout-dashboard onboarding-callout-upgrades">
        <strong>Step 6: Open upgrades.</strong>
        <span>Click <strong>UPGRADES</strong> to start making this domain stronger.</span>
      </div>
    `;
  }
  if (step === "upgrades" && current === "upgradeActive") {
    return `
      <div class="onboarding-focus-scrim"></div>
      <div class="onboarding-callout onboarding-callout-upgrade-section">
        <strong>Step 7: Active upgrades.</strong>
        <span>Active upgrades improve how much this domain earns while it is your current active tab.</span>
        <button class="btn btn-prestige" data-action="onboardingNext" data-step="upgradeBackground" data-upgrade-tab="background">NEXT</button>
      </div>
    `;
  }
  if (step === "upgrades" && current === "upgradeBackground") {
    return `
      <div class="onboarding-focus-scrim"></div>
      <div class="onboarding-callout onboarding-callout-upgrade-section">
        <strong>Step 8: Background upgrades.</strong>
        <span>Background upgrades help domains keep earning while they are open in another tab, and reward bringing them back.</span>
        <button class="btn btn-prestige" data-action="onboardingNext" data-step="upgradeVault" data-upgrade-tab="vault">NEXT</button>
      </div>
    `;
  }
  if (step === "upgrades" && current === "upgradeVault") {
    return `
      <div class="onboarding-focus-scrim"></div>
      <div class="onboarding-callout onboarding-callout-upgrade-section">
        <strong>Step 9: Vault upgrades.</strong>
        <span>Vault upgrades increase storage, fill speed, and daily bonuses so returning to this domain pays bigger bursts.</span>
        <button class="btn btn-prestige" data-action="onboardingNext" data-step="cacheCredits">NEXT</button>
      </div>
    `;
  }
  return "";
}

function renderGlobalOnboardingPrompt() {
  const current = onboardingStep();
  if (current === "cacheCredits") {
    return `
      <div class="onboarding-focus-scrim"></div>
      <div class="onboarding-callout onboarding-callout-header-control">
        <strong>Step 10: Cache Credits.</strong>
        <span>CC is prestige currency used for powerful permanent upgrades such as Cache Core, slot tiers, and Domain Mastery.</span>
        <button class="btn btn-prestige" data-action="onboardingNext" data-step="resetIntro">NEXT</button>
      </div>
    `;
  }
  if (current === "resetIntro") {
    return `
      <div class="onboarding-focus-scrim"></div>
      <div class="onboarding-callout onboarding-callout-header-control">
        <strong>Step 11: Clear Cache.</strong>
        <span>Earn CC by resetting your run. Click <strong>RESET</strong> to take a look.</span>
      </div>
    `;
  }
  if (current === "pinExtension") {
    return `
      <div class="onboarding-focus-scrim"></div>
      <div class="onboarding-callout onboarding-callout-reward onboarding-callout-pin">
        <div class="pin-toolbar-arrow" aria-hidden="true">&#8599;</div>
        <strong>Pro Tip: Pin Browser Tycoon.</strong>
        <div class="pin-steps">
          <div class="pin-step">
            <span class="pin-step-number">1</span>
            <span class="pin-step-icon" aria-hidden="true">&#129513;</span>
            <span>Click Chrome's Extensions button.</span>
          </div>
          <div class="pin-step">
            <span class="pin-step-number">2</span>
            <span class="pin-step-icon"><img src="icons/b-logo-no-outline.png" alt=""></span>
            <span>Locate Browser Tycoon.</span>
          </div>
          <div class="pin-step">
            <span class="pin-step-number">3</span>
            <span class="pin-step-icon" aria-hidden="true">&#128204;</span>
            <span>Click the pin icon beside it.</span>
          </div>
        </div>
        <button class="btn btn-prestige" data-action="onboardingNext" data-step="tutorialReward">DONE</button>
      </div>
    `;
  }
  if (current === "tutorialReward") {
    return `
      <div class="onboarding-focus-scrim"></div>
      <div class="onboarding-callout onboarding-callout-reward">
        <strong>Your first domain is online!</strong>
        <span>Here's $1,000 to kickstart your empire. Buy a few upgrades, keep this site in rotation, and let the vault build while you browse.</span>
        <div class="tutorial-cash-reward">+$1,000</div>
        <button class="btn btn-prestige" data-action="onboardingNext" data-step="complete">START BUILDING</button>
      </div>
    `;
  }
  return "";
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
  const masteryLabel = masteryUnlocked() || masteryRank(entry) > 0 ? ` | MASTERY R${masteryRank(entry)}` : "";
  return `
    <div class="library-item">
      <div class="slot-info" ${pickSlotId ? "" : `data-action="domainDetails" data-domain="${entry.domain}" data-source="library"`}>
        ${favicon(entry)}
        <div>
          <div class="slot-domain">${entry.domain}</div>
          <div class="slot-tier">${isSlotted ? `SLOT ${entry.slotId}` : "LIBRARY"} | ${upgradeTotal} UPGRADES | ${money(entry.lifetimeEarned)}${masteryLabel}</div>
        </div>
      </div>
      <button class="btn" data-action="${action}" data-domain="${entry.domain}" ${pickSlotId ? `data-slot="${pickSlotId}"` : `data-source="library"`} ${isSwapCandidate ? `data-source-slot="${entry.slotId}"` : ""} ${isCurrentPickSlot ? "disabled" : ""}>
        ${label}
      </button>
    </div>
  `;
}

async function handleNotificationToggle(event) {
  const node = event.currentTarget;
  const key = node.dataset.notificationSetting;
  const result = await act("updateNotificationSettings", { settings: { [key]: node.checked } }, { silent: true });
  if (result?.ok) {
    snapshot.sync.notificationSettings = result.notificationSettings;
    modal = { name: "settings" };
    render();
  } else {
    node.checked = !node.checked;
  }
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
          <small>MASTERY: R${masteryRank(entry)}/${MASTERY_RANK_CAP} | MASTERY LIFETIME: ${money(masteryLifetime(entry))}</small>
          <small>STREAK: <span data-field="summaryStreak">${displayStreak(entry)}</span> | LAST VISIT: <span data-field="summaryLastVisit">${dateAgo(entry.lastVisited)}</span></small>
        </div>
      </div>
    </main>
  `, "library");
}

async function handleAction(event) {
  const node = event.currentTarget;
  const action = node.dataset.action;
  if (!isTutorialActionAllowed(action, node)) return;
  toast = "";
  toastType = "success";

  if (action === "home") route = { name: "home" };
  if (action === "detail") route = { name: "detail", domain: node.dataset.domain };
  if (action === "detailTab") detailTab = node.dataset.tab;
  if (action === "detailTab" && node.dataset.tab === "upgrades" && onboardingStep() === "dashboardUpgrades") {
    detailUpgradeTab = "active";
    const result = await act("setOnboardingStep", { step: "upgradeActive" });
    if (result?.ok) snapshot.sync.onboardingStep = "upgradeActive";
  }
  if (action === "detailUpgradeTab") detailUpgradeTab = node.dataset.tab;
  if (action === "domainManage") modal = { name: "domainManage", slotId: Number(node.dataset.slot) };
  if (action === "library") route = { name: "library" };
  if (action === "store") route = { name: "store" };
  if (action === "domainSummary") route = { name: "domainSummary", domain: node.dataset.domain };
  if (action === "picker") {
    const slotId = Number(node.dataset.slot);
    route = { name: "picker", slotId };
    modal = null;
    if (onboardingStep() === "slot" && slotId === 1) {
      const result = await act("setOnboardingStep", { step: "domain" });
      if (result?.ok) snapshot.sync.onboardingStep = "domain";
    }
  }
  if (action === "mode" && BUY_MODES.includes(node.dataset.mode)) buyMode = node.dataset.mode;
  if (action === "openDomain") await chrome.tabs.create({ url: `https://${node.dataset.domain}` });
  if (action === "openFeedback") await chrome.tabs.create({ url: FEEDBACK_FORM_URL });
  if (action === "finishOnboarding") {
    const result = await act("setOnboardingStep", { step: "slot" });
    if (result?.ok) {
      snapshot.sync.onboardingComplete = false;
      snapshot.sync.onboardingStep = "slot";
      route = { name: "home" };
    }
  }
  if (action === "addCurrent") {
    const slotId = Number(node.dataset.slot);
    const result = await act("addCurrentSite", { slotId });
    if (result?.ok) {
      if (onboardingStep() === "domain") await act("setOnboardingStep", { step: "dashboardEarning" });
      routeToAssignedDomain(slotId);
    }
  }
  if (action === "assignTyped") {
    const slotId = Number(node.dataset.slot);
    const input = app.querySelector(`[data-manual-domain][data-slot="${slotId}"]`);
    const completingOnboarding = onboardingStep() === "domain";
    const result = await act("assignDomain", {
      slotId,
      domain: input?.value || "",
      fromCurrentSite: Boolean(snapshot.currentSite?.valid),
      currentDomain: snapshot.currentSite?.domain || "",
      faviconPageUrl: snapshot.currentSite?.faviconPageUrl || ""
    }, { silent: completingOnboarding });
    if (result?.ok) {
      if (completingOnboarding) await act("setOnboardingStep", { step: "dashboardEarning" });
      routeToAssignedDomain(slotId);
    }
  }
  if (action === "assign") {
    const slotId = Number(node.dataset.slot);
    const completingOnboarding = onboardingStep() === "domain";
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
        currentDomain: snapshot.currentSite?.domain || "",
        faviconPageUrl: snapshot.currentSite?.faviconPageUrl || ""
      },
      after: { routeAssignedSlot: slotId, onboardingStep: completingOnboarding ? "dashboardEarning" : null },
      silent: completingOnboarding
    };
  }
  if (action === "deleteDomainPrompt") {
    modal = {
      name: "confirm",
      variant: "danger",
      kicker: "DELETE DOMAIN",
      title: "DELETE DOMAIN?",
      body: `Delete ${node.dataset.domain} from your library? This permanently removes its upgrades, vault, streak, lifetime history, mastery, and other domain data. If it is assigned to a slot, that slot will be emptied too.`,
      confirmLabel: "DELETE",
      actionType: "deleteDomain",
      payload: { domain: node.dataset.domain },
      after: { route: "library" }
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
  if (action === "upgradeDomainMastery") await act("upgradeDomainMastery", { domain: node.dataset.domain });
  if (action === "claim") {
    const result = await act("claimRevisit", { domain: node.dataset.domain });
    if (result?.ok && Number(result.payout?.total || 0) > 0) showCollectBurst(result.payout.total);
  }
  if (action === "unlock") await act("unlockSlot");
  if (action === "tier") await act("upgradeSlotTier", { slotId: Number(node.dataset.slot) });
  if (action === "premiumPurchase") await act("openPremiumPayment");
  if (action === "premiumRestore") await act("openPremiumLogin");
  if (action === "onboardingNext") {
    const nextStep = node.dataset.step;
    if (nextStep === "complete") {
      await act("completeOnboarding");
    } else {
      if (node.dataset.upgradeTab) detailUpgradeTab = node.dataset.upgradeTab;
      const result = await act("setOnboardingStep", { step: nextStep });
      if (result?.ok) snapshot.sync.onboardingStep = nextStep;
    }
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
  if (action === "prestige") {
    if (onboardingStep() === "resetIntro") {
      const result = await act("setOnboardingStep", { step: "resetProgress" });
      if (result?.ok) {
        snapshot.sync.onboardingStep = "resetProgress";
        modal = "prestige";
      }
    } else {
      modal = "prestige";
    }
  }
  if (action === "cacheCore") modal = { name: "cacheCore" };
  if (action === "settings") modal = { name: "settings" };
  if (action === "cloudSyncSave") {
    modal = {
      name: "confirm",
      kicker: "CLOUD SAVE",
      title: "SYNC SAVE?",
      body: `Upload this device's save to Chrome sync. Current progress: ${money(snapshot.sync.totalLifetimeEarned)} lifetime.`,
      confirmLabel: "SYNC SAVE",
      actionType: "syncCloudSave"
    };
  }
  if (action === "cloudLoadSave") {
    const meta = snapshot?.cloudSaveMeta;
    modal = {
      name: "confirm",
      variant: "danger",
      kicker: "LOAD SAVE",
      title: "REPLACE THIS SAVE?",
      body: `Load the synced save from ${formatCloudSaveTime(meta?.savedAt)}. This replaces this device's save.`,
      confirmLabel: "LOAD SAVE",
      actionType: "loadCloudSave"
    };
  }
  if (action === "upgradeCacheCore") await act("upgradeCacheCore");
  if (action === "slotUpgradeList") modal = { name: "slotUpgradeList" };
  if (action === "slotUpgradeDetail") modal = { name: "slotUpgradeDetail", slotId: Number(node.dataset.slot) };
  if (action === "confirmSlotUpgrade") {
    const slotId = Number(node.dataset.slot);
    const result = await act("upgradeSlotTier", { slotId });
    if (result?.ok) modal = { name: "slotUpgradeList" };
  }
  if (action === "domainDetails") modal = { name: "domainDetails", domain: node.dataset.domain, source: node.dataset.source || "slot" };
  if (action === "cancelModal") {
    const completesResetTutorial = modal === "prestige" && onboardingStep() === "resetProgress";
    modal = null;
    if (completesResetTutorial) {
      const result = await act("setOnboardingStep", { step: "pinExtension" });
      if (result?.ok) snapshot.sync.onboardingStep = "pinExtension";
    }
  }
  if (action === "confirmPrestige") {
    modal = null;
    await act("prestige");
  }
  if (action === "confirmModal" && modal?.name === "confirm") {
    const pending = modal;
    modal = null;
    const result = await act(pending.actionType, pending.payload || {}, { silent: Boolean(pending.silent) });
    if (result?.ok && pending.after?.onboardingStep) await act("setOnboardingStep", { step: pending.after.onboardingStep });
    if (result?.ok && pending.after?.routeAssignedSlot) routeToAssignedDomain(pending.after.routeAssignedSlot);
    if (result?.ok && pending.after?.route) route = { name: pending.after.route };
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
  const reward = toSci(amount);
  if (!displaysAsPositiveMoney(reward)) {
    collectBurst = null;
    balanceRoll = null;
    syncCollectBurstNode();
    return;
  }
  collectBurst = reward;
  const endBalance = liveBalance();
  const startBalance = sciSub(endBalance, reward);
  const shouldRollBalance = money(startBalance) !== money(endBalance);
  if (collectBurstTimer) clearTimeout(collectBurstTimer);
  if (balanceRollFrame) cancelAnimationFrame(balanceRollFrame);
  balanceRoll = shouldRollBalance
    ? {
        from: startBalance,
        to: endBalance,
        startedAt: Date.now(),
        duration: 820
      }
    : null;
  if (!balanceRoll) {
    app.querySelectorAll("[data-field='balance']").forEach((node) => node.classList.remove("balance-rolling"));
  }
  const tickRoll = () => {
    if (!balanceRoll) return;
    setText("balance", money(displayBalance()));
    if (Date.now() - balanceRoll.startedAt < balanceRoll.duration) {
      balanceRollFrame = requestAnimationFrame(tickRoll);
      return;
    }
    balanceRoll = null;
    balanceRollFrame = null;
    setText("balance", money(liveBalance()));
  };
  if (balanceRoll) balanceRollFrame = requestAnimationFrame(tickRoll);
  else balanceRollFrame = null;
  collectBurstTimer = setTimeout(() => {
    collectBurst = null;
    balanceRoll = null;
    collectBurstTimer = null;
    syncCollectBurstNode();
    render();
  }, 1300);
}

function routeToAssignedDomain(slotId) {
  const slot = snapshot?.sync?.slots?.find((item) => item.id === slotId);
  if (slot?.assignedDomain) route = { name: "detail", domain: slot.assignedDomain };
}

async function act(type, payload = {}, options = {}) {
  const result = await send(type, payload);
  if (!result?.ok) {
    showToast(result?.error || "Action failed.", "warning");
    return result;
  }
  if (type === "prestige") showToast(`CLEAR CACHE AWARDED ${cc(result.award)} CC.`);
  else if (type === "upgradeCacheCore") showToast(`CACHE CORE LEVEL ${result.level}.`);
  else if (type === "upgradeDomainMastery") showToast(`DOMAIN MASTERY RANK ${result.rank}.`);
  else if (type === "openPremiumPayment") showToast("PAYMENT PAGE OPENED.");
  else if (type === "openPremiumLogin") showToast("RESTORE PAGE OPENED.");
  else if (type === "refreshPremiumStatus") showToast(result.paid ? "SUPPORTER CORE ACTIVE." : "NO PURCHASE FOUND.", result.paid ? "success" : "warning");
  else if (type === "completeOnboarding" || type === "setOnboardingStep") {}
  else if (options.silent) {}
  else showToast("SUCCESS");
  const nextSnapshot = await send("snapshot");
  if (isValidSnapshot(nextSnapshot)) {
    snapshot = nextSnapshot;
    resetLiveTickerBaseline();
  } else {
    showToast(nextSnapshot?.error || "Could not refresh game state.", "warning");
  }
  if (type === "completeOnboarding" && Number(result.starterCash || 0) > 0) {
    showCollectBurst(result.starterCash);
  }
  return result;
}

function render() {
  if (!isValidSnapshot(snapshot)) return;
  if (onboardingStep() === "resetProgress" && modal === null) modal = "prestige";
  if (onboardingStep() === "intro") return renderOnboarding();
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

// --- Tooltip system ---
let tooltipEl = null;
let tooltipHoverTimer = null;

function initUpgradeTooltips() {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "upgrade-tooltip";
    document.body.appendChild(tooltipEl);
  }
  hideTooltip();

  app.querySelectorAll(".upgrade-details[data-tooltip]").forEach((node) => {
    node.addEventListener("mouseenter", onTooltipEnter);
    node.addEventListener("mouseleave", onTooltipLeave);
  });
}

function onTooltipEnter(event) {
  const target = event.currentTarget;
  const text = target.getAttribute("data-tooltip");
  if (!text) return;
  clearTimeout(tooltipHoverTimer);
  tooltipHoverTimer = setTimeout(() => showUpgradeTooltip(target, text), 450);
}

function onTooltipLeave() {
  clearTimeout(tooltipHoverTimer);
  hideTooltip();
}

function showUpgradeTooltip(anchor, text) {
  tooltipEl.textContent = text;
  tooltipEl.style.left = "0";
  tooltipEl.style.top = "0";
  tooltipEl.classList.add("visible");

  const rect = anchor.getBoundingClientRect();
  const tipRect = tooltipEl.getBoundingClientRect();
  const viewportH = window.innerHeight;

  let top = rect.bottom + 6;
  if (top + tipRect.height > viewportH - 4) {
    top = rect.top - tipRect.height - 6;
  }
  let left = rect.left;
  if (left + tipRect.width > window.innerWidth - 4) {
    left = window.innerWidth - tipRect.width - 4;
  }
  if (left < 4) left = 4;

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

function hideTooltip() {
  if (tooltipEl) {
    tooltipEl.classList.remove("visible");
  }
}
