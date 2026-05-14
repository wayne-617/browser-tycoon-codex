#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readEconomyDefaults } from "./economy-reader.mjs";
import { DEFAULT_SIM_OPTIONS, simulateEconomy } from "./simulator.mjs";
import { renderReport } from "./report-template.mjs";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function numberArg(args, name, fallback) {
  if (!(name in args)) return fallback;
  const value = Number(args[name]);
  return Number.isFinite(value) ? value : fallback;
}

function boolArg(args, name, fallback = false) {
  if (!(name in args)) return fallback;
  if (args[name] === true) return true;
  return !["false", "0", "no"].includes(String(args[name]).toLowerCase());
}

function dayListArg(args, name, fallback = []) {
  if (!(name in args)) return fallback;
  return String(args[name])
    .split(/[,\s]+/)
    .map((value) => Math.floor(Number(value)))
    .filter((value) => Number.isFinite(value));
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

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))
  ].join("\n");
}

function dailyRows(result) {
  return result.daily.map((row) => ({
    day: row.day,
    run: row.run,
    runDay: row.runDay,
    balance: row.balance,
    totalLifetimeEarned: row.totalLifetimeEarned,
    totalSpent: row.totalSpent,
    slots: row.slots,
    redeemablePrestige: row.redeemablePrestige,
    lifetimePrestige: row.lifetimePrestige,
    claimedPrestige: row.claimedPrestige,
    cachePoints: row.cachePoints,
    cacheCoreLevel: row.cacheCoreLevel,
    cacheCoreMultiplier: row.cacheCoreMultiplier,
    prestigeCount: row.prestigeCount,
    prestigeAward: row.prestigeAward,
    vaultStored: row.vaultStored,
    focusIncome: row.income.focus,
    backgroundIncome: row.income.background,
    vaultAccrued: row.income.vaultAccrued,
    vaultClaimed: row.income.vaultClaimed,
    dailyBonus: row.income.dailyBonus,
    navigation: row.income.navigation,
    wake: row.income.wake
  }));
}

function noResetConfig(config) {
  return {
    ...config,
    prestigeMode: false,
    prestigeResets: 0,
    prestigeResetDays: []
  };
}

function attachNoResetComparison(result) {
  if (!result.config?.prestigeMode || !result.prestigeEvents?.length) return result;
  const baseline = simulateEconomy(result.economy, noResetConfig(result.config));
  result.noResetComparison = {
    noReset: {
      config: baseline.config,
      final: baseline.final,
      daily: baseline.daily,
      slotUnlocks: baseline.slotUnlocks
    }
  };
  return result;
}

