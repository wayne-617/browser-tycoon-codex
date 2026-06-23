#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderMarketingPage } from "./template.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_PRESET = path.join(__dirname, "presets", "mid-game.json");
const DEFAULT_OUTPUT_DIR = path.join(__dirname, "output");
const POPUP_WIDTH = 380;
const POPUP_HEIGHT = 580;

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

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function resolveConfigPath(value) {
  if (!value) return DEFAULT_PRESET;
  const directPath = path.resolve(value);
  if (existsSync(directPath)) return directPath;
  const presetPath = path.join(__dirname, "presets", `${value}.json`);
  if (existsSync(presetPath)) return presetPath;
  return directPath;
}

async function readJson(filePath) {
  const source = await readFile(filePath, "utf8");
  return JSON.parse(source);
}

function faviconDomain(domain) {
  const cleaned = String(domain || "").trim();
  if (!cleaned) return "";
  try {
    const pageUrl = cleaned.startsWith("http://") || cleaned.startsWith("https://")
      ? new URL(cleaned)
      : new URL(`https://${cleaned}`);
    return pageUrl.hostname.replace(/^www\./, "");
  } catch {
    return cleaned.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
  }
}

function faviconSources(domain) {
  const cleaned = faviconDomain(domain);
  if (!cleaned) return [];
  const encodedDomain = encodeURIComponent(cleaned);
  const encodedPage = encodeURIComponent(`https://${cleaned}`);
  return [
    `https://${cleaned}/favicon.ico`,
    `https://www.google.com/s2/favicons?sz=64&domain_url=${encodedPage}`,
    `https://www.google.com/s2/favicons?sz=64&domain=${encodedDomain}`,
    `https://icons.duckduckgo.com/ip3/${encodedDomain}.ico`
  ];
}

function faviconFileName(domain, contentType) {
  const cleanName = faviconDomain(domain).replace(/[^a-z0-9.-]/gi, "-") || "domain";
  if (contentType.includes("svg")) return `${cleanName}.svg`;
  if (contentType.includes("png")) return `${cleanName}.png`;
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return `${cleanName}.jpg`;
  return `${cleanName}.ico`;
}

async function fetchWithTimeout(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 Browser Tycoon Marketing Screenshot Generator"
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function cachedFaviconUrl(domain, cacheDir) {
  const cleanName = faviconDomain(domain).replace(/[^a-z0-9.-]/gi, "-") || "domain";
  try {
    const files = await readdir(cacheDir);
    const cached = files.find((file) => file.startsWith(`${cleanName}.`));
    return cached ? pathToFileURL(path.join(cacheDir, cached)).href : "";
  } catch {
    return "";
  }
}

async function downloadFavicon(domain, cacheDir) {
  const cached = await cachedFaviconUrl(domain, cacheDir);
  if (cached) return cached;

  for (const source of faviconSources(domain)) {
    try {
      const response = await fetchWithTimeout(source);
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.startsWith("image/")) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 64) continue;
      const iconPath = path.join(cacheDir, faviconFileName(domain, contentType));
      await writeFile(iconPath, bytes);
      return pathToFileURL(iconPath).href;
    } catch {
      // Try the next favicon provider.
    }
  }
  return "";
}

async function hydrateFavicons(config, outputDir) {
  const cacheDir = path.join(outputDir, "favicon-cache");
  await mkdir(cacheDir, { recursive: true });
  const iconUrls = new Map();
  const domains = uniqueItems((config.slots || []).map((slot) => faviconDomain(slot.domain)));

  for (const domain of domains) {
    const iconUrl = await downloadFavicon(domain, cacheDir);
    if (iconUrl) iconUrls.set(domain, iconUrl);
  }

  return {
    ...config,
    slots: (config.slots || []).map((slot) => {
      const domain = faviconDomain(slot.domain);
      const iconUrl = iconUrls.get(domain);
      return iconUrl ? { ...slot, iconUrl } : slot;
    })
  };
}

function commandExists(command) {
  const result = spawnSync("where.exe", [command], { stdio: "ignore" });
  return result.status === 0;
}

