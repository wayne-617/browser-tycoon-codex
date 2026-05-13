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
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\[[\\s\\S]*?\\]);`));
  if (!match) return fallback;
  try {
    return Function(`"use strict"; return (${match[1]});`)();
  } catch {
    return fallback;
  }
}

export async function readEconomyDefaults(backgroundPath = DEFAULT_BACKGROUND_PATH) {
  const source = await readFile(backgroundPath, "utf8");
  const baseRate = numberConst(source, "BASE_RATE", 0.1);

  return {
    source: backgroundPath,
    baseRate,
    vaultRate: numberConst(source, "VAULT_RATE", baseRate * 0.5),
    trafficEngineMultiplier: numberConst(source, "TRAFFIC_ENGINE_MULTIPLIER", 1.18),
    prestigeDivisor: numberConst(source, "PRESTIGE_DIVISOR", 1000000),
    upgradeDefs: arrayConst(source, "UPGRADE_DEFS", []),
    slotTiers: arrayConst(source, "SLOT_TIERS", [{ tier: 0, cpCost: 0, bonus: 1 }])
  };
}
