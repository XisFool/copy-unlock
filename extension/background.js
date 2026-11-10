const SCRIPT_ID = "copy-guard";
const PANEL_ID = "cell-panel";
const PANEL_HOST = "labs.cjlu.dilabs.cn";
const KEY = "sites";

async function getSites() {
  const data = await chrome.storage.local.get(KEY);
  return Array.isArray(data[KEY]) ? data[KEY] : [];
}

const patternFor = (host) => `*://${host}/*`;

async function getRegistration(host) {
  let scripts = [];
  try {
    scripts = await chrome.scripting.getRegisteredContentScripts();
  } catch (_) {}
  const guard = scripts.find((script) => script.id === SCRIPT_ID);
  const panel = scripts.find((script) => script.id === PANEL_ID);
  return {
    guard: !!guard && (guard.matches || []).includes(patternFor(host)),
    panel: host === PANEL_HOST ? !!panel && (panel.matches || []).includes(patternFor(PANEL_HOST)) : null
  };
}

async function getInjection(tabId, host) {
  if (!Number.isInteger(tabId)) return null;
  const result = { guard: false, panel: host === PANEL_HOST ? false : null };
  try {
    const [guard] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => window.__copyGuardInstalled === true
    });
    result.guard = !!guard?.result;
    if (host === PANEL_HOST) {
      const [panel] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.__cellStatusPanelInstalled === true
      });
      result.panel = !!panel?.result;
    }
  } catch (_) {}
  return result;
}

async function unregister() {
  for (const id of [SCRIPT_ID, PANEL_ID]) {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [id] });
    } catch (_) {}
  }
}

async function syncRegistration() {
  const sites = await getSites();
  const matches = [...new Set(sites.filter(Boolean).map((host) => `*://${host}/*`))];
  await unregister();
  const scripts = [];
  if (matches.length) {
    scripts.push({
      id: SCRIPT_ID,
      matches,
      js: ["guard.js"],
      css: ["guard.css"],
      runAt: "document_start",
      allFrames: true,
      matchOriginAsFallback: true,
      world: "MAIN",
      persistAcrossSessions: true
    });
  }
  if (sites.includes(PANEL_HOST)) {
    scripts.push({
      id: PANEL_ID,
      matches: [`*://${PANEL_HOST}/*`],
      js: ["panel.js"],
      runAt: "document_idle",
      persistAcrossSessions: true
    });
  }
  if (!scripts.length) return;
  try {
    await chrome.scripting.registerContentScripts(scripts);
  } catch (error) {
    console.error("[copy-guard] register failed:", error);
    throw error;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  syncRegistration().catch((error) => console.error(error));
});
chrome.runtime.onStartup.addListener(() => {
  syncRegistration().catch((error) => console.error(error));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "get-state") {
      const sites = await getSites();
      const registration = await getRegistration(message.host);
      const injected = await getInjection(message.tabId, message.host);
      sendResponse({ enabled: sites.includes(message.host), sites, registration, injected });
      return;
    }
    if (message?.type === "toggle") {
      const sites = await getSites();
      const index = sites.indexOf(message.host);
      if (index === -1) sites.push(message.host);
      else sites.splice(index, 1);
      await chrome.storage.local.set({ [KEY]: sites });
      try {
        await syncRegistration();
        sendResponse({ enabled: sites.includes(message.host), sites });
      } catch (error) {
        sendResponse({ error: String(error?.message || error) });
      }
      return;
    }
    if (message?.type === "sync") {
      try {
        await syncRegistration();
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ error: String(error?.message || error) });
      }
      return;
    }
    sendResponse({ error: "unknown message" });
  })();
  return true;
});
