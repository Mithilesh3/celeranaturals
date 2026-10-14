/**
 * Minimal Chrome DevTools Protocol driver.
 *
 * Zero dependencies: it launches the Chrome already installed on this machine
 * and talks to it over Node's built-in WebSocket. That is deliberate — a real
 * browser gives real layout measurements and real screenshots, and adding
 * Playwright just to resize a viewport would be a heavy dependency for this
 * repo (which currently has four runtime packages).
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];

export function findBrowser() {
  const { existsSync } = require("node:fs");
  return CHROME_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function launch({ port = 9400 + Math.floor(Math.random() * 400) } = {}) {
  const { existsSync } = await import("node:fs");
  const binary = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!binary) throw new Error("No Chrome or Edge binary found");

  const profile = mkdtempSync(path.join(tmpdir(), "cdp-profile-"));
  const child = spawn(binary, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "about:blank",
  ], { stdio: "ignore", detached: false });

  // Wait for the debugging endpoint to answer.
  let wsUrl = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const data = await res.json();
      wsUrl = data.webSocketDebuggerUrl;
      if (wsUrl) break;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  if (!wsUrl) { child.kill(); throw new Error("Chrome did not expose a debugging endpoint"); }

  return { child, wsUrl, port, binary };
}

/** A CDP connection with flat-session routing. */
export class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        message.error ? reject(new Error(`${message.error.message}`)) : resolve(message.result);
        return;
      }
      if (message.method) {
        for (const handler of this.listeners.get(message.method) ?? []) handler(message.params, message.sessionId);
      }
    });
  }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", () => reject(new Error("CDP socket failed")), { once: true });
    });
    return new Cdp(ws);
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(handler);
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }
      }, 20000);
    });
  }

  close() { try { this.ws.close(); } catch { /* already closed */ } }
}

/**
 * Connects straight to the page target's own debugger socket.
 *
 * Simpler and more reliable than Target.createTarget + flat sessions: commands
 * need no sessionId, so there is no session routing to get wrong.
 */
export async function pageConnection(port) {
  let pageUrl = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await res.json();
    const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    if (page) { pageUrl = page.webSocketDebuggerUrl; break; }
    await sleep(250);
  }
  if (!pageUrl) throw new Error("No page target available");

  const cdp = await Cdp.connect(pageUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Log.enable");
  return cdp;
}

export const setViewport = (cdp, sessionId, width, height, mobile = false) =>
  cdp.send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile,
    screenWidth: width, screenHeight: height,
  }, sessionId);

export async function goto(cdp, sessionId, url, { waitMs = 900 } = {}) {
  const loaded = new Promise((resolve) => {
    const handler = (_params, session) => { if (session === sessionId) resolve(); };
    cdp.on("Page.loadEventFired", handler);
    setTimeout(resolve, 15000);
  });
  await cdp.send("Page.navigate", { url }, sessionId);
  await loaded;
  // Settle: hydration, fonts, lazy images.
  await sleep(waitMs);
}

export async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true,
  }, sessionId);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? "evaluate failed");
  }
  return result.result.value;
}

export async function screenshot(cdp, sessionId, file) {
  const { writeFileSync } = await import("node:fs");
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  writeFileSync(file, Buffer.from(data, "base64"));
  return file;
}

export { sleep };
