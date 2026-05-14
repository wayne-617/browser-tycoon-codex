import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_BACKGROUND_PATH = path.resolve("v1", "background.js");

function numberConst(source, name, fallback) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`));
  if (!match) return fallback;
  const expression = match[1].trim();
  if (/^-?\d+(?:\.\d+)?$/.test(expression)) return Number(expression);
  const baseRateMultiplier = expression.match(/^BASE_RATE\s*\*\s*(-?\d+(?:\.\d+)?)$/);
  if (baseRateMultiplier) {
    return numberConst(source, "BASE_RATE", 0.1) * Number(baseRateMultiplier[1]);
  }
  return fallback;
}

function arrayConst(source, name, fallback) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*(?:Object\\.freeze\\()?\\s*(\\[[\\s\\S]*?\\])\\s*\\)?;`));
  if (!match) return fallback;
  try {
    return Function(`"use strict"; return (${match[1]});`)();
  } catch {
    return fallback;
  }
}

async function readMathSource(backgroundPath, backgroundSource) {
  const importMatch = backgroundSource.match(/importScripts\(["']([^"']*game-math\.js)["']\)/);
  if (!importMatch) return backgroundSource;
  const mathPath = path.resolve(path.dirname(backgroundPath), importMatch[1]);
  try {
    return await readFile(mathPath, "utf8");
  } catch {
    return backgroundSource;
  }
}

export async function readEconomyDefaults(backgroundPath = DEFAULT_BACKGROUND_PATH) {
  const backgroundSource = await readFile(backgroundPath, "utf8");
  const source = await readMathSource(backgroundPath, backgroundSource);
  const baseRate = numberConst(source, "BASE_RATE", 0.1);

  return {
    source: backgroundPath,
    baseRate,
    vaultRate: numberConst(source, "VAULT_RATE", baseRate * 0.5),
    trafficEngineMultiplier: numberConst(source, "TRAFFIC_ENGINE_MULTIPLIER", 1.18),
    prestigeDivisor: numberConst(source, "PRESTIGE_DIVISOR", 1000000),
    slotPrestigeCostScale: numberConst(source, "SLOT_PRESTIGE_COST_SCALE", 1),
    cacheCoreMultiplierBase: numberConst(source, "CACHE_CORE_MULTIPLIER", 1.5),
    cacheCoreBaseCost: numberConst(source, "CACHE_CORE_BASE_COST", 5),
    cacheCoreCostGrowth: numberConst(source, "CACHE_CORE_COST_GROWTH", 2),
    coldStorageMultiplier: numberConst(source, "COLD_STORAGE_MULTIPLIER", 1.32),
    upgradeDefs: arrayConst(source, "UPGRADE_DEFS", []),
    slotTiers: arrayConst(source, "SLOT_TIERS", [{ tier: 0, cpCost: 0, bonus: 1 }])
  };
}
