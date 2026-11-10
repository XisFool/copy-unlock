const hostEl = document.getElementById("host");
const button = document.getElementById("toggle");
const repairButton = document.getElementById("repair");
const hint = document.getElementById("hint");
const autoRow = document.getElementById("autocopy-row");
const autoBox = document.getElementById("autocopy");
const autoHint = document.getElementById("autocopy-hint");
let enabled = false;
let tab = null;

autoBox.addEventListener("change", () => {
  chrome.storage.local.set({ autoCopy: autoBox.checked });
});

function render() {
  button.textContent = enabled ? "已开启，点击关闭" : "开启复制增强";
  button.classList.toggle("on", enabled);
  hint.textContent = enabled
    ? "本页已启用，注入正常。"
    : "只对当前网站生效，不影响其他站点。";
}

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = "";
  let needPanel = false;
  try {
    const url = new URL(tab?.url || "");
    if (url.protocol === "http:" || url.protocol === "https:") {
      host = url.hostname;
      needPanel = host === "labs.cjlu.dilabs.cn" && url.pathname.startsWith("/data-analysis/");
    }
  } catch (_) {}

  if (!host) {
    hostEl.textContent = "此页面不支持";
    button.disabled = true;
    button.textContent = "不可用";
    hint.textContent = "只能在 http/https 网页上使用。";
    return;
  }

  hostEl.textContent = host;
  if (host === "labs.cjlu.dilabs.cn") {
    const data = await chrome.storage.local.get("autoCopy");
    autoBox.checked = data.autoCopy !== false;
    autoRow.style.display = "flex";
    autoHint.style.display = "block";
  }
  const state = await chrome.runtime.sendMessage({ type: "get-state", host, tabId: tab?.id });
  enabled = !!state?.enabled;
  button.disabled = false;
  render();

  const registration = state?.registration;
  const injected = state?.injected;
  const guardMissing = !registration?.guard || (!!injected && injected.guard === false);
  const panelMissing = needPanel && (!registration?.panel || (!!injected && injected.panel === false));
  if (enabled && (guardMissing || panelMissing)) {
    hint.textContent = "已开启，但本页注入未生效（重载扩展后常见）。";
    repairButton.hidden = false;
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    const result = await chrome.runtime.sendMessage({ type: "toggle", host });
    if (result?.error) {
      hint.textContent = "操作失败：" + result.error;
      button.disabled = false;
      return;
    }
    enabled = !!result.enabled;
    render();
    if (tab?.id) chrome.tabs.reload(tab.id);
    window.close();
  });
}

repairButton.addEventListener("click", async () => {
  repairButton.disabled = true;
  hint.textContent = "正在重新注册…";
  const result = await chrome.runtime.sendMessage({ type: "sync" });
  if (result?.error) {
    hint.textContent = "修复失败：" + result.error;
    repairButton.disabled = false;
    return;
  }
  if (tab?.id) chrome.tabs.reload(tab.id);
  window.close();
});

init();
