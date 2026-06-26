#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderMarketingPage } from "./template.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_PRESET = path.join(__dirname, "presets", "mid-game.json");
const DEFAULT_OUTPUT_DIR = path.join(__dirname, "output");
const POPUP_WIDTH = 380;
const POPUP_HEIGHT = 580;
const DEFAULT_VIDEO_SECONDS = 3;
const VIDEO_FPS = 15;

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
  const domains = uniqueItems((config.slots || []).map((slot) => faviconDomain(slot.iconDomain || slot.domain)));

  for (const domain of domains) {
    const iconUrl = await downloadFavicon(domain, cacheDir);
    if (iconUrl) iconUrls.set(domain, iconUrl);
  }

  return {
    ...config,
    slots: (config.slots || []).map((slot) => {
      const domain = faviconDomain(slot.iconDomain || slot.domain);
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

async function waitForFile(filePath, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (existsSync(filePath)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

async function connectToCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out connecting to Chrome DevTools.")), 8000);
    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("Could not connect to Chrome DevTools."));
    }, { once: true });
  });

  let messageId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(`${message.error.message}${message.error.data ? `: ${message.error.data}` : ""}`));
      return;
    }
    resolve(message.result);
  });

  function send(method, params = {}) {
    const id = ++messageId;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error(`Chrome DevTools command timed out: ${method}`));
      }, 30000);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  return { send, close: () => socket.close() };
}

async function launchCdpBrowser(browserPath) {
  const browsers = findBrowsers(browserPath);
  if (browsers.length === 0) {
    throw new Error("Could not find Chrome or Edge. Pass --browser \"C:\\\\Path\\\\to\\\\chrome.exe\" to enable video export.");
  }

  async function closeChild(child) {
    if (!child.killed) {
      try { child.kill(); } catch {}
    }
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      delay(2000)
    ]);
  }

  async function removeProfileDir(profileDir) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await rm(profileDir, { recursive: true, force: true });
        return;
      } catch (error) {
        if (error.code !== "EBUSY" && error.code !== "EPERM") throw error;
        await delay(250 + attempt * 250);
      }
    }
  }

  const attempts = [];
  for (const browser of browsers) {
    const profileDir = await mkdtemp(path.join(tmpdir(), "browser-tycoon-video-"));
    const child = spawn(browser, [
      "--headless=new",
      "--disable-background-networking",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-gpu",
      "--disable-gpu-compositing",
      "--disable-sync",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-sandbox",
      "--remote-debugging-port=0",
      "--run-all-compositor-stages-before-draw",
      "--use-angle=swiftshader",
      `--user-data-dir=${profileDir}`,
      `--window-size=${POPUP_WIDTH},${POPUP_HEIGHT}`,
      "about:blank"
    ], {
      stdio: "ignore",
      windowsHide: true
    });

    try {
      const portFile = path.join(profileDir, "DevToolsActivePort");
      await waitForFile(portFile);
      const [port] = (await readFile(portFile, "utf8")).trim().split(/\r?\n/);
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const pageTarget = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (!pageTarget) throw new Error("Chrome did not expose a debuggable page target.");
      const client = await connectToCdp(pageTarget.webSocketDebuggerUrl);
      return {
        client,
        close: async () => {
          try { client.close(); } catch {}
          await closeChild(child);
          await removeProfileDir(profileDir);
        }
      };
    } catch (error) {
      attempts.push(`${browser}: ${error.message}`);
      await closeChild(child);
      await removeProfileDir(profileDir);
    }
  }

  throw new Error(`Could not launch Chrome or Edge for video export.\n${attempts.join("\n")}`);
}

async function waitForPageReady(client) {
  for (let index = 0; index < 80; index += 1) {
    const result = await client.send("Runtime.evaluate", {
      expression: "typeof window.setMarketingVideoSecond === 'function'",
      returnByValue: true
    });
    if (result.result?.value) return;
    await delay(100);
  }
  const debug = await client.send("Runtime.evaluate", {
    expression: "JSON.stringify({ href: location.href, title: document.title, readyState: document.readyState, hook: typeof window.setMarketingVideoSecond, body: document.body ? document.body.innerText.slice(0, 200) : '' })",
    returnByValue: true
  });
  throw new Error(`Generated marketing page did not become ready for video capture: ${debug.result?.value || "no page details"}`);
}

async function captureVideoFrames(client, htmlPath, durationSeconds) {
  const frameCount = Math.max(1, Math.ceil(durationSeconds * VIDEO_FPS));
  const frames = [];
  const url = `${pathToFileURL(htmlPath).href}?screenshot=1&video=1`;

  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    deviceScaleFactor: 1,
    mobile: false
  });
  await client.send("Page.navigate", { url });
  await waitForPageReady(client);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const second = frame / VIDEO_FPS;
    await client.send("Runtime.evaluate", {
      expression: `window.setMarketingVideoSecond(${second})`,
      awaitPromise: true,
      returnByValue: true
    });
    await delay(35);
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false
    });
    frames.push(screenshot.data);
  }

  return frames;
}

async function encodeFramesInBrowser(client, frames) {
  const expression = `
    (async ({ frames, width, height, fps }) => {
      if (!("MediaRecorder" in window)) throw new Error("MediaRecorder is unavailable in this browser.");
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : (MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm;codecs=vp8" : "video/webm");
      const stream = canvas.captureStream(fps);
      const chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      const stopped = new Promise((resolve, reject) => {
        recorder.onstop = resolve;
        recorder.onerror = () => reject(recorder.error || new Error("MediaRecorder failed."));
      });
      function drawFrame(data) {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            context.drawImage(image, 0, 0, width, height);
            resolve();
          };
          image.onerror = () => reject(new Error("Could not load captured frame."));
          image.src = "data:image/png;base64," + data;
        });
      }
      recorder.start();
      const frameMs = 1000 / fps;
      for (const frame of frames) {
        await drawFrame(frame);
        await new Promise((resolve) => setTimeout(resolve, frameMs));
      }
      recorder.stop();
      await stopped;
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: mimeType });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      const chunkSize = 0x8000;
      for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
      }
      return btoa(binary);
    })(${JSON.stringify({ frames, width: POPUP_WIDTH, height: POPUP_HEIGHT, fps: VIDEO_FPS })})
  `;
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Video encoding failed in Chrome.");
  }
  return result.result.value;
}

async function writeVideo(htmlPath, outputDir, browserPath, durationSeconds = DEFAULT_VIDEO_SECONDS) {
  const videosDir = path.join(outputDir, "videos");
  await mkdir(videosDir, { recursive: true });
  const videoPath = path.join(videosDir, `browser-tycoon-live-${timestamp()}.webm`);
  const browser = await launchCdpBrowser(browserPath);

  try {
    const frames = await captureVideoFrames(browser.client, htmlPath, durationSeconds);
    const videoBase64 = await encodeFramesInBrowser(browser.client, frames);
    await writeFile(videoPath, Buffer.from(videoBase64, "base64"));
    return videoPath;
  } finally {
    await browser.close();
  }
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

  if (args.video) {
    const durationSeconds = Math.max(0.1, Number(args["video-seconds"] || DEFAULT_VIDEO_SECONDS));
    const videoPath = await writeVideo(htmlPath, outputDir, args.browser, durationSeconds);
    console.log(`Video: ${videoPath}`);
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
