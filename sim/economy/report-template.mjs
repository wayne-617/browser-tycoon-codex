const COLORS = {
  focus: "#27d3ff",
  background: "#8ce36b",
  vaultClaimed: "#ffc857",
  dailyBonus: "#ff7eb6",
  navigation: "#ff9f1c",
  wake: "#7bdff2"
};

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function compact(value) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) < 1000) return value.toFixed(2);
  const suffixes = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const suffix = Math.floor(exponent / 3);
  if (suffix > 0 && suffix < suffixes.length) {
    const amount = value / Math.pow(10, suffix * 3);
    return `${amount.toFixed(2)}${suffixes[suffix]}`;
  }
  return `${value.toExponential(2)}`;
}

function table(headers, rows) {
  return `<table><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function upgradeRows(economy) {
  return economy.upgradeDefs.map((def, index) => `
    <tr>
      <td>${esc(def.name)}</td>
      <td><input type="number" step="1" min="0" data-upgrade-index="${index}" data-upgrade-field="baseCost" value="${def.baseCost}"></td>
      <td><input type="number" step="0.01" min="1" data-upgrade-index="${index}" data-upgrade-field="growth" value="${def.growth}"></td>
      <td><input type="number" step="1" min="0" data-upgrade-index="${index}" data-upgrade-field="maxLevel" value="${def.maxLevel ?? ""}" placeholder="none"></td>
    </tr>
  `).join("");
}

export function renderReport(result) {
  const initialData = JSON.stringify(result);
  const initialConfig = result.config;
  const economy = result.economy;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Browser Tycoon Economy Simulator</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #080a10; color: #eef3ff; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 28px; }
    main { max-width: 1040px; margin: 0 auto; }
    h1, h2, h3 { letter-spacing: 0; }
    h1 { margin-bottom: 8px; }
    section { margin-top: 28px; }
    button, input { font: inherit; }
    .hidden { display: none !important; }
    .panel { background: #121622; border: 1px solid #283047; border-radius: 8px; padding: 18px; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
    label { display: grid; gap: 7px; color: #aab3cf; font-size: 13px; }
    input { width: 100%; border: 1px solid #34405e; border-radius: 6px; background: #0b0e17; color: #f6f9ff; padding: 9px 10px; }
    input[type="checkbox"] { width: auto; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 18px; }
    .btn { border: 1px solid #49618d; border-radius: 6px; background: #1c2741; color: #eef3ff; padding: 10px 14px; cursor: pointer; }
    .btn-primary { background: #1e88e5; border-color: #64b5f6; color: #fff; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
    .metric { background: #151927; border: 1px solid #2d3449; border-radius: 8px; padding: 14px; }
    .metric strong { display: block; color: #96a5c9; font-size: 12px; text-transform: uppercase; }
    .metric span { display: block; margin-top: 8px; font-size: 22px; }
    details { margin-top: 16px; }
    summary { cursor: pointer; color: #dbe5ff; }
    svg { width: 100%; height: auto; display: block; }
    svg text { fill: #dbe5ff; stroke: none; paint-order: normal; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; background: #121622; border-radius: 8px; overflow: hidden; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #283047; text-align: right; }
    th:first-child, td:first-child { text-align: left; }
    th { color: #aab3cf; font-size: 12px; text-transform: uppercase; }
    td input { min-width: 84px; padding: 6px 8px; }
    code { background: #151927; padding: 2px 5px; border-radius: 4px; }
    .muted { color: #aab3cf; }
    .check-row { display: flex; gap: 8px; align-items: center; color: #dbe5ff; }
    .day-breakdown { margin-top: 12px; }
    .day-control { display: flex; gap: 14px; align-items: end; flex-wrap: wrap; margin-bottom: 10px; }
    .day-control label { max-width: 220px; }
  </style>
</head>
<body>
<main>
  <section id="setupView">
    <h1>Browser Tycoon Economy Simulator</h1>
    <p class="muted">Defaults are loaded from <code>${esc(economy.source || "configured economy")}</code>. Standard mode runs one continuous save; prestige mode applies scheduled cache clears, Cache Core spending, and slot tier spending.</p>
    <form id="simForm" class="panel">
      <h2>Simulation Setup</h2>
      <div class="form-grid">
        <label>Days to simulate
          <input name="days" type="number" min="1" step="1" value="${initialConfig.days}">
        </label>
        <label>Total focused hours per day
          <input name="focusHours" type="number" min="0" step="0.25" value="${initialConfig.focusMinutesPerDay / 60}">
        </label>
        <label>Background hours per other tab
          <input name="backgroundHours" type="number" min="0" step="0.25" value="${initialConfig.backgroundMinutesPerOtherSlotPerDay / 60}">
        </label>
        <label>Vault checks per day
          <input name="vaultClaimsPerDay" type="number" min="1" step="1" value="${initialConfig.vaultClaimsPerDay}">
        </label>
        <label>Starting cash
          <input name="startingCash" type="number" min="0" step="1" value="${initialConfig.startingCash || 0}">
        </label>
      </div>
      <div class="actions">
        <label class="check-row"><input name="prestigeMode" type="checkbox" ${initialConfig.prestigeMode ? "checked" : ""}> Prestige reset mode</label>
      </div>
      <div class="form-grid" style="margin-top:14px;">
        <label>Prestige resets
          <input name="prestigeResets" type="number" min="0" step="1" value="${initialConfig.prestigeResets}">
        </label>
        <label>Reset days
          <input name="prestigeResetDays" type="text" value="${esc((initialConfig.prestigeResetDays || []).join(","))}" placeholder="5, 15, 30">
        </label>
      </div>

      <details>
        <summary>Advanced economy math</summary>
        <div class="form-grid" style="margin-top:14px;">
          <label>Starting slots
            <input name="startingSlots" type="number" min="1" step="1" value="${initialConfig.startingSlots}">
          </label>
          <label>Base rate
            <input name="baseRate" type="number" min="0" step="0.01" value="${economy.baseRate}">
          </label>
          <label>Vault rate
            <input name="vaultRate" type="number" min="0" step="any" value="${economy.vaultRate}">
          </label>
          <label>Vault linear multiplier
            <input name="vaultLinearMultiplier" type="number" min="0" step="0.01" value="${economy.vaultLinearMultiplier ?? 0.12}">
          </label>
          <label>Vault curve multiplier
            <input name="vaultPolyMultiplier" type="number" min="0" step="0.001" value="${economy.vaultPolyMultiplier ?? 0.005}">
          </label>
          <label>Vault curve exponent
            <input name="vaultPolyExponent" type="number" min="1" step="0.01" value="${economy.vaultPolyExponent ?? 3}">
          </label>
          <label>Vault traffic exponent
            <input name="vaultTrafficExponent" type="number" min="0" step="0.01" value="${economy.vaultTrafficExponent ?? 0.9}">
          </label>
          <label>Background traffic exponent
            <input name="backgroundTrafficExponent" type="number" min="0" step="0.01" value="${economy.backgroundTrafficExponent ?? 0.9}">
          </label>
          <label>Daily base minutes
            <input name="dailyBaseMinutes" type="number" min="0" step="1" value="${economy.dailyBaseMinutes ?? 60}">
          </label>
          <label>Daily streak base multiplier
            <input name="dailyStreakBaseMultiplier" type="number" min="0" step="0.01" value="${economy.dailyStreakBaseMultiplier ?? 0.04}">
          </label>
          <label>Daily streak boot multiplier
            <input name="dailyStreakBootMultiplier" type="number" min="0" step="0.01" value="${economy.dailyStreakBootMultiplier ?? 0.2}">
          </label>
          <label>Navigation event seconds
            <input name="navigationEventSeconds" type="number" min="0" step="0.5" value="${economy.navigationEventSeconds ?? 18}">
          </label>
          <label>Wake burst seconds
            <input name="wakeBurstSeconds" type="number" min="0" step="1" value="${economy.wakeBurstSeconds ?? 105}">
          </label>
          <label>Traffic multiplier
            <input name="trafficEngineMultiplier" type="number" min="1" step="0.01" value="${economy.trafficEngineMultiplier}">
          </label>
          <label>Prestige divisor
            <input name="prestigeDivisor" type="number" min="1" step="1" value="${economy.prestigeDivisor}">
          </label>
          <label>Slot prestige cost scale
            <input name="slotPrestigeCostScale" type="number" min="1" step="0.01" value="${economy.slotPrestigeCostScale || 1}">
          </label>
          <label>Cache Core multiplier
            <input name="cacheCoreMultiplierBase" type="number" min="1" step="0.01" value="${economy.cacheCoreMultiplierBase || 1.5}">
          </label>
          <label>Cache Core base cost
            <input name="cacheCoreBaseCost" type="number" min="1" step="1" value="${economy.cacheCoreBaseCost || 5}">
          </label>
          <label>Cache Core cost growth
            <input name="cacheCoreCostGrowth" type="number" min="1" step="0.01" value="${economy.cacheCoreCostGrowth || 1.5}">
          </label>
          <label>Slot tier bonus tier
            <input name="slotTier" type="number" min="0" step="1" value="${initialConfig.slotTier}">
          </label>
        </div>
        <div class="actions">
          <label class="check-row"><input name="includeDailyBonus" type="checkbox" ${initialConfig.includeDailyBonus ? "checked" : ""}> Daily bonuses</label>
          <label class="check-row"><input name="enableNavigationBonus" type="checkbox" ${initialConfig.enableNavigationBonus ? "checked" : ""}> Navigation events</label>
          <label class="check-row"><input name="enableWakeBonus" type="checkbox" ${initialConfig.enableWakeBonus ? "checked" : ""}> Wake events</label>
        </div>
        <div class="form-grid" style="margin-top:14px;">
          <label>Navigation events per focused hour
            <input name="navigationEventsPerFocusedHour" type="number" min="0" step="1" value="${initialConfig.navigationEventsPerFocusedHour}">
          </label>
          <label>Wake events per domain per day
            <input name="wakeEventsPerDomainPerDay" type="number" min="0" step="1" value="${initialConfig.wakeEventsPerDomainPerDay}">
          </label>
        </div>
      </details>

      <details>
        <summary>Upgrade cost math</summary>
        <p class="muted">Blank max level means uncapped. Effects stay aligned to the current app formulas.</p>
        <table>
          <thead><tr><th>Upgrade</th><th>Base Cost</th><th>Growth</th><th>Max Level</th></tr></thead>
          <tbody>${upgradeRows(economy)}</tbody>
        </table>
      </details>

      <div class="actions">
        <button class="btn btn-primary" type="submit">Simulate</button>
      </div>
    </form>
  </section>

  <section id="resultsView" class="hidden">
    <div class="actions">
      <button id="newSimulation" class="btn" type="button">New Simulation</button>
      <button id="downloadResults" class="btn btn-primary" type="button">Download Results</button>
    </div>
    <div id="downloadStatus" class="muted"></div>
    <div id="results"></div>
  </section>
</main>

<script id="initialData" type="application/json">${initialData.replace(/</g, "\\u003c")}</script>
<script>
const COLORS = ${JSON.stringify(COLORS)};
const initialResult = JSON.parse(document.getElementById("initialData").textContent);
const initialEconomy = structuredClone(initialResult.economy);
let currentResult = initialResult;

function compact(value) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) < 1000) return value.toFixed(2);
  const suffixes = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const suffix = Math.floor(exponent / 3);
  if (suffix > 0 && suffix < suffixes.length) {
    const amount = value / Math.pow(10, suffix * 3);
    return amount.toFixed(2) + suffixes[suffix];
  }
  return value.toExponential(2);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function floorToSignificantFigures(value, figures = 2) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const scale = Math.pow(10, Math.floor(Math.log10(value)) - figures + 1);
  return Math.floor(value / scale) * scale;
}

function slotUnlockCost(slotNumber) {
  if (slotNumber <= 3) return 0;
  return floorToSignificantFigures(1000 * Math.pow(100, Math.max(0, slotNumber - 4)));
}

function prestigeTotalFromLifetime(lifetime, prestigeDivisor) {
  if (!Number.isFinite(lifetime) || lifetime <= 0) return 0;
  return Math.floor(Math.sqrt(lifetime / prestigeDivisor));
}

function upgradeCost(def, level) {
  return Math.ceil(def.baseCost * Math.pow(def.growth, level));
}

function emptyUpgrades(upgradeDefs) {
  return Object.fromEntries(upgradeDefs.map((upgrade) => [upgrade.id, 0]));
}

function createDomain(index, upgradeDefs) {
  return { id: "domain-" + (index + 1), upgrades: emptyUpgrades(upgradeDefs), vaultAmount: 0, currentStreak: 0, lastVisitedHour: 0, dailyBonusClaimedDay: 0, lifetimeEarned: 0 };
}

function createSlot(id, tier = 0) {
  return { id, tier, streakBonusTier: 0 };
}

function level(domain, id) {
  return Number(domain.upgrades[id] || 0);
}

function tierBonus(economy, tier) {
  return (economy.slotTiers.find((item) => item.tier === tier) || { bonus: 1 }).bonus;
}

function slotTierCost(economy, slotId, tier) {
  const baseCost = (economy.slotTiers.find((item) => item.tier === tier) || {}).cpCost;
  if (!Number.isFinite(baseCost)) return Infinity;
  const slotScale = Math.pow(economy.slotPrestigeCostScale || 1, Math.max(0, Number(slotId) - 3));
  return Math.ceil(baseCost * slotScale);
}

function cacheCoreMultiplier(economy, level) {
  return Math.pow(economy.cacheCoreMultiplierBase || 1.5, Number(level || 0));
}

function cacheCoreCost(economy, level) {
  return Math.ceil((economy.cacheCoreBaseCost || 5) * Math.pow(economy.cacheCoreCostGrowth || 1.5, Number(level || 0)));
}

function domainBaseRate(domain, economy, cacheCoreLevel = 0) {
  return economy.baseRate * cacheCoreMultiplier(economy, cacheCoreLevel) * Math.pow(economy.trafficEngineMultiplier, level(domain, "trafficEngine"));
}

function activeRate(domain, economy, slotTier, cacheCoreLevel) {
  const tab = 1 + 0.15 * level(domain, "tabMultiplier");
  const focusLevel = level(domain, "focusBonus");
  const focus = 1 + 0.35 * focusLevel + 0.01 * Math.pow(focusLevel, 1.2);
  return domainBaseRate(domain, economy, cacheCoreLevel) * tab * focus * tierBonus(economy, slotTier);
}

function backgroundBaseRate(domain, economy, cacheCoreLevel) {
  const coreMultiplier = cacheCoreMultiplier(economy, cacheCoreLevel);
  const trafficRatio = Math.pow(economy.trafficEngineMultiplier, level(domain, "trafficEngine"));
  return economy.baseRate * coreMultiplier * Math.pow(trafficRatio, economy.backgroundTrafficExponent ?? 0.9);
}

function averageIdleDepthFactor(seconds) {
  if (seconds <= 0) return 0;
  if (seconds <= 1500) return seconds / 600;
  return 5 - 3750 / seconds;
}

function backgroundEarnings(domain, economy, slotTier, seconds, cacheCoreLevel) {
  const hum = 0.08 * level(domain, "backgroundHum");
  if (hum <= 0 || seconds <= 0) return 0;
  const idle = 1 + 0.1 * level(domain, "idleDepth") * averageIdleDepthFactor(seconds);
  const tab = 1 + 0.15 * level(domain, "tabMultiplier");
  return backgroundBaseRate(domain, economy, cacheCoreLevel) * tab * hum * idle * tierBonus(economy, slotTier) * seconds;
}

function vaultTrafficScale(domain, economy, cacheCoreLevel) {
  const coreMultiplier = cacheCoreMultiplier(economy, cacheCoreLevel);
  const trafficRatio = domainBaseRate(domain, economy, cacheCoreLevel) / (economy.baseRate * coreMultiplier);
  return Math.pow(trafficRatio, economy.vaultTrafficExponent ?? 0.9);
}

function vaultUpgradeMultiplier(economy, upgradeLevel) {
  const currentLevel = Math.max(0, Number(upgradeLevel || 0));
  return 1
    + (economy.vaultLinearMultiplier ?? 0.12) * currentLevel
    + (economy.vaultPolyMultiplier ?? 0.005) * Math.pow(currentLevel, economy.vaultPolyExponent ?? 3);
}

function vaultCap(domain, economy, cacheCoreLevel) {
  const coreMultiplier = cacheCoreMultiplier(economy, cacheCoreLevel);
  return economy.baseRate * coreMultiplier * 60 * 25 * vaultTrafficScale(domain, economy, cacheCoreLevel) * vaultUpgradeMultiplier(economy, level(domain, "coldStorage"));
}

function vaultRate(domain, economy, cacheCoreLevel) {
  const coreMultiplier = cacheCoreMultiplier(economy, cacheCoreLevel);
  return economy.vaultRate * coreMultiplier * vaultTrafficScale(domain, economy, cacheCoreLevel) * vaultUpgradeMultiplier(economy, level(domain, "storageDuration"));
}

function dailyFirstOpenValue(domain, economy, slotTierBonusValue, cacheCoreLevel) {
  const dailyBoot = level(domain, "dailyBoot");
  const baseDaily = Math.max(20, domainBaseRate(domain, economy, cacheCoreLevel) * 60 * (economy.dailyBaseMinutes ?? 60));
  const bootMultiplier = 1 + 0.18 * dailyBoot;
  const streak = Math.min(domain.currentStreak, 14);
  const bootAssist = 1 + (economy.dailyStreakBootMultiplier ?? 0.2) * Math.sqrt(dailyBoot);
  const streakMultiplier = 1 + (economy.dailyStreakBaseMultiplier ?? 0.04) * streak * bootAssist;
  return baseDaily * bootMultiplier * streakMultiplier * slotTierBonusValue;
}

function dailyFirstOpenBonus(domain, economy, slotTierBonusValue, day, enabled, cacheCoreLevel) {
  if (!enabled || domain.dailyBonusClaimedDay === day) return 0;
  return dailyFirstOpenValue(domain, economy, slotTierBonusValue, cacheCoreLevel);
}

function claimVault(domain, economy, slotTier, currentHour, day, includeDailyBonus, cacheCoreLevel) {
  const stored = Math.min(domain.vaultAmount, vaultCap(domain, economy, cacheCoreLevel));
  const daily = dailyFirstOpenBonus(domain, economy, tierBonus(economy, slotTier), day, includeDailyBonus, cacheCoreLevel);
  if (daily > 0) {
    domain.currentStreak += 1;
    domain.dailyBonusClaimedDay = day;
  }
  domain.lastVisitedHour = currentHour;
  domain.vaultAmount = 0;
  return { vault: stored, daily, total: stored + daily };
}

function addEarnings(state, domain, amount, bucket) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  state.balance += amount;
  state.totalLifetimeEarned += amount;
  state.dailyBuckets[bucket] += amount;
  domain.lifetimeEarned += amount;
}

function addVaultFill(state, domain, economy, elapsedSeconds) {
  const gain = Math.min(Math.max(0, vaultCap(domain, economy, state.cacheCoreLevel) - domain.vaultAmount), vaultRate(domain, economy, state.cacheCoreLevel) * elapsedSeconds);
  if (gain <= 0) return;
  domain.vaultAmount += gain;
  state.dailyBuckets.vaultAccrued += gain;
}

function spendAvailableMoney(state, economy, dayNumber) {
  let boughtSomething = true;
  let purchasesThisPeriod = 0;
  while (boughtSomething) {
    if (purchasesThisPeriod >= state.config.maxUpgradePurchasesPerPeriod) {
      state.warnings.push({
        day: dayNumber,
        type: "purchase_cap",
        message: "Stopped buying after " + state.config.maxUpgradePurchasesPerPeriod + " purchases in one period. Upgrade growth may be too low and causing runaway simulation time."
      });
      break;
    }
    boughtSomething = false;
    const nextSlot = state.domains.length + 1;
    const nextSlotCost = slotUnlockCost(nextSlot);
    if (state.balance >= nextSlotCost) {
      state.balance -= nextSlotCost;
      state.totalSpent += nextSlotCost;
      state.domains.push(createDomain(state.domains.length, economy.upgradeDefs));
      state.slots.push(createSlot(nextSlot));
      state.slotUnlocks.push({ slot: nextSlot, day: dayNumber, cost: nextSlotCost });
      purchasesThisPeriod += 1;
      boughtSomething = true;
      continue;
    }
    const candidates = [];
    state.domains.forEach((domain, domainIndex) => {
      economy.upgradeDefs.forEach((def, upgradeIndex) => {
        const currentLevel = level(domain, def.id);
        if (def.maxLevel !== null && currentLevel >= def.maxLevel) return;
        candidates.push({ domain, domainIndex, def, upgradeIndex, level: currentLevel, cost: upgradeCost(def, currentLevel) });
      });
    });
    if (!candidates.length) break;
    const affordable = candidates
      .filter((item) => item.cost <= state.balance)
      .sort((a, b) => a.cost - b.cost || a.domainIndex - b.domainIndex || a.upgradeIndex - b.upgradeIndex);
    if (!affordable.length) break;
    const purchase = affordable[0];
    state.balance -= purchase.cost;
    state.totalSpent += purchase.cost;
    purchase.domain.upgrades[purchase.def.id] += 1;
    purchasesThisPeriod += 1;
    boughtSomething = true;
  }
}

function spendPrestigeOnSlots(state, economy) {
  const purchases = [];
  for (const slot of state.slots) {
    while (slot.tier < economy.slotTiers.length - 1) {
      const nextTier = slot.tier + 1;
      const cost = slotTierCost(economy, slot.id, nextTier);
      if (state.cachePoints < cost) break;
      state.cachePoints -= cost;
      slot.tier = nextTier;
      purchases.push({ slot: slot.id, tier: nextTier, cost });
    }
  }
  return purchases;
}

function spendPrestigeOnCacheCore(state, economy) {
  const purchases = [];
  while (state.cachePoints >= cacheCoreCost(economy, state.cacheCoreLevel)) {
    const cost = cacheCoreCost(economy, state.cacheCoreLevel);
    state.cachePoints -= cost;
    state.cacheCoreLevel += 1;
    purchases.push({ level: state.cacheCoreLevel, cost, multiplier: cacheCoreMultiplier(economy, state.cacheCoreLevel) });
  }
  return purchases;
}

function resetForPrestige(state, economy, day) {
  if (state.prestigeCount < 1 && state.totalLifetimeEarned < (economy.firstPrestigeLifetimeRequirement ?? 10000000)) {
    state.warnings.push({
      day,
      type: "prestige_locked",
      message: "First prestige skipped; lifetime earnings below $" + (economy.firstPrestigeLifetimeRequirement ?? 10000000) + "."
    });
    return null;
  }
  const totalPrestige = prestigeTotalFromLifetime(state.totalLifetimeEarned, economy.prestigeDivisor);
  const award = Math.max(0, totalPrestige - state.cpAlreadyClaimedFromLifetime);
  state.cachePoints += award;
  state.cpAlreadyClaimedFromLifetime = totalPrestige;
  const cacheCorePurchases = spendPrestigeOnCacheCore(state, economy);
  const purchases = spendPrestigeOnSlots(state, economy);
  const highestPersistentSlot = state.slots.reduce((highest, slot) => slot.id <= 3 || slot.tier > 0 ? Math.max(highest, slot.id) : highest, 3);
  const previousSlots = state.slots.length;
  state.balance = 0;
  state.prestigeCount += 1;
  state.currentRun += 1;
  state.currentRunStartDay = day + 1;
  state.slots = Array.from({ length: highestPersistentSlot }, (_, index) => {
    const id = index + 1;
    const existing = state.slots.find((slot) => slot.id === id);
    return createSlot(id, existing?.tier || 0);
  });
  state.domains = state.slots.map((_, index) => createDomain(index, economy.upgradeDefs));
  const event = { day, award, totalPrestige, cachePointsRemaining: state.cachePoints, cacheCoreLevel: state.cacheCoreLevel, cacheCorePurchases, slotsBefore: previousSlots, slotsAfter: state.slots.length, purchases };
  state.prestigeEvents.push(event);
  return event;
}

function highestUpgradeLevels(domains, upgradeDefs) {
  return Object.fromEntries(upgradeDefs.map((def) => [def.id, Math.max(...domains.map((domain) => level(domain, def.id)))]));
}

function averageUpgradeLevels(domains, upgradeDefs) {
  return Object.fromEntries(upgradeDefs.map((def) => [def.id, domains.reduce((sum, domain) => sum + level(domain, def.id), 0) / domains.length]));
}

function normalizePrestigeResetDays(config) {
  if (!config.prestigeMode) return new Set();
  const validDays = [...new Set((config.prestigeResetDays || []).map((day) => Math.floor(Number(day))).filter((day) => day >= 1 && day <= config.days))].sort((a, b) => a - b);
  const count = Math.max(0, Math.floor(Number(config.prestigeResets) || 0));
  return new Set(validDays.slice(0, count));
}

function simulateEconomy(economy, config) {
  const startingCash = Math.max(0, Number(config.startingCash || 0));
  const state = {
    config: {
      ...config,
      maxUpgradePurchasesPerPeriod: config.maxUpgradePurchasesPerPeriod || 2000
    },
    balance: startingCash,
    totalLifetimeEarned: startingCash,
    totalSpent: 0,
    cachePoints: 0,
    cpAlreadyClaimedFromLifetime: 0,
    cacheCoreLevel: 0,
    prestigeCount: 0,
    currentRun: 1,
    currentRunStartDay: 1,
    domains: Array.from({ length: config.startingSlots }, (_, index) => createDomain(index, economy.upgradeDefs)),
    slots: Array.from({ length: config.startingSlots }, (_, index) => createSlot(index + 1, config.slotTier)),
    slotUnlocks: Array.from({ length: config.startingSlots }, (_, index) => ({ slot: index + 1, day: 1, cost: 0 })),
    prestigeEvents: [],
    warnings: [],
    dailyBuckets: null
  };
  const daily = [];
  const resetDays = normalizePrestigeResetDays(config);
  const periodsPerDay = Math.max(1, Math.floor(config.vaultClaimsPerDay));
  const periodSeconds = 86400 / periodsPerDay;
  spendAvailableMoney(state, economy, 0);
  for (let day = 1; day <= config.days; day += 1) {
    state.dailyBuckets = { focus: 0, background: 0, vaultAccrued: 0, vaultClaimed: 0, dailyBonus: 0, navigation: 0, wake: 0 };
    for (let period = 1; period <= periodsPerDay; period += 1) {
      const currentHour = (day - 1) * 24 + period * (24 / periodsPerDay);
      const domainsAtPeriodStart = state.domains.length;
      const focusSecondsPerDomain = (config.focusMinutesPerDay * 60 / domainsAtPeriodStart) / periodsPerDay;
      const backgroundSecondsPerDomain = (config.backgroundMinutesPerOtherSlotPerDay * 60 * Math.max(0, domainsAtPeriodStart - 1) / domainsAtPeriodStart) / periodsPerDay;
      state.domains.forEach((domain, domainIndex) => {
        const slot = state.slots[domainIndex] || createSlot(domainIndex + 1);
        addVaultFill(state, domain, economy, periodSeconds);
        addEarnings(state, domain, activeRate(domain, economy, slot.tier, state.cacheCoreLevel) * focusSecondsPerDomain, "focus");
        addEarnings(state, domain, backgroundEarnings(domain, economy, slot.tier, backgroundSecondsPerDomain, state.cacheCoreLevel), "background");
        if (config.enableNavigationBonus && config.navigationEventsPerFocusedHour > 0) {
          const events = (focusSecondsPerDomain / 3600) * config.navigationEventsPerFocusedHour;
          const navLevel = level(domain, "navigationBonus");
          const amount = navLevel > 0 ? activeRate(domain, economy, slot.tier, state.cacheCoreLevel) * (economy.navigationEventSeconds ?? 7) * Math.sqrt(navLevel) * events : 0;
          addEarnings(state, domain, amount, "navigation");
        }
        if (config.enableWakeBonus && config.wakeEventsPerDomainPerDay > 0) {
          const events = config.wakeEventsPerDomainPerDay / periodsPerDay;
          addEarnings(state, domain, domainBaseRate(domain, economy, state.cacheCoreLevel) * (economy.wakeBurstSeconds ?? 105) * Math.pow(level(domain, "wakeBonus"), 1.1) * tierBonus(economy, slot.tier) * events, "wake");
        }
        const payout = claimVault(domain, economy, slot.tier, currentHour, day, config.includeDailyBonus, state.cacheCoreLevel);
        addEarnings(state, domain, payout.vault, "vaultClaimed");
        addEarnings(state, domain, payout.daily, "dailyBonus");
      });
      spendAvailableMoney(state, economy, day + period / periodsPerDay);
    }
    const run = state.currentRun;
    const runDay = day - state.currentRunStartDay + 1;
    const prestigeEvent = resetDays.has(day) ? resetForPrestige(state, economy, day) : null;
    const redeemablePrestige = prestigeTotalFromLifetime(state.totalLifetimeEarned, economy.prestigeDivisor);
    daily.push({
      day,
      run,
      runDay,
      balance: state.balance,
      totalLifetimeEarned: state.totalLifetimeEarned,
      totalSpent: state.totalSpent,
      slots: state.domains.length,
      redeemablePrestige,
      lifetimePrestige: redeemablePrestige,
      claimedPrestige: state.cpAlreadyClaimedFromLifetime,
      cachePoints: state.cachePoints,
      cacheCoreLevel: state.cacheCoreLevel,
      cacheCoreMultiplier: cacheCoreMultiplier(economy, state.cacheCoreLevel),
      prestigeCount: state.prestigeCount,
      prestigeAward: prestigeEvent?.award || 0,
      vaultStored: state.domains.reduce((sum, domain) => sum + domain.vaultAmount, 0),
      income: { ...state.dailyBuckets },
      highestUpgradeLevels: highestUpgradeLevels(state.domains, economy.upgradeDefs),
      averageUpgradeLevels: averageUpgradeLevels(state.domains, economy.upgradeDefs),
      slotTiers: state.slots.map((slot) => slot.tier)
    });
  }
  return { config: state.config, economy, daily, slotUnlocks: state.slotUnlocks, prestigeEvents: state.prestigeEvents, warnings: state.warnings, final: daily[daily.length - 1], slots: state.slots.map((slot) => ({ ...slot })), domains: state.domains.map((domain) => ({ id: domain.id, upgrades: { ...domain.upgrades }, lifetimeEarned: domain.lifetimeEarned, vaultAmount: domain.vaultAmount })) };
}

function lineChart(rows, series, width = 920, height = 280) {
  const pad = 36;
  const max = Math.max(1, ...rows.flatMap((row, index) => series.map((item) => item.value(row, index))));
  const x = (index) => pad + (rows.length <= 1 ? 0 : index * (width - pad * 2) / (rows.length - 1));
  const y = (value) => height - pad - (value / max) * (height - pad * 2);
  const paths = series.map((item) => {
    const points = rows.map((row, index) => (index === 0 ? "M" : "L") + x(index).toFixed(1) + "," + y(item.value(row, index)).toFixed(1)).join(" ");
    return '<path d="' + points + '" fill="none" stroke="' + item.color + '" stroke-width="2.5" />';
  }).join("");
  const legend = series.map((item, index) => '<g transform="translate(' + (pad + index * 190) + ',18)"><rect width="10" height="10" fill="' + item.color + '"/><text x="16" y="10">' + escapeHtml(item.label) + '</text></g>').join("");
  return '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img"><rect width="' + width + '" height="' + height + '" fill="#10131d" rx="8"/><line x1="' + pad + '" y1="' + (height - pad) + '" x2="' + (width - pad) + '" y2="' + (height - pad) + '" stroke="#343b52"/><line x1="' + pad + '" y1="' + pad + '" x2="' + pad + '" y2="' + (height - pad) + '" stroke="#343b52"/><text x="' + pad + '" y="' + (pad - 10) + '">' + compact(max) + '</text>' + paths + legend + '</svg>';
}

function stackedBars(rows, keys, width = 920, height = 300) {
  const pad = 36;
  const max = Math.max(1, ...rows.map((row) => keys.reduce((sum, key) => sum + row.income[key], 0)));
  const barGap = 1;
  const barWidth = Math.max(1, (width - pad * 2) / rows.length - barGap);
  const chartHeight = height - pad * 2;
  const bars = rows.map((row, index) => {
    let yCursor = height - pad;
    const x = pad + index * ((width - pad * 2) / rows.length);
    return keys.map((key) => {
      const h = row.income[key] / max * chartHeight;
      yCursor -= h;
      return '<rect x="' + x.toFixed(1) + '" y="' + yCursor.toFixed(1) + '" width="' + barWidth.toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '" fill="' + COLORS[key] + '"/>';
    }).join("");
  }).join("");
  const legend = keys.map((key, index) => '<g transform="translate(' + (pad + index * 130) + ',18)"><rect width="10" height="10" fill="' + COLORS[key] + '"/><text x="16" y="10">' + escapeHtml(key) + '</text></g>').join("");
  return '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img"><rect width="' + width + '" height="' + height + '" fill="#10131d" rx="8"/><line x1="' + pad + '" y1="' + (height - pad) + '" x2="' + (width - pad) + '" y2="' + (height - pad) + '" stroke="#343b52"/><line x1="' + pad + '" y1="' + pad + '" x2="' + pad + '" y2="' + (height - pad) + '" stroke="#343b52"/><text x="' + pad + '" y="' + (pad - 10) + '">' + compact(max) + '</text>' + bars + legend + '</svg>';
}

function tableHtml(headers, rows) {
  return '<table><thead><tr>' + headers.map((header) => '<th>' + escapeHtml(header) + '</th>').join("") + '</tr></thead><tbody>' + rows.map((row) => '<tr>' + row.map((cell) => '<td>' + escapeHtml(cell) + '</td>').join("") + '</tr>').join("") + '</tbody></table>';
}

function incomeBreakdownTable(result, selectedDay) {
  const day = Math.min(Math.max(1, selectedDay), result.daily.length);
  const row = result.daily[day - 1];
  const sources = [
    ["Focus", row.income.focus],
    ["Background", row.income.background],
    ["Vault claimed", row.income.vaultClaimed],
    ["Daily bonus", row.income.dailyBonus],
    ["Navigation", row.income.navigation],
    ["Wake", row.income.wake]
  ];
  const realizedTotal = sources.reduce((sum, [, value]) => sum + value, 0);
  const rows = sources.map(([label, value]) => [
    label,
    "$" + compact(value),
    realizedTotal > 0 ? (value / realizedTotal * 100).toFixed(2) + "%" : "0.00%"
  ]);
  rows.push(["Vault accrued (stored, not income)", "$" + compact(row.income.vaultAccrued), "-"]);
  return '<div class="day-breakdown"><div class="day-control"><label>Income details for day <input id="incomeDayInput" type="number" min="1" max="' + result.daily.length + '" step="1" value="' + day + '"></label><span class="muted">Realized income: $' + compact(realizedTotal) + '</span></div>' +
    tableHtml(["Income Source", "Generated That Day", "Share"], rows) + '</div>';
}

function realizedDailyIncome(row) {
  return row.income.focus + row.income.background + row.income.vaultClaimed + row.income.dailyBonus + row.income.navigation + row.income.wake;
}

function runProgressionChart(result, width = 920, height = 320) {
  const runs = new Map();
  for (const row of result.daily) {
    const run = row.run || 1;
    if (!runs.has(run)) runs.set(run, []);
    runs.get(run).push({ runDay: row.runDay || row.day, income: realizedDailyIncome(row) });
  }
  const runEntries = [...runs.entries()];
  const pad = 40;
  const maxDay = Math.max(1, ...runEntries.flatMap(([, rows]) => rows.map((row) => row.runDay)));
  const maxIncome = Math.max(1, ...runEntries.flatMap(([, rows]) => rows.map((row) => row.income)));
  const palette = ["#27d3ff", "#ffc857", "#8ce36b", "#ff7eb6", "#c084fc", "#ff9f1c", "#7bdff2"];
  const x = (runDay) => pad + (maxDay <= 1 ? 0 : (runDay - 1) * (width - pad * 2) / (maxDay - 1));
  const y = (value) => height - pad - (value / maxIncome) * (height - pad * 2);
  const paths = runEntries.map(([run, rows], index) => {
    const points = rows.map((row, pointIndex) => (pointIndex === 0 ? "M" : "L") + x(row.runDay).toFixed(1) + "," + y(row.income).toFixed(1)).join(" ");
    return '<path d="' + points + '" fill="none" stroke="' + palette[index % palette.length] + '" stroke-width="2.5" />';
  }).join("");
  const legend = runEntries.map(([run], index) => '<g transform="translate(' + (pad + (index % 4) * 190) + ',' + (18 + Math.floor(index / 4) * 18) + ')"><rect width="10" height="10" fill="' + palette[index % palette.length] + '"/><text x="16" y="10">Run ' + run + '</text></g>').join("");
  return '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img"><rect width="' + width + '" height="' + height + '" fill="#10131d" rx="8"/><line x1="' + pad + '" y1="' + (height - pad) + '" x2="' + (width - pad) + '" y2="' + (height - pad) + '" stroke="#343b52"/><line x1="' + pad + '" y1="' + pad + '" x2="' + pad + '" y2="' + (height - pad) + '" stroke="#343b52"/><text x="' + pad + '" y="' + (pad - 10) + '">$' + compact(maxIncome) + '/day</text><text x="' + (width - pad - 100) + '" y="' + (height - 12) + '">relative run day</text>' + paths + legend + '</svg>';
}

function noResetConfig(config) {
  return {
    ...config,
    prestigeMode: false,
    prestigeResets: 0,
    prestigeResetDays: []
  };
}

function noResetComparisonFor(result) {
  if (!result.config?.prestigeMode || !(result.prestigeEvents || []).length) return null;
  if (result.noResetComparison) return result.noResetComparison;
  const baseline = simulateEconomy(structuredClone(result.economy), noResetConfig(result.config));
  result.noResetComparison = {
    noReset: {
      config: baseline.config,
      final: baseline.final,
      daily: baseline.daily,
      slotUnlocks: baseline.slotUnlocks
    }
  };
  return result.noResetComparison;
}

function percentDelta(value, baseline) {
  if (!Number.isFinite(value) || !Number.isFinite(baseline) || baseline === 0) return "-";
  const delta = (value / baseline - 1) * 100;
  return (delta >= 0 ? "+" : "") + delta.toFixed(1) + "%";
}

function resetComparisonSection(result) {
  const comparison = noResetComparisonFor(result);
  if (!comparison) return "";
  const baseline = comparison.noReset;
  const withReset = result.final;
  const noReset = baseline.final;
  const rows = [
    ["Lifetime Earned", "$" + compact(withReset.totalLifetimeEarned), "$" + compact(noReset.totalLifetimeEarned), percentDelta(withReset.totalLifetimeEarned, noReset.totalLifetimeEarned)],
    ["Unlocked Slots", withReset.slots, noReset.slots, percentDelta(withReset.slots, noReset.slots)],
    ["Lifetime Prestige", withReset.lifetimePrestige ?? withReset.redeemablePrestige, noReset.lifetimePrestige ?? noReset.redeemablePrestige, percentDelta(withReset.lifetimePrestige ?? withReset.redeemablePrestige, noReset.lifetimePrestige ?? noReset.redeemablePrestige)],
    ["Claimed Prestige", withReset.claimedPrestige || 0, noReset.claimedPrestige || 0, percentDelta(withReset.claimedPrestige || 0, noReset.claimedPrestige || 0)],
    ["Cache Core", "L" + (withReset.cacheCoreLevel || 0) + " / x" + (withReset.cacheCoreMultiplier || 1).toFixed(2), "L" + (noReset.cacheCoreLevel || 0) + " / x" + (noReset.cacheCoreMultiplier || 1).toFixed(2), percentDelta(withReset.cacheCoreMultiplier || 1, noReset.cacheCoreMultiplier || 1)]
  ];
  return '<section><h2>Reset Vs No Reset</h2>' +
    tableHtml(["Metric", "With Resets", "No Reset", "Delta"], rows) +
    lineChart(result.daily, [
      { label: "With resets lifetime", color: "#c084fc", value: (row) => row.totalLifetimeEarned },
      { label: "No reset lifetime", color: "#ffc857", value: (_row, index) => baseline.daily[index]?.totalLifetimeEarned || 0 }
    ]) +
    '</section>';
}

function renderResults(result) {
  currentResult = result;
  const daily = result.daily;
  const final = result.final;
  const warningRows = (result.warnings || []).slice(0, 20).map((warning) => [
    Number(warning.day || 0).toFixed(2),
    warning.type || "warning",
    warning.message || ""
  ]);
  const slotRows = result.slotUnlocks.map((unlock) => [unlock.slot, unlock.day.toFixed(2), "$" + compact(unlock.cost)]);
  const prestigeEventRows = (result.prestigeEvents || []).map((event) => [
    event.day,
    event.award,
    event.totalPrestige,
    event.cachePointsRemaining,
    "L" + (event.cacheCoreLevel || 0),
    event.cacheCorePurchases?.length ? event.cacheCorePurchases.map((item) => "L" + item.level).join(", ") : "none",
    event.slotsBefore + " -> " + event.slotsAfter,
    event.purchases.length ? event.purchases.map((item) => "S" + item.slot + " T" + item.tier).join(", ") : "none"
  ]);
  const prestigeRows = [1, 3, 5, 8].map((target) => {
    const hit = daily.find((row) => row.redeemablePrestige >= target);
    return [target, hit ? hit.day : "not reached"];
  });
  const upgradeRows = Object.entries(final.highestUpgradeLevels).map(([id, value]) => [id, value.toFixed(0), final.averageUpgradeLevels[id].toFixed(2)]);
  document.getElementById("results").innerHTML = '<h1>Simulation Results</h1><div class="summary">' +
    '<div class="metric"><strong>Days</strong><span>' + result.config.days + '</span></div>' +
    '<div class="metric"><strong>Final Balance</strong><span>$' + compact(final.balance) + '</span></div>' +
    '<div class="metric"><strong>Lifetime Earned</strong><span>$' + compact(final.totalLifetimeEarned) + '</span></div>' +
    '<div class="metric"><strong>Slots</strong><span>' + final.slots + '</span></div>' +
    '<div class="metric"><strong>Redeemable CP</strong><span>' + final.redeemablePrestige + '</span></div>' +
    '<div class="metric"><strong>Lifetime Prestige</strong><span>' + (final.lifetimePrestige ?? final.redeemablePrestige) + '</span></div>' +
    '<div class="metric"><strong>Claimed Prestige</strong><span>' + (final.claimedPrestige || 0) + '</span></div>' +
    '<div class="metric"><strong>Cache Points</strong><span>' + (final.cachePoints || 0) + '</span></div>' +
    '<div class="metric"><strong>Cache Core</strong><span>L' + (final.cacheCoreLevel || 0) + ' / x' + (final.cacheCoreMultiplier || 1).toFixed(2) + '</span></div>' +
    '<div class="metric"><strong>Prestige Resets</strong><span>' + (final.prestigeCount || 0) + '</span></div></div>' +
    '<section><h2>Balance And Lifetime Earnings</h2>' + lineChart(daily, [{ label: "Balance", color: "#27d3ff", value: (row) => row.balance }, { label: "Lifetime earned", color: "#ffc857", value: (row) => row.totalLifetimeEarned }]) + '</section>' +
    '<section><h2>Daily Income Breakdown</h2>' + stackedBars(daily, ["focus", "background", "vaultClaimed", "dailyBonus", "navigation", "wake"]) + '<div id="incomeBreakdown">' + incomeBreakdownTable(result, 1) + '</div></section>' +
    '<section><h2>Slots And Prestige</h2>' + lineChart(daily, [{ label: "Slots", color: "#8ce36b", value: (row) => row.slots }, { label: "Redeemable CP", color: "#c084fc", value: (row) => row.redeemablePrestige }]) + '</section>' +
    resetComparisonSection(result) +
    ((result.prestigeEvents || []).length ? '<section><h2>Run Income Progression</h2>' + runProgressionChart(result) + '</section>' : '') +
    (warningRows.length ? '<section><h2>Simulation Warnings</h2>' + tableHtml(["Day", "Type", "Message"], warningRows) + '</section>' : '') +
    '<section><h2>Slot Unlocks</h2>' + tableHtml(["Slot", "Day", "Cost"], slotRows) + '</section>' +
    (prestigeEventRows.length ? '<section><h2>Prestige Resets</h2>' + tableHtml(["Day", "Award", "Total CP", "CP Left", "Cache Core", "Core Purchases", "Slots", "Tier Purchases"], prestigeEventRows) + '</section>' : '') +
    '<section><h2>Prestige Milestones</h2>' + tableHtml(["Redeemable CP", "First Day Reached"], prestigeRows) + '</section>' +
    '<section><h2>Final Upgrade Levels</h2>' + tableHtml(["Upgrade", "Highest", "Average"], upgradeRows) + '</section>';
  document.getElementById("incomeBreakdown").addEventListener("input", (event) => {
    if (event.target.id !== "incomeDayInput") return;
    const nextDay = Number(event.target.value || 1);
    document.getElementById("incomeBreakdown").innerHTML = incomeBreakdownTable(result, nextDay);
    const nextInput = document.getElementById("incomeDayInput");
    nextInput.focus();
    nextInput.select();
  });
}

function downloadSimulationResults() {
  const payload = JSON.stringify(currentResult, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const mode = currentResult.config?.prestigeMode ? "prestige" : "standard";
  const fileName = "browser-tycoon-sim-" + mode + "-" + new Date().toISOString().slice(0, 10) + ".json";
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  const status = document.getElementById("downloadStatus");
  status.innerHTML = 'Download requested: <strong>' + escapeHtml(fileName) + '</strong>. If it did not appear, use this fallback: <a href="' + url + '" download="' + escapeHtml(fileName) + '">download JSON</a>.';
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function readNumber(form, name, fallback) {
  const value = Number(form.elements[name].value);
  return Number.isFinite(value) ? value : fallback;
}

function readDayList(form, name) {
  return String(form.elements[name].value || "")
    .split(/[,\s]+/)
    .map((value) => Math.floor(Number(value)))
    .filter((value) => Number.isFinite(value));
}

function readConfig(form) {
  const navigationEventsPerFocusedHour = Math.max(0, readNumber(form, "navigationEventsPerFocusedHour", 0));
  const wakeEventsPerDomainPerDay = Math.max(0, readNumber(form, "wakeEventsPerDomainPerDay", 0));
  return {
    days: Math.max(1, Math.floor(readNumber(form, "days", 100))),
    focusMinutesPerDay: Math.max(0, readNumber(form, "focusHours", 2) * 60),
    backgroundMinutesPerOtherSlotPerDay: Math.max(0, readNumber(form, "backgroundHours", 0.25) * 60),
    vaultClaimsPerDay: Math.max(1, Math.floor(readNumber(form, "vaultClaimsPerDay", 3))),
    startingCash: Math.max(0, readNumber(form, "startingCash", 0)),
    startingSlots: Math.max(1, Math.floor(readNumber(form, "startingSlots", 3))),
    includeDailyBonus: form.elements.includeDailyBonus.checked,
    enableNavigationBonus: form.elements.enableNavigationBonus.checked || navigationEventsPerFocusedHour > 0,
    navigationEventsPerFocusedHour,
    enableWakeBonus: form.elements.enableWakeBonus.checked || wakeEventsPerDomainPerDay > 0,
    wakeEventsPerDomainPerDay,
    slotTier: Math.max(0, Math.floor(readNumber(form, "slotTier", 0))),
    prestigeMode: form.elements.prestigeMode.checked,
    prestigeResets: Math.max(0, Math.floor(readNumber(form, "prestigeResets", 0))),
    prestigeResetDays: readDayList(form, "prestigeResetDays")
  };
}

function readEconomy(form) {
  const economy = structuredClone(initialEconomy);
  economy.baseRate = Math.max(0, readNumber(form, "baseRate", economy.baseRate));
  economy.vaultRate = Math.max(0, readNumber(form, "vaultRate", economy.vaultRate));
  economy.vaultLinearMultiplier = Math.max(0, readNumber(form, "vaultLinearMultiplier", economy.vaultLinearMultiplier ?? 0.12));
  economy.vaultPolyMultiplier = Math.max(0, readNumber(form, "vaultPolyMultiplier", economy.vaultPolyMultiplier ?? 0.005));
  economy.vaultPolyExponent = Math.max(1, readNumber(form, "vaultPolyExponent", economy.vaultPolyExponent ?? 3));
  economy.vaultTrafficExponent = Math.max(0, readNumber(form, "vaultTrafficExponent", economy.vaultTrafficExponent ?? 0.9));
  economy.backgroundTrafficExponent = Math.max(0, readNumber(form, "backgroundTrafficExponent", economy.backgroundTrafficExponent ?? 0.9));
  economy.dailyBaseMinutes = Math.max(0, readNumber(form, "dailyBaseMinutes", economy.dailyBaseMinutes ?? 60));
  economy.dailyStreakBaseMultiplier = Math.max(0, readNumber(form, "dailyStreakBaseMultiplier", economy.dailyStreakBaseMultiplier ?? 0.04));
  economy.dailyStreakBootMultiplier = Math.max(0, readNumber(form, "dailyStreakBootMultiplier", economy.dailyStreakBootMultiplier ?? 0.2));
  economy.navigationEventSeconds = Math.max(0, readNumber(form, "navigationEventSeconds", economy.navigationEventSeconds ?? 18));
  economy.wakeBurstSeconds = Math.max(0, readNumber(form, "wakeBurstSeconds", economy.wakeBurstSeconds ?? 105));
  economy.trafficEngineMultiplier = Math.max(1, readNumber(form, "trafficEngineMultiplier", economy.trafficEngineMultiplier));
  economy.prestigeDivisor = Math.max(1, readNumber(form, "prestigeDivisor", economy.prestigeDivisor));
  economy.slotPrestigeCostScale = Math.max(1, readNumber(form, "slotPrestigeCostScale", economy.slotPrestigeCostScale || 1));
  economy.cacheCoreMultiplierBase = Math.max(1, readNumber(form, "cacheCoreMultiplierBase", economy.cacheCoreMultiplierBase || 1.5));
  economy.cacheCoreBaseCost = Math.max(1, readNumber(form, "cacheCoreBaseCost", economy.cacheCoreBaseCost || 5));
  economy.cacheCoreCostGrowth = Math.max(1, readNumber(form, "cacheCoreCostGrowth", economy.cacheCoreCostGrowth || 1.5));
  document.querySelectorAll("[data-upgrade-index]").forEach((input) => {
    const def = economy.upgradeDefs[Number(input.dataset.upgradeIndex)];
    const field = input.dataset.upgradeField;
    if (field === "maxLevel") {
      def.maxLevel = input.value === "" ? null : Math.max(0, Math.floor(Number(input.value)));
    } else {
      def[field] = Math.max(field === "growth" ? 1 : 0, Number(input.value));
    }
  });
  return economy;
}

document.getElementById("simForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const result = simulateEconomy(readEconomy(form), readConfig(form));
  renderResults(result);
  document.getElementById("setupView").classList.add("hidden");
  document.getElementById("resultsView").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "auto" });
});

document.getElementById("newSimulation").addEventListener("click", () => {
  document.getElementById("resultsView").classList.add("hidden");
  document.getElementById("setupView").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "auto" });
});

document.getElementById("downloadResults").addEventListener("click", downloadSimulationResults);
</script>
</body>
</html>`;
}
