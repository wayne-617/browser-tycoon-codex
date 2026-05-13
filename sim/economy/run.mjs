#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readEconomyDefaults } from "./economy-reader.mjs";
import { simulateEconomy } from "./simulator.mjs";
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

function compact(value) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) < 1000) return value.toFixed(2);
  const suffixes = ["", "K", "M", "B", "T", "Qa", "Qi"];
  let amount = value;
  let index = 0;
  while (Math.abs(amount) >= 1000 && index < suffixes.length - 1) {
    amount /= 1000;
    index += 1;
  }
  return `${amount.toFixed(2)}${suffixes[index]}`;
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
    balance: row.balance,
    totalLifetimeEarned: row.totalLifetimeEarned,
    totalSpent: row.totalSpent,
    slots: row.slots,
    redeemablePrestige: row.redeemablePrestige,
    vaultStored: row.vaultStored,
    focusIncome: row.income.focus,
    backgroundIncome: row.income.background,
    vaultAccrued: row.income.vaultAccrued,
    vaultClaimed: row.income.vaultClaimed,
    dailyBonus: row.income.dailyBonus,
    windfall: row.income.windfall,
    navigation: row.income.navigation,
    wake: row.income.wake
  }));
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
  console.log(`Report: ${path.join(outputDir, "latest.html")}`);

  console.log("\nSlot unlocks");
  for (const unlock of result.slotUnlocks) {
    console.log(`  Slot ${unlock.slot}: day ${unlock.day.toFixed(2)} ($${compact(unlock.cost)})`);
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

  const options = {
    days: numberArg(args, "days", 100),
    focusMinutesPerDay: numberArg(args, "focus-minutes", 120),
    backgroundMinutesPerOtherSlotPerDay: numberArg(args, "background-minutes", 15),
    vaultClaimsPerDay: numberArg(args, "vault-claims-per-day", 2),
    startingSlots: numberArg(args, "starting-slots", 3),
    includeDailyBonus: !boolArg(args, "no-daily-bonus", false),
    enableNavigationBonus: boolArg(args, "enable-navigation", false),
    navigationEventsPerFocusedHour: numberArg(args, "navigation-events-per-focused-hour", 0),
    enableWakeBonus: boolArg(args, "enable-wake", false),
    wakeEventsPerDomainPerDay: numberArg(args, "wake-events-per-domain-day", 0),
    slotTier: numberArg(args, "slot-tier", 0)
  };

  const result = simulateEconomy(economy, options);
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