function printSummary(result, outputDir) {
  const final = result.final;
  console.log("\nBrowser Tycoon economy simulation");
  console.log("--------------------------------");
  console.log(`Days simulated: ${result.config.days}`);
  console.log(`Final balance: $${compact(final.balance)}`);
  console.log(`Lifetime earned: $${compact(final.totalLifetimeEarned)}`);
  console.log(`Unlocked slots: ${final.slots}`);
  console.log(`Redeemable CP: ${final.redeemablePrestige}`);
  console.log(`Lifetime prestige: ${final.lifetimePrestige ?? final.redeemablePrestige}`);
  console.log(`Claimed prestige: ${final.claimedPrestige || 0}`);
  console.log(`Cache points: ${final.cachePoints || 0}`);
  console.log(`Cache Core: level ${final.cacheCoreLevel || 0} (x${(final.cacheCoreMultiplier || 1).toFixed(2)})`);
  console.log(`Prestige resets: ${final.prestigeCount || 0}`);
  console.log(`Report: ${path.join(outputDir, "latest.html")}`);

  console.log("\nSlot unlocks");
  for (const unlock of result.slotUnlocks) {
    console.log(`  Slot ${unlock.slot}: day ${unlock.day.toFixed(2)} ($${compact(unlock.cost)})`);
  }

  if (result.prestigeEvents?.length) {
    console.log("\nPrestige resets");
    for (const event of result.prestigeEvents) {
      console.log(`  Day ${event.day}: +${event.award} CP, Cache Core L${event.cacheCoreLevel || 0}, slots ${event.slotsBefore}->${event.slotsAfter}, purchases ${event.purchases.length}`);
    }
  }

  if (result.warnings?.length) {
    console.log("\nSimulation warnings");
    for (const warning of result.warnings.slice(0, 10)) {
      console.log(`  Day ${Number(warning.day || 0).toFixed(2)}: ${warning.message}`);
    }
  }

  console.log("\nPrestige milestones");
  for (const target of [1, 3, 5, 8]) {
    const hit = result.daily.find((row) => row.redeemablePrestige >= target);
    console.log(`  ${target} CP: ${hit ? `day ${hit.day}` : "not reached"}`);
  }

  console.log("\nHighest upgrade levels");
  for (const [id, level] of Object.entries(final.highestUpgradeLevels)) {
    console.log(`  ${id}: ${level}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const economy = await readEconomyDefaults(args["background"] || path.resolve("v1", "background.js"));

  economy.baseRate = numberArg(args, "base-rate", economy.baseRate);
  economy.vaultRate = numberArg(args, "vault-rate", economy.vaultRate);
  economy.trafficEngineMultiplier = numberArg(args, "traffic-multiplier", economy.trafficEngineMultiplier);
  economy.prestigeDivisor = numberArg(args, "prestige-divisor", economy.prestigeDivisor);
  economy.slotPrestigeCostScale = numberArg(args, "slot-prestige-cost-scale", economy.slotPrestigeCostScale || 1);
  economy.cacheCoreMultiplierBase = numberArg(args, "cache-core-multiplier", economy.cacheCoreMultiplierBase || 1.5);
  economy.cacheCoreBaseCost = numberArg(args, "cache-core-base-cost", economy.cacheCoreBaseCost || 5);
  economy.cacheCoreCostGrowth = numberArg(args, "cache-core-cost-growth", economy.cacheCoreCostGrowth || 1.5);
  economy.coldStorageMultiplier = numberArg(args, "cold-storage-multiplier", economy.coldStorageMultiplier || 1.32);

  const navigationEventsPerFocusedHour = numberArg(args, "navigation-events-per-focused-hour", DEFAULT_SIM_OPTIONS.navigationEventsPerFocusedHour);
  const wakeEventsPerDomainPerDay = numberArg(args, "wake-events-per-domain-day", DEFAULT_SIM_OPTIONS.wakeEventsPerDomainPerDay);

  const options = {
    days: numberArg(args, "days", DEFAULT_SIM_OPTIONS.days),
    focusMinutesPerDay: numberArg(args, "focus-minutes", DEFAULT_SIM_OPTIONS.focusMinutesPerDay),
    backgroundMinutesPerOtherSlotPerDay: numberArg(args, "background-minutes", DEFAULT_SIM_OPTIONS.backgroundMinutesPerOtherSlotPerDay),
    vaultClaimsPerDay: numberArg(args, "vault-claims-per-day", DEFAULT_SIM_OPTIONS.vaultClaimsPerDay),
    startingSlots: numberArg(args, "starting-slots", DEFAULT_SIM_OPTIONS.startingSlots),
    includeDailyBonus: !boolArg(args, "no-daily-bonus", false),
    enableNavigationBonus: boolArg(args, "enable-navigation", DEFAULT_SIM_OPTIONS.enableNavigationBonus) || navigationEventsPerFocusedHour > 0,
    navigationEventsPerFocusedHour,
    enableWakeBonus: boolArg(args, "enable-wake", DEFAULT_SIM_OPTIONS.enableWakeBonus) || wakeEventsPerDomainPerDay > 0,
    wakeEventsPerDomainPerDay,
    slotTier: numberArg(args, "slot-tier", DEFAULT_SIM_OPTIONS.slotTier),
    prestigeMode: boolArg(args, "prestige-mode", DEFAULT_SIM_OPTIONS.prestigeMode),
    prestigeResets: numberArg(args, "prestige-resets", DEFAULT_SIM_OPTIONS.prestigeResets),
    prestigeResetDays: dayListArg(args, "prestige-reset-days", DEFAULT_SIM_OPTIONS.prestigeResetDays)
  };

  const result = attachNoResetComparison(simulateEconomy(economy, options));
  const outputDir = path.resolve(args["output-dir"] || path.join("sim", "economy", "output"));
  await mkdir(outputDir, { recursive: true });

  await writeFile(path.join(outputDir, "latest.json"), JSON.stringify(result, null, 2));
  await writeFile(path.join(outputDir, "daily.csv"), toCsv(dailyRows(result)));
  await writeFile(path.join(outputDir, "slot-unlocks.csv"), toCsv(result.slotUnlocks));
  await writeFile(path.join(outputDir, "latest.html"), renderReport(result));

  printSummary(result, outputDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
