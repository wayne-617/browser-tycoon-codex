import { pathToFileURL } from "node:url";

const POPUP_WIDTH = 380;
const POPUP_HEIGHT = 580;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function jsonScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function fileUrl(path) {
  return pathToFileURL(path).href;
}

export function renderMarketingPage(config, paths) {
  const popupCssUrl = fileUrl(paths.popupCssPath);
  const fontsCssUrl = fileUrl(paths.fontsCssPath);
  const fallbackIconUrl = fileUrl(paths.fallbackIconPath);
  const initialConfig = jsonScript(config);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Browser Tycoon Marketing Screenshot Generator</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #080a10; color: #eef3ff; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #080a10; color: #eef3ff; }
    button, input, select, textarea { font: inherit; }
    .builder { max-width: 1220px; margin: 0 auto; padding: 24px; display: grid; grid-template-columns: minmax(420px, 1fr) ${POPUP_WIDTH}px; gap: 24px; align-items: start; }
    .panel { background: #121622; border: 1px solid #283047; border-radius: 8px; padding: 16px; }
    h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 18px; letter-spacing: 0; color: #dbe5ff; }
    p { margin: 0 0 16px; color: #aab3cf; }
    label { display: grid; gap: 6px; color: #aab3cf; font-size: 13px; }
    input, select, textarea { width: 100%; border: 1px solid #34405e; border-radius: 6px; background: #0b0e17; color: #f6f9ff; padding: 8px 10px; }
    textarea { min-height: 360px; font-family: "Cascadia Code", Consolas, monospace; font-size: 12px; line-height: 1.45; }
    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 14px; }
    .btn { border: 1px solid #49618d; border-radius: 6px; background: #1c2741; color: #eef3ff; padding: 9px 12px; cursor: pointer; }
    .btn-primary { background: #1e88e5; border-color: #64b5f6; color: #fff; }
    .muted { color: #aab3cf; font-size: 13px; }
    .check-row { display: flex; gap: 8px; align-items: center; margin: 10px 0 0; color: #c8d4ef; font-size: 13px; }
    .check-row input { width: auto; }
    .income-guard { margin-top: 10px; color: #aab3cf; font-size: 13px; }
    .income-guard.ok { color: #70ffb1; }
    .income-guard.warn { color: #ffd166; }
    .form-section { margin: 16px 0; padding-top: 16px; border-top: 1px solid #283047; }
    .form-section h2 { margin-bottom: 10px; }
    .welcome-total-preview { margin-top: 10px; color: #70ffb1; font-size: 14px; }
    .preview-frame { width: ${POPUP_WIDTH}px; height: ${POPUP_HEIGHT}px; border: 0; display: block; box-shadow: 0 18px 60px rgba(0,0,0,0.45); }
    .preview-wrap { position: sticky; top: 24px; }
    .preview-label { color: #aab3cf; font-size: 12px; margin: 0 0 8px; text-align: center; }
    body.screenshot-mode { width: ${POPUP_WIDTH}px; height: ${POPUP_HEIGHT}px; min-height: ${POPUP_HEIGHT}px; overflow: hidden; background: #040d14; }
    body.screenshot-mode .builder { display: block; padding: 0; margin: 0; width: ${POPUP_WIDTH}px; height: ${POPUP_HEIGHT}px; }
    body.screenshot-mode .controls { display: none; }
    body.screenshot-mode .preview-wrap { position: static; width: ${POPUP_WIDTH}px; height: ${POPUP_HEIGHT}px; }
    body.screenshot-mode .preview-label { display: none; }
    body.screenshot-mode .preview-frame { box-shadow: none; }
    @media (max-width: 900px) {
      .builder { grid-template-columns: 1fr; }
      .preview-wrap { position: static; justify-self: center; }
    }
  </style>
</head>
<body>
  <main class="builder">
    <section class="controls panel">
      <h1>Browser Tycoon Screenshot Generator</h1>
      <p>Adjust the mock popup state, then use the CLI with <code>--screenshot</code> for a PNG or <code>--video</code> for a 3 second WebM.</p>
      <div class="form-grid">
        <label>Preset
          <select id="presetSelect">
            <option value="">Custom / loaded config</option>
            <option value="early">Early Game</option>
            <option value="mid">Mid Game</option>
            <option value="late">Late Game</option>
            <option value="prestige">Prestige Showcase</option>
            <option value="slotShowcase">Slot Showcase</option>
            <option value="welcomeBack">Welcome Back</option>
            <option value="upgradeShowcase">Upgrade Showcase</option>
          </select>
        </label>
        <label>Preview screen
          <select id="screenInput">
            <option value="slots">Slots</option>
            <option value="upgrades">Active Upgrades</option>
          </select>
        </label>
        <label>Current money
          <input id="moneyInput" type="number" min="0" step="1">
        </label>
        <label>Income / sec
          <input id="incomeInput" type="number" min="0" step="1">
        </label>
        <label>Cache Credits
          <input id="ccInput" type="number" min="0" step="1">
        </label>
        <label>Slots unlocked
          <input id="slotsUnlockedInput" type="number" min="1" max="12" step="1">
        </label>
      </div>
      <section class="form-section">
        <h2>Active Upgrade Page</h2>
        <div class="form-grid">
          <label>Domain
            <input id="upgradeDomainInput" type="text" placeholder="youtube.com">
          </label>
          <label>Traffic Engine level
            <input id="trafficEngineLevelInput" type="number" min="0" step="1">
          </label>
          <label>Tab Multiplier level
            <input id="tabMultiplierLevelInput" type="number" min="0" step="1">
          </label>
          <label>Focus Bonus level
            <input id="focusBonusLevelInput" type="number" min="0" step="1">
          </label>
          <label>Navigation Bonus level
            <input id="navigationBonusLevelInput" type="number" min="0" step="1">
          </label>
        </div>
      </section>
      <section class="form-section">
        <h2>Welcome Back Popup</h2>
        <label class="check-row">
          <input id="welcomeEnabledInput" type="checkbox">
          Show welcome-back popup
        </label>
        <div class="form-grid" style="margin-top:12px;">
          <label>Seconds away
            <input id="welcomeSecondsInput" type="number" min="0" step="1">
          </label>
          <label>Focus income
            <input id="welcomeFocusInput" type="number" min="0" step="1">
          </label>
          <label>Background income
            <input id="welcomeBackgroundInput" type="number" min="0" step="1">
          </label>
          <label>Daily first-open
            <input id="welcomeDailyInput" type="number" min="0" step="1">
          </label>
          <label>Navigation bonus
            <input id="welcomeNavigationInput" type="number" min="0" step="1">
          </label>
          <label>Wake bursts
            <input id="welcomeWakeInput" type="number" min="0" step="1">
          </label>
          <label>Other income
            <input id="welcomeOtherInput" type="number" min="0" step="1">
          </label>
        </div>
        <div id="welcomeTotalPreview" class="welcome-total-preview"></div>
      </section>
      <label>Slots JSON
        <textarea id="slotsInput" spellcheck="false"></textarea>
      </label>
      <label class="check-row">
        <input id="autoBalanceInput" type="checkbox" checked>
        Auto balance active/background slot rates to top income
      </label>
      <div id="incomeGuard" class="income-guard" aria-live="polite"></div>
      <div class="actions">
        <button class="btn btn-primary" id="applyButton" type="button">Update Preview</button>
        <button class="btn" id="balanceButton" type="button">Balance Slot Income</button>
        <button class="btn" id="copyButton" type="button">Copy Config JSON</button>
      </div>
      <div id="status" class="muted" aria-live="polite"></div>
    </section>
    <section class="preview-wrap">
      <div class="preview-label">Exact popup preview (${POPUP_WIDTH} x ${POPUP_HEIGHT})</div>
      <iframe id="previewFrame" class="preview-frame" title="Browser Tycoon popup preview"></iframe>
    </section>
  </main>
  <script>
    const popupCssUrl = ${JSON.stringify(popupCssUrl)};
    const fontsCssUrl = ${JSON.stringify(fontsCssUrl)};
    const fallbackIconUrl = ${JSON.stringify(fallbackIconUrl)};
    const initialConfig = ${initialConfig};
    const presets = ${jsonScript(builtInPresets())};
    const pageParams = new URLSearchParams(location.search);
    const screenshotMode = pageParams.get("screenshot") === "1";
    const videoInitialSecond = Math.max(0, Number(pageParams.get("videoSecond") || 0));
    const activeUpgradeDefs = [
      { id: "trafficEngine", name: "Traffic Engine", baseCost: 25, growth: 1.35, icon: 26 },
      { id: "tabMultiplier", name: "Tab Multiplier", baseCost: 35, growth: 1.5, icon: 13 },
      { id: "focusBonus", name: "Focus Bonus", baseCost: 25, growth: 1.4, icon: 16 },
      { id: "navigationBonus", name: "Navigation Bonus", baseCost: 100, growth: 1.65, icon: 37 }
    ];
    if (screenshotMode) document.body.classList.add("screenshot-mode");

    let currentConfig = normalizeConfig(initialConfig);
    const videoBaseMoney = currentConfig.money;
    const videoIncomePerSecond = currentConfig.incomePerSecond;
    if (videoInitialSecond > 0) {
      currentConfig.money = videoBaseMoney + videoIncomePerSecond * videoInitialSecond;
    }
    currentConfig = currentConfig.balanceIncome ? reconcileIncome(currentConfig) : currentConfig;

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    }

    function compactMoney(value) {
      const number = Number(value || 0);
      if (!Number.isFinite(number) || number <= 0) return "$0.00";
      if (number < 1000) return "$" + number.toFixed(2);
      const suffixes = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
      const exponent = Math.floor(Math.log10(Math.abs(number)));
      const suffix = Math.floor(exponent / 3);
      if (suffix > 0 && suffix < suffixes.length) {
        const amount = number / Math.pow(10, suffix * 3);
        return "$" + amount.toFixed(2) + suffixes[suffix];
      }
      return "$" + number.toExponential(2);
    }

    function compactNumber(value) {
      const number = Number(value || 0);
      if (!Number.isFinite(number) || number <= 0) return "0";
      if (number < 1000) return String(Math.floor(number));
      const suffixes = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
      const exponent = Math.floor(Math.log10(Math.abs(number)));
      const suffix = Math.floor(exponent / 3);
      if (suffix > 0 && suffix < suffixes.length) {
        return Math.floor(number / Math.pow(10, suffix * 3)) + suffixes[suffix];
      }
      return Math.floor(number).toExponential(1);
    }

    function floorToSignificantFigures(value, figures = 2) {
      if (!Number.isFinite(value) || value <= 0) return 0;
      const scale = Math.pow(10, Math.floor(Math.log10(value)) - figures + 1);
      return Math.floor(value / scale) * scale;
    }

    function slotUnlockCost(slotNumber) {
      if (slotNumber <= 3) return 0;
      return floorToSignificantFigures(10000 * Math.pow(100, Math.max(0, slotNumber - 4)));
    }

    function upgradeCost(def, level) {
      return Math.ceil(def.baseCost * Math.pow(def.growth, Math.max(0, Number(level || 0))));
    }

    function extensionIconUrl(index) {
      return "icons/Icon14_" + String(index).padStart(2, "0") + ".png";
    }

    function tierClass(tier) {
      return "slot-tier-" + Math.max(0, Math.min(Number(tier) || 0, 5));
    }

    function tierMaterial(tier) {
      return ["BASIC", "BRONZE", "SILVER", "GOLD", "PLATINUM", "PRISMATIC"][Math.max(0, Math.min(Number(tier) || 0, 5))] || "BASIC";
    }

    function tierName(tier) {
      return ["", "I", "II", "III", "IV", "V"][Math.max(0, Math.min(Number(tier) || 0, 5))] || "";
    }

    function slotTierLabel(tier) {
      const material = tierMaterial(tier);
      const rank = tierName(tier);
      return rank ? material + " " + rank : material;
    }

    function stateLabel(state) {
      if (state === "active") return { text: "[ACTIVE]", className: "focused" };
      if (state === "background") return { text: "[BACKGROUND]", className: "background" };
      return { text: "[INACTIVE]", className: "closed" };
    }

    function faviconDomain(domain) {
      const cleaned = String(domain || "").trim();
      if (!cleaned) return "";
      try {
        const pageUrl = cleaned.startsWith("http://") || cleaned.startsWith("https://")
          ? new URL(cleaned)
          : new URL("https://" + cleaned);
        return pageUrl.hostname.replace(/^www\\./, "");
      } catch {
        return cleaned.replace(/^https?:\\/\\//, "").split("/")[0].replace(/^www\\./, "");
      }
    }

    function faviconSources(domain) {
      const cleaned = faviconDomain(domain);
      if (!cleaned) return [fallbackIconUrl];
      const encodedDomain = encodeURIComponent(cleaned);
      const encodedPage = encodeURIComponent("https://" + cleaned);
      const overrides = {
        "mail.google.com": [
          "https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico",
          "https://www.gstatic.com/images/branding/product/1x/gmail_2020q4_48dp.png"
        ],
        "claude.ai": [
          "https://claude.ai/favicon.ico",
          "https://claude.ai/favicon-32x32.png"
        ]
      };
      return [
        ...(overrides[cleaned] || []),
        "https://" + cleaned + "/favicon.ico",
        "https://www.google.com/s2/favicons?sz=64&domain_url=" + encodedPage,
        "https://www.google.com/s2/favicons?sz=64&domain=" + encodedDomain,
        "https://icons.duckduckgo.com/ip3/" + encodedDomain + ".ico",
        fallbackIconUrl
      ];
    }

    function faviconAttrs(slot) {
      const iconDomain = slot.iconDomain || slot.domain;
      const sources = slot.iconUrl ? [slot.iconUrl, ...faviconSources(iconDomain)] : faviconSources(iconDomain);
      return 'src="' + escapeHtml(sources[0]) + '" data-favicon-index="0" data-favicon-sources="' + escapeHtml(JSON.stringify(sources)) + '" onerror="advanceFavicon(this)"';
    }

    function normalizeSlot(slot = {}) {
      return {
        domain: String(slot.domain || "").trim(),
        iconDomain: String(slot.iconDomain || "").trim(),
        iconUrl: String(slot.iconUrl || "").trim(),
        tier: Math.max(0, Math.min(5, Math.floor(Number(slot.tier || 0)))),
        state: ["active", "background", "inactive"].includes(slot.state) ? slot.state : "inactive",
        incomePerSecond: Math.max(0, Number(slot.incomePerSecond || 0)),
        vaultAmount: Math.max(0, Number(slot.vaultAmount || 0)),
        vaultFull: Boolean(slot.vaultFull),
        streak: Math.max(0, Math.floor(Number(slot.streak || 0))),
        checkedToday: Boolean(slot.checkedToday)
      };
    }

    function normalizeWelcomeBack(value = {}) {
      return {
        enabled: Boolean(value.enabled),
        secondsAway: Math.max(0, Math.floor(Number(value.secondsAway || 0))),
        focus: Math.max(0, Number(value.focus || 0)),
        background: Math.max(0, Number(value.background || 0)),
        daily: Math.max(0, Number(value.daily || 0)),
        navigation: Math.max(0, Number(value.navigation || 0)),
        wake: Math.max(0, Number(value.wake || 0)),
        other: Math.max(0, Number(value.other || 0))
      };
    }

    function normalizeUpgradeShowcase(value = {}) {
      const levels = value.levels || {};
      return {
        domain: String(value.domain || "youtube.com").trim() || "youtube.com",
        levels: Object.fromEntries(activeUpgradeDefs.map((def) => [
          def.id,
          Math.max(0, Math.floor(Number(levels[def.id] || 0)))
        ]))
      };
    }

    function welcomeBackTotal(value) {
      const welcomeBack = normalizeWelcomeBack(value);
      return ["focus", "background", "daily", "navigation", "wake", "other"]
        .reduce((sum, key) => sum + welcomeBack[key], 0);
    }

    function welcomeBackModal(config) {
      const award = normalizeWelcomeBack(config.welcomeBack);
      const total = welcomeBackTotal(award);
      if (!award.enabled || award.secondsAway < 60 || total <= 0) return "";
      const categories = [
        ["FOCUS INCOME", award.focus],
        ["BACKGROUND INCOME", award.background],
        ["DAILY FIRST-OPEN", award.daily],
        ["NAVIGATION BONUS", award.navigation],
        ["WAKE BURSTS", award.wake],
        ["OTHER INCOME", award.other]
      ];
      const rows = categories
        .filter(([, value]) => value > 0)
        .map(([label, value]) => {
          const help = label === "OTHER INCOME"
            ? '<span class="help-icon" data-tooltip="Includes any positive balance gained while the popup was closed that could not be matched to focus, background, daily first-open, navigation, or wake income.">?</span>'
            : "";
          return '<div><span class="welcome-label">' + label + help + '</span><strong>' + compactMoney(value) + '</strong></div>';
        })
        .join("");
      return '<div class="modal-scrim" role="presentation">' +
        '<section class="modal-panel welcome-back-modal" role="dialog" aria-modal="true" aria-labelledby="welcomeBackTitle">' +
          '<div class="modal-kicker">WELCOME BACK</div>' +
          '<h2 id="welcomeBackTitle">CACHE ACCRUED</h2>' +
          '<p>Your active slots kept generating while the popup was closed.</p>' +
          '<div class="welcome-breakdown">' + rows +
            '<div class="welcome-total"><span>TOTAL EARNED</span><strong>' + compactMoney(total) + '</strong></div>' +
          '</div>' +
          '<div class="modal-actions single"><button class="btn btn-collect">COLLECT</button></div>' +
        '</section>' +
      '</div>';
    }

    function incomeSlots(config) {
      return config.slots.filter((slot) => slot.domain && ["active", "background"].includes(slot.state));
    }

    function slotIncomeTotal(config) {
      return incomeSlots(config).reduce((sum, slot) => sum + Number(slot.incomePerSecond || 0), 0);
    }

    function reconcileIncome(config) {
      const next = normalizeConfig(config);
      const slots = incomeSlots(next);
      if (slots.length === 0) return next;
      const delta = next.incomePerSecond - slotIncomeTotal(next);
      if (delta >= 0) {
        const perSlot = delta / slots.length;
        slots.forEach((slot) => {
          slot.incomePerSecond = Number(slot.incomePerSecond || 0) + perSlot;
        });
        return next;
      }

      let remainingReduction = Math.abs(delta);
      let adjustable = slots.filter((slot) => Number(slot.incomePerSecond || 0) > 0);
      while (remainingReduction > 0.01 && adjustable.length > 0) {
        const perSlot = remainingReduction / adjustable.length;
        let applied = 0;
        adjustable.forEach((slot) => {
          const current = Number(slot.incomePerSecond || 0);
          const reduction = Math.min(current, perSlot);
          slot.incomePerSecond = current - reduction;
          applied += reduction;
        });
        remainingReduction -= applied;
        adjustable = adjustable.filter((slot) => Number(slot.incomePerSecond || 0) > 0.01);
      }
      return next;
    }

    function normalizeConfig(config) {
      const slots = Array.isArray(config.slots) ? config.slots.map(normalizeSlot) : [];
      const slotsUnlocked = Math.max(1, Math.floor(Number(config.slotsUnlocked || slots.length || 3)));
      while (slots.length < slotsUnlocked) slots.push(normalizeSlot());
      return {
        name: String(config.name || "Marketing Screenshot"),
        screen: config.screen === "upgrades" ? "upgrades" : "slots",
        money: Math.max(0, Number(config.money || 0)),
        incomePerSecond: Math.max(0, Number(config.incomePerSecond || 0)),
        cacheCredits: Math.max(0, Number(config.cacheCredits || 0)),
        balanceIncome: config.balanceIncome !== false,
        welcomeBack: normalizeWelcomeBack(config.welcomeBack),
        upgradeShowcase: normalizeUpgradeShowcase(config.upgradeShowcase),
        slotsUnlocked,
        slots: slots.slice(0, slotsUnlocked).map(normalizeSlot)
      };
    }

    function renderSlot(slot) {
      if (!slot.domain) {
        return '<button class="slot slot-empty">+ ASSIGN DOMAIN</button>';
      }
      const state = stateLabel(slot.state);
      const tier = Number(slot.tier || 0);
      return '<button class="slot ' + tierClass(tier) + '">' +
        '<div class="slot-info">' +
          '<img class="slot-icon" ' + faviconAttrs(slot) + ' alt="">' +
          '<div>' +
            '<div class="slot-domain">' + escapeHtml(slot.domain) + ' <span class="slot-state ' + state.className + '">' + state.text + '</span></div>' +
            '<div class="slot-tier">' + slotTierLabel(tier) + ' | ' + compactMoney(slot.incomePerSecond) + '/s | VAULT ' + compactMoney(slot.vaultAmount) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="slot-badges">' +
          '<div class="slot-streak ' + (slot.checkedToday ? "active" : "inactive") + '">' +
            '<span class="slot-fire">⚡</span><span>' + slot.streak + '</span>' +
          '</div>' +
          '<div class="slot-vault-ready" ' + (slot.vaultFull ? "" : "hidden") + '>FULL</div>' +
        '</div>' +
      '</button>';
    }

    function upgradeCard(config, def) {
      const level = config.upgradeShowcase.levels[def.id];
      const cost = upgradeCost(def, level);
      const affordable = Number(config.money || 0) >= cost;
      return '<div class="upgrade-item marketing-upgrade-item">' +
        '<div class="upgrade-info" style="flex:1;">' +
          '<img class="upgrade-icon" src="' + extensionIconUrl(def.icon) + '" alt="">' +
          '<div class="upgrade-details marketing-upgrade-details"><div>' +
            '<span class="upgrade-name">' + def.name + '</span>' +
            '<span class="upgrade-level">Lvl ' + level + '</span>' +
          '</div></div>' +
        '</div>' +
        '<button class="btn btn-buy" ' + (affordable ? "" : "disabled") + '>' +
          '<span>BUY</span><span style="font-size:12px">' + compactMoney(cost) + '</span>' +
        '</button>' +
      '</div>';
    }

    function upgradesPage(config) {
      const domain = config.upgradeShowcase.domain;
      const slot = config.slots.find((item) => faviconDomain(item.domain) === faviconDomain(domain)) || { domain };
      const cards = activeUpgradeDefs.map((def) => upgradeCard(config, def)).join("");
      return '<main class="view active">' +
        '<div class="view-header">' +
          '<button class="btn btn-back">&lt; BACK</button>' +
          '<div class="detail-domain-heading">' +
            '<img class="detail-favicon" ' + faviconAttrs(slot) + ' alt="">' +
            '<span class="detail-title">' + escapeHtml(domain.toUpperCase()) + '</span>' +
            '<button class="btn btn-icon" aria-label="Open domain"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7"></path><path d="M10 14 21 3"></path><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"></path></svg></button>' +
          '</div>' +
          '<button class="btn btn-icon" aria-label="Manage Domain"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="12" cy="5" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="12" cy="19" r="2"></circle></svg></button>' +
        '</div>' +
        '<div class="detail-tabs" style="display:flex;gap:10px;margin-bottom:10px;"><button class="btn" style="flex:1;">DASHBOARD</button><button class="btn active" style="flex:1;">UPGRADES</button></div>' +
        '<div class="upgrade-toolbar" style="display:flex;align-items:stretch;gap:10px;margin-bottom:10px;">' +
          '<div class="upgrade-tabs" style="display:flex;gap:4px;flex:1;"><button class="btn active" style="flex:1;padding:6px 0;font-size:14px;">ACTIVE</button><button class="btn" style="flex:1;padding:6px 0;font-size:14px;">BACKGROUND</button><button class="btn" style="flex:1;padding:6px 0;font-size:14px;">VAULT</button></div>' +
          '<div style="width:1px;background:var(--primary);opacity:0.3;margin:4px 0;"></div>' +
          '<button class="btn" style="padding:6px;font-size:14px;min-width:64px;flex-shrink:0;">BUY 1</button>' +
        '</div>' +
        '<div class="upgrade-list">' + cards + '</div>' +
      '</main>';
    }

    function slotsPage(config) {
      const slots = config.slots.map(renderSlot).join("");
      const nextSlotNumber = config.slotsUnlocked + 1;
      const nextSlotCost = slotUnlockCost(nextSlotNumber);
      const canAffordNextSlot = Number(config.money || 0) >= nextSlotCost;
      const unlockSlot = nextSlotCost > 0
        ? '<button class="btn btn-unlock" ' + (canAffordNextSlot ? "" : "disabled") + '>UNLOCK SLOT ' + nextSlotNumber + ' (' + compactMoney(nextSlotCost) + ')</button>'
        : "";
      return '<main class="view active"><div class="slots-header">DOMAIN SLOTS</div><div class="slots-grid">' + slots + '</div>' + unlockSlot + '</main>';
    }

    function popupDocument(config) {
      const page = config.screen === "upgrades" ? upgradesPage(config) : slotsPage(config);
      const welcomeModal = welcomeBackModal(config);
      return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
        '<base href="' + popupCssUrl.replace(/popup\\.css$/, "") + '">' +
        '<link rel="stylesheet" href="' + fontsCssUrl + '">' +
        '<link rel="stylesheet" href="' + popupCssUrl + '">' +
        '<style>button{pointer-events:none}.slot:hover{transform:none}.slot-vault-ready{animation:none}.slot-icon,.detail-favicon{image-rendering:auto;border-radius:4px}.marketing-upgrade-details{align-items:flex-start;justify-content:center;text-align:left}.marketing-upgrade-details>div{display:flex;align-items:center;justify-content:flex-start;gap:8px;width:100%}.app-container{height:100%}</style>' +
        '</head><body>' +
        '<div class="scanlines"></div><div id="app" class="app-container">' +
          '<header class="header">' +
            '<div class="balance-container">' +
              '<div class="balance-row"><div class="balance">' + compactMoney(config.money) + '</div><div class="collect-burst" hidden></div></div>' +
              '<div class="income">+' + compactMoney(config.incomePerSecond) + '/sec</div>' +
            '</div>' +
            '<div class="header-actions">' +
              '<button class="btn btn-reset-cache">RESET</button>' +
              '<button class="prestige-currency">CC: <strong>' + compactNumber(config.cacheCredits) + '</strong></button>' +
              '<button class="settings-button">⚙</button>' +
            '</div>' +
          '</header>' +
          page +
          '<nav class="footer-nav"><button class="nav-btn active">SLOTS</button><button class="nav-btn">STORE</button><button class="nav-btn">LIBRARY</button></nav>' +
          welcomeModal +
        '</div><script>function advanceFavicon(img){try{var sources=JSON.parse(img.dataset.faviconSources||"[]");var next=Number(img.dataset.faviconIndex||0)+1;if(next<sources.length){img.dataset.faviconIndex=String(next);img.src=sources[next];return;}}catch{}img.onerror=null;img.src=' + JSON.stringify(fallbackIconUrl) + ';}<\\/script></body></html>';
    }

    function renderPreview() {
      document.getElementById("previewFrame").srcdoc = popupDocument(currentConfig);
      updateIncomeGuard();
    }

    function waitForPreviewImages(timeoutMs = 1800) {
      const frame = document.getElementById("previewFrame");
      const started = Date.now();
      return new Promise((resolve) => {
        function ready() {
          const doc = frame.contentDocument;
          if (!doc) return false;
          const images = [...doc.querySelectorAll("img")];
          return images.every((image) => image.complete && image.naturalWidth > 0);
        }
        function tick() {
          if (ready() || Date.now() - started >= timeoutMs) {
            resolve(true);
            return;
          }
          setTimeout(tick, 50);
        }
        frame.addEventListener("load", tick, { once: true });
        tick();
      });
    }

    window.setMarketingVideoSecond = (second) => new Promise((resolve) => {
      const elapsed = Math.max(0, Number(second || 0));
      currentConfig.money = videoBaseMoney + videoIncomePerSecond * elapsed;
      renderPreview();
      requestAnimationFrame(() => {
        waitForPreviewImages().then(() => resolve(true));
      });
    });

    function writeForm() {
      document.getElementById("screenInput").value = currentConfig.screen;
      document.getElementById("moneyInput").value = currentConfig.money;
      document.getElementById("incomeInput").value = currentConfig.incomePerSecond;
      document.getElementById("ccInput").value = currentConfig.cacheCredits;
      document.getElementById("slotsUnlockedInput").value = currentConfig.slotsUnlocked;
      document.getElementById("autoBalanceInput").checked = currentConfig.balanceIncome !== false;
      document.getElementById("welcomeEnabledInput").checked = currentConfig.welcomeBack.enabled;
      document.getElementById("welcomeSecondsInput").value = currentConfig.welcomeBack.secondsAway;
      document.getElementById("welcomeFocusInput").value = currentConfig.welcomeBack.focus;
      document.getElementById("welcomeBackgroundInput").value = currentConfig.welcomeBack.background;
      document.getElementById("welcomeDailyInput").value = currentConfig.welcomeBack.daily;
      document.getElementById("welcomeNavigationInput").value = currentConfig.welcomeBack.navigation;
      document.getElementById("welcomeWakeInput").value = currentConfig.welcomeBack.wake;
      document.getElementById("welcomeOtherInput").value = currentConfig.welcomeBack.other;
      document.getElementById("welcomeTotalPreview").textContent = "Total earned: " + compactMoney(welcomeBackTotal(currentConfig.welcomeBack));
      document.getElementById("upgradeDomainInput").value = currentConfig.upgradeShowcase.domain;
      document.getElementById("trafficEngineLevelInput").value = currentConfig.upgradeShowcase.levels.trafficEngine;
      document.getElementById("tabMultiplierLevelInput").value = currentConfig.upgradeShowcase.levels.tabMultiplier;
      document.getElementById("focusBonusLevelInput").value = currentConfig.upgradeShowcase.levels.focusBonus;
      document.getElementById("navigationBonusLevelInput").value = currentConfig.upgradeShowcase.levels.navigationBonus;
      document.getElementById("slotsInput").value = JSON.stringify(currentConfig.slots, null, 2);
    }

    function readForm() {
      const slots = JSON.parse(document.getElementById("slotsInput").value || "[]");
      return normalizeConfig({
        ...currentConfig,
        screen: document.getElementById("screenInput").value,
        money: document.getElementById("moneyInput").value,
        incomePerSecond: document.getElementById("incomeInput").value,
        cacheCredits: document.getElementById("ccInput").value,
        slotsUnlocked: document.getElementById("slotsUnlockedInput").value,
        balanceIncome: document.getElementById("autoBalanceInput").checked,
        welcomeBack: {
          enabled: document.getElementById("welcomeEnabledInput").checked,
          secondsAway: document.getElementById("welcomeSecondsInput").value,
          focus: document.getElementById("welcomeFocusInput").value,
          background: document.getElementById("welcomeBackgroundInput").value,
          daily: document.getElementById("welcomeDailyInput").value,
          navigation: document.getElementById("welcomeNavigationInput").value,
          wake: document.getElementById("welcomeWakeInput").value,
          other: document.getElementById("welcomeOtherInput").value
        },
        upgradeShowcase: {
          domain: document.getElementById("upgradeDomainInput").value,
          levels: {
            trafficEngine: document.getElementById("trafficEngineLevelInput").value,
            tabMultiplier: document.getElementById("tabMultiplierLevelInput").value,
            focusBonus: document.getElementById("focusBonusLevelInput").value,
            navigationBonus: document.getElementById("navigationBonusLevelInput").value
          }
        },
        slots
      });
    }

    function setStatus(message) {
      document.getElementById("status").textContent = message;
    }

    function updateIncomeGuard() {
      const guard = document.getElementById("incomeGuard");
      const total = slotIncomeTotal(currentConfig);
      const diff = currentConfig.incomePerSecond - total;
      const earners = incomeSlots(currentConfig).length;
      const closeEnough = Math.abs(diff) < 0.01;
      guard.className = "income-guard " + (closeEnough ? "ok" : "warn");
      if (closeEnough) {
        guard.textContent = "Slot rates match top income: " + compactMoney(total) + "/sec.";
        return;
      }
      if (earners === 0) {
        guard.textContent = "Top income differs by " + compactMoney(diff) + "/sec, but there are no active/background domains to adjust.";
        return;
      }
      const direction = diff > 0 ? "missing" : "over by";
      guard.textContent = "Slot rates are " + direction + " " + compactMoney(Math.abs(diff)) + "/sec across " + earners + " earning domains.";
    }

    function applyForm() {
      try {
        currentConfig = readForm();
        if (currentConfig.balanceIncome) currentConfig = reconcileIncome(currentConfig);
        writeForm();
        renderPreview();
        setStatus("Preview updated.");
      } catch (error) {
        setStatus("Could not parse Slots JSON: " + error.message);
      }
    }

    document.getElementById("applyButton").addEventListener("click", applyForm);
    document.getElementById("balanceButton").addEventListener("click", () => {
      try {
        currentConfig = reconcileIncome(readForm());
        currentConfig.balanceIncome = true;
        writeForm();
        renderPreview();
        setStatus("Distributed the rate difference across active/background domains.");
      } catch (error) {
        setStatus("Could not balance Slots JSON: " + error.message);
      }
    });
    document.getElementById("copyButton").addEventListener("click", async () => {
      const text = JSON.stringify(currentConfig, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        setStatus("Config copied.");
      } catch {
        setStatus(text);
      }
    });
    document.getElementById("presetSelect").addEventListener("change", (event) => {
      const preset = presets[event.target.value];
      if (!preset) return;
      currentConfig = normalizeConfig(preset);
      if (currentConfig.balanceIncome) currentConfig = reconcileIncome(currentConfig);
      writeForm();
      renderPreview();
      setStatus("Loaded " + currentConfig.name + ".");
    });

    writeForm();
    renderPreview();
  </script>
</body>
</html>`;
}

function builtInPresets() {
  return {
    early: {
      name: "Early Game",
      money: 276920,
      incomePerSecond: 2583,
      cacheCredits: 0,
      slotsUnlocked: 4,
      slots: [
        { domain: "youtube.com", tier: 0, state: "active", incomePerSecond: 2010, vaultAmount: 65400, vaultFull: true, streak: 3, checkedToday: true },
        { domain: "gmail.com", iconDomain: "mail.google.com", tier: 0, state: "background", incomePerSecond: 573, vaultAmount: 12400, vaultFull: false, streak: 2, checkedToday: true },
        { domain: "reddit.com", tier: 0, state: "inactive", incomePerSecond: 0, vaultAmount: 90, vaultFull: false, streak: 1, checkedToday: false },
        { domain: "claude.ai", tier: 0, state: "inactive", incomePerSecond: 0, vaultAmount: 0, vaultFull: false, streak: 0, checkedToday: false }
      ]
    },
    mid: {
      name: "Mid Game",
      money: 5280000,
      incomePerSecond: 8460,
      cacheCredits: 38,
      slotsUnlocked: 6,
      slots: [
        { domain: "youtube.com", tier: 2, state: "active", incomePerSecond: 4100, vaultAmount: 124000, vaultFull: true, streak: 9, checkedToday: true },
        { domain: "claude.ai", tier: 1, state: "background", incomePerSecond: 1880, vaultAmount: 82400, vaultFull: false, streak: 7, checkedToday: true },
        { domain: "reddit.com", tier: 0, state: "background", incomePerSecond: 980, vaultAmount: 64100, vaultFull: true, streak: 4, checkedToday: false },
        { domain: "docs.google.com", tier: 0, state: "inactive", incomePerSecond: 0, vaultAmount: 22600, vaultFull: false, streak: 5, checkedToday: false },
        { domain: "notion.so", tier: 0, state: "inactive", incomePerSecond: 0, vaultAmount: 18400, vaultFull: false, streak: 2, checkedToday: true },
        { domain: "", tier: 0, state: "inactive", incomePerSecond: 0, vaultAmount: 0, vaultFull: false, streak: 0, checkedToday: false }
      ]
    },
    late: {
      name: "Late Game",
      money: 1840000000000,
      incomePerSecond: 925000000,
      cacheCredits: 14820,
      slotsUnlocked: 8,
      slots: [
        { domain: "youtube.com", tier: 5, state: "active", incomePerSecond: 420000000, vaultAmount: 68000000000, vaultFull: true, streak: 14, checkedToday: true },
        { domain: "claude.ai", tier: 4, state: "background", incomePerSecond: 212000000, vaultAmount: 43000000000, vaultFull: true, streak: 12, checkedToday: true },
        { domain: "reddit.com", tier: 3, state: "background", incomePerSecond: 128000000, vaultAmount: 29000000000, vaultFull: false, streak: 8, checkedToday: false },
        { domain: "docs.google.com", tier: 2, state: "inactive", incomePerSecond: 0, vaultAmount: 12000000000, vaultFull: false, streak: 10, checkedToday: true },
        { domain: "notion.so", tier: 1, state: "background", incomePerSecond: 87000000, vaultAmount: 18000000000, vaultFull: true, streak: 6, checkedToday: false },
        { domain: "openai.com", tier: 1, state: "inactive", incomePerSecond: 0, vaultAmount: 7600000000, vaultFull: false, streak: 4, checkedToday: false },
        { domain: "figma.com", tier: 0, state: "background", incomePerSecond: 78000000, vaultAmount: 9200000000, vaultFull: false, streak: 3, checkedToday: true },
        { domain: "spotify.com", tier: 0, state: "inactive", incomePerSecond: 0, vaultAmount: 3100000000, vaultFull: false, streak: 2, checkedToday: false }
      ]
    },
    prestige: {
      name: "Prestige Showcase",
      money: 4280000000000000,
      incomePerSecond: 6200000000,
      cacheCredits: 245000,
      slotsUnlocked: 9,
      slots: [
        { domain: "youtube.com", tier: 5, state: "active", incomePerSecond: 2600000000, vaultAmount: 420000000000, vaultFull: true, streak: 28, checkedToday: true },
        { domain: "claude.ai", tier: 5, state: "background", incomePerSecond: 1480000000, vaultAmount: 280000000000, vaultFull: true, streak: 21, checkedToday: true },
        { domain: "openai.com", tier: 4, state: "background", incomePerSecond: 920000000, vaultAmount: 164000000000, vaultFull: false, streak: 18, checkedToday: false },
        { domain: "docs.google.com", tier: 3, state: "inactive", incomePerSecond: 0, vaultAmount: 97000000000, vaultFull: false, streak: 16, checkedToday: true },
        { domain: "notion.so", tier: 3, state: "background", incomePerSecond: 610000000, vaultAmount: 118000000000, vaultFull: true, streak: 13, checkedToday: false },
        { domain: "figma.com", tier: 2, state: "inactive", incomePerSecond: 0, vaultAmount: 54000000000, vaultFull: false, streak: 11, checkedToday: true },
        { domain: "spotify.com", tier: 1, state: "background", incomePerSecond: 420000000, vaultAmount: 76000000000, vaultFull: false, streak: 8, checkedToday: false },
        { domain: "twitch.tv", tier: 1, state: "inactive", incomePerSecond: 0, vaultAmount: 33000000000, vaultFull: false, streak: 5, checkedToday: false },
        { domain: "", tier: 0, state: "inactive", incomePerSecond: 0, vaultAmount: 0, vaultFull: false, streak: 0, checkedToday: false }
      ]
    },
    slotShowcase: {
      name: "Slot Showcase",
      money: 4280000000000000,
      incomePerSecond: 3485250583,
      cacheCredits: 245000,
      slotsUnlocked: 6,
      balanceIncome: false,
      slots: [
        { domain: "youtube.com", tier: 0, state: "active", incomePerSecond: 2583, vaultAmount: 65400, vaultFull: false, streak: 3, checkedToday: true },
        { domain: "youtube.com", tier: 1, state: "active", incomePerSecond: 48000, vaultAmount: 920000, vaultFull: false, streak: 7, checkedToday: true },
        { domain: "youtube.com", tier: 2, state: "active", incomePerSecond: 1200000, vaultAmount: 24000000, vaultFull: false, streak: 14, checkedToday: true },
        { domain: "youtube.com", tier: 3, state: "active", incomePerSecond: 64000000, vaultAmount: 1800000000, vaultFull: false, streak: 21, checkedToday: true },
        { domain: "youtube.com", tier: 4, state: "active", incomePerSecond: 820000000, vaultAmount: 54000000000, vaultFull: false, streak: 25, checkedToday: true },
        { domain: "youtube.com", tier: 5, state: "active", incomePerSecond: 2600000000, vaultAmount: 420000000000, vaultFull: false, streak: 28, checkedToday: true }
      ]
    },
    welcomeBack: {
      name: "Welcome Back",
      money: 1840000,
      incomePerSecond: 842,
      cacheCredits: 12,
      slotsUnlocked: 4,
      welcomeBack: {
        enabled: true,
        secondsAway: 28800,
        focus: 245000,
        background: 182000,
        daily: 96000,
        navigation: 32000,
        wake: 75000,
        other: 15000
      },
      slots: [
        { domain: "youtube.com", tier: 1, state: "active", incomePerSecond: 512, vaultAmount: 184000, vaultFull: false, streak: 8, checkedToday: true },
        { domain: "claude.ai", tier: 0, state: "background", incomePerSecond: 210, vaultAmount: 92000, vaultFull: false, streak: 5, checkedToday: true },
        { domain: "reddit.com", tier: 0, state: "background", incomePerSecond: 120, vaultAmount: 46000, vaultFull: false, streak: 3, checkedToday: false },
        { domain: "gmail.com", tier: 0, state: "inactive", incomePerSecond: 0, vaultAmount: 18000, vaultFull: false, streak: 2, checkedToday: false }
      ]
    },
    upgradeShowcase: {
      name: "Upgrade Showcase",
      screen: "upgrades",
      money: 85000,
      incomePerSecond: 42800,
      cacheCredits: 12,
      slotsUnlocked: 4,
      upgradeShowcase: {
        domain: "youtube.com",
        levels: {
          trafficEngine: 28,
          tabMultiplier: 18,
          focusBonus: 24,
          navigationBonus: 12
        }
      },
      slots: [
        { domain: "youtube.com", tier: 2, state: "active", incomePerSecond: 42800, vaultAmount: 1240000, vaultFull: false, streak: 12, checkedToday: true },
        { domain: "claude.ai", tier: 1, state: "inactive", incomePerSecond: 0, vaultAmount: 420000, vaultFull: false, streak: 7, checkedToday: true },
        { domain: "reddit.com", tier: 0, state: "inactive", incomePerSecond: 0, vaultAmount: 180000, vaultFull: false, streak: 4, checkedToday: false },
        { domain: "", tier: 0, state: "inactive", incomePerSecond: 0, vaultAmount: 0, vaultFull: false, streak: 0, checkedToday: false }
      ]
    }
  };
}