function uniqueItems(items) {
  return [...new Set(items.filter(Boolean))];
}

function findBrowsers(explicitPath) {
  if (explicitPath) return [explicitPath];
  const candidates = [
    path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.PROGRAMFILES || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Microsoft", "Edge", "Application", "msedge.exe")
  ];
  const installed = candidates.filter((item) => item && existsSync(item));
  const pathCommands = [
    commandExists("chrome") ? "chrome" : null,
    commandExists("msedge") ? "msedge" : null,
    commandExists("google-chrome") ? "google-chrome" : null
  ];
  return uniqueItems([...installed, ...pathCommands]);
}

function openFile(filePath) {
  const child = spawn("cmd", ["/c", "start", "", filePath], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
}

async function writeScreenshot(htmlPath, outputDir, browserPath) {
  const browsers = findBrowsers(browserPath);
  if (browsers.length === 0) {
    throw new Error("Could not find Chrome or Edge. Pass --browser \"C:\\\\Path\\\\to\\\\chrome.exe\" to enable screenshots.");
  }
  const screenshotsDir = path.join(outputDir, "screenshots");
  await mkdir(screenshotsDir, { recursive: true });
  const screenshotPath = path.join(screenshotsDir, `browser-tycoon-slots-${timestamp()}.png`);
  const url = `${pathToFileURL(htmlPath).href}?screenshot=1`;

  const sharedFlags = [
    "--disable-background-networking",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-gpu",
    "--disable-gpu-compositing",
    "--disable-sync",
    "--disable-features=VizDisplayCompositor,UseSkiaRenderer",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-sandbox",
    "--run-all-compositor-stages-before-draw",
    "--use-angle=swiftshader",
    "--virtual-time-budget=5000",
    `--window-size=${POPUP_WIDTH},${POPUP_HEIGHT}`,
    `--screenshot=${screenshotPath}`,
    url
  ];
  const headlessModes = ["--headless=new", "--headless=chrome", "--headless"];
  const failures = [];

  for (const browser of browsers) {
    for (const headlessMode of headlessModes) {
      const result = spawnSync(browser, [headlessMode, ...sharedFlags], {
        encoding: "utf8",
        stdio: "pipe",
        windowsHide: true
      });
      if (result.status === 0 && existsSync(screenshotPath)) {
        return screenshotPath;
      }
      const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
      failures.push(`${browser} ${headlessMode}${detail ? `\n${detail}` : ""}`);
    }
  }

  throw new Error(`Screenshot command failed.\n${failures.at(-1) || "No browser attempts completed."}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = resolveConfigPath(args.config || args.preset);
  const outputDir = path.resolve(args["output-dir"] || DEFAULT_OUTPUT_DIR);
  const config = await readJson(configPath);
  await mkdir(outputDir, { recursive: true });

  const htmlPath = path.join(outputDir, "latest.html");
  const configOutPath = path.join(outputDir, "latest-config.json");
  const previewConfig = await hydrateFavicons(config, outputDir);
  const page = renderMarketingPage(previewConfig, {
    popupCssPath: path.join(REPO_ROOT, "v1", "popup.css"),
    fontsCssPath: path.join(REPO_ROOT, "v1", "fonts", "fonts.css"),
    fallbackIconPath: path.join(REPO_ROOT, "v1", "icons", "Icon14_01.png")
  });
  await writeFile(htmlPath, page);
  await writeFile(configOutPath, JSON.stringify(config, null, 2));

  console.log("\nBrowser Tycoon marketing screenshot generator");
  console.log("--------------------------------------------");
  console.log(`Config: ${configPath}`);
  console.log(`HTML: ${htmlPath}`);
  console.log(`Editable config: ${configOutPath}`);

  if (args.screenshot) {
    const screenshotPath = await writeScreenshot(htmlPath, outputDir, args.browser);
    console.log(`Screenshot: ${screenshotPath}`);
  }

  if (args.open) {
    openFile(htmlPath);
    console.log("Opened generated HTML.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
