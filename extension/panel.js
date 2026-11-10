(() => {
  "use strict";
  if (location.hostname !== "labs.cjlu.dilabs.cn") return;
  if (!location.pathname.startsWith("/data-analysis/")) return;
  if (window.__cellStatusPanelInstalled) return;
  window.__cellStatusPanelInstalled = true;

  const AUTO_COPY_KEY = "autoCopy";
  const PANEL_POS_KEY = "panelPosition";
  const PANEL_COLLAPSED_KEY = "panelCollapsed";
  let onlyProblems = false;

  const applyAutoCopy = async () => {
    try {
      const data = await chrome.storage.local.get(AUTO_COPY_KEY);
      document.documentElement.dataset.copyGuardAutoCopy = data[AUTO_COPY_KEY] === false ? "off" : "on";
    } catch (_) {}
  };

  applyAutoCopy();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[AUTO_COPY_KEY]) applyAutoCopy();
  });

  const HOST_ID = "__cell_status_panel_host";
  const STATES = {
    idle: ["未运行", "s-idle"],
    running: ["运行中", "s-running"],
    success: ["成功", "s-success"],
    error: ["失败", "s-error"]
  };
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));

  let host = null;
  let panel = null;
  let list = null;
  let progress = null;
  let summary = null;
  let collapse = null;
  let lastSignature = "";
  let cells = [];

  const collect = () => {
    const items = [...document.querySelectorAll(".CodeMirror")].map((cm) => {
      const wrap = cm.closest(".code-cell-wrap");
      if (!wrap) return null;
      const container = cm.closest(".code-cell-container") || wrap;
      const wrapRect = wrap.getBoundingClientRect();
      const wrapStyle = getComputedStyle(wrap);
      if (wrapStyle.display === "none" || wrapStyle.visibility === "hidden" || (wrapRect.width === 0 && wrapRect.height === 0)) {
        return null;
      }
      const result = wrap.querySelector(".result-container");
      const head = container ? (container.textContent || "").slice(0, 80) : "";
      const match = head.match(/In\s*\[([^\]]*)\]/);
      const marker = match ? match[1].trim() : "";
      let state = "idle";
      if (marker === "*") {
        state = "running";
      } else {
        const count = marker === "" ? 0 : parseInt(marker, 10);
        if (Number.isFinite(count) && count > 0) {
          const text = result ? (result.textContent || "") : "";
          const errorNode = result ? result.querySelector(".output_error, .ansired") : null;
          const errorText = /Traceback \(most recent call last\)|(^|\n)\s*[A-Za-z_][\w.]*(Error|Exception):/.test(text);
          state = errorNode || errorText ? "error" : "success";
        }
      }
      return { cm, wrap, marker, state };
    }).filter(Boolean);
    return items.map((item, index) => ({ ...item, index }));
  };

  const ensurePanel = () => {
    if (host && host.isConnected) return true;
    if (!document.body) return false;

    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "position:fixed;right:16px;bottom:128px;z-index:2147483646;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        .panel {
          width: 244px;
          font: 12px/1.5 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
          color: #1f2937;
          background: rgba(255,255,255,.98);
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          box-shadow: 0 10px 28px rgba(15,23,42,.2);
          overflow: hidden;
        }
        .head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #f8fafc; cursor: grab; user-select: none; touch-action: none; }
        .head:active { cursor: grabbing; }
        .title { font-weight: 600; flex: 1; }
        .progress { color: #64748b; font-variant-numeric: tabular-nums; }
        .filter {
          border: 1px solid #e2e8f0; background: #fff; color: #64748b;
          height: 20px; padding: 0 6px; border-radius: 4px;
          cursor: pointer; font: inherit; font-size: 11px;
        }
        .filter:hover { background: #e2e8f0; color: #0f172a; }
        .filter.on { border-color: #fca5a5; background: #fef2f2; color: #b91c1c; }
        .collapse {
          border: 0; background: transparent; color: #64748b;
          width: 20px; height: 20px; border-radius: 4px;
          cursor: pointer; font: inherit; line-height: 1;
        }
        .collapse:hover { background: #e2e8f0; color: #0f172a; }
        .summary { padding: 5px 10px; color: #64748b; border-bottom: 1px solid #f1f5f9; }
        .summary .ok { color: #15803d; }
        .summary .bad { color: #b91c1c; }
        .body { max-height: 46vh; overflow: auto; padding: 4px; }
        .row {
          display: flex; align-items: center; gap: 6px; width: 100%;
          padding: 4px 6px; border: 0; background: transparent;
          border-radius: 6px; cursor: pointer; text-align: left;
          font: inherit; color: inherit;
        }
        .row:hover { background: #f1f5f9; }
        .idx { width: 22px; color: #94a3b8; font-variant-numeric: tabular-nums; }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: #cbd5e1; flex: 0 0 auto; }
        .label { flex: 1; }
        .marker { color: #94a3b8; font-size: 11px; font-variant-numeric: tabular-nums; }
        .s-running .dot { background: #2563eb; animation: pulse 1s ease-in-out infinite; }
        .s-running .label { color: #1d4ed8; }
        .s-success .dot { background: #22c55e; }
        .s-error .dot { background: #ef4444; }
        .s-error .label { color: #b91c1c; font-weight: 600; }
        .s-idle .label { color: #64748b; }
        .empty { padding: 10px 8px; color: #94a3b8; text-align: center; }
        .foot { padding: 6px 10px; border-top: 1px solid #f1f5f9; color: #94a3b8; font-size: 11px; }
        .panel.collapsed .summary, .panel.collapsed .body, .panel.collapsed .foot { display: none; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
      </style>
      <div class="panel">
        <div class="head">
          <span class="title">格子状态</span>
          <span class="progress">0/0</span>
          <button class="filter" title="只看失败/运行中">全部</button>
          <button class="collapse" title="折叠/展开">–</button>
        </div>
        <div class="summary"></div>
        <div class="body"><div class="list"></div></div>
        <div class="foot">点击条目定位格子 · 自动刷新</div>
      </div>`;
    document.body.appendChild(host);

    panel = shadow.querySelector(".panel");
    list = shadow.querySelector(".list");
    progress = shadow.querySelector(".progress");
    summary = shadow.querySelector(".summary");
    collapse = shadow.querySelector(".collapse");
    const head = shadow.querySelector(".head");
    const filter = shadow.querySelector(".filter");

    if (onlyProblems) {
      filter.classList.add("on");
      filter.textContent = "异常";
    }

    chrome.storage.local.get([PANEL_POS_KEY, PANEL_COLLAPSED_KEY]).then((data) => {
      if (!host || !panel || !collapse) return;
      const saved = data[PANEL_POS_KEY];
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        const rect = host.getBoundingClientRect();
        host.style.left = `${Math.min(Math.max(0, saved.left), Math.max(0, window.innerWidth - rect.width))}px`;
        host.style.top = `${Math.min(Math.max(0, saved.top), Math.max(0, window.innerHeight - rect.height))}px`;
        host.style.right = "auto";
        host.style.bottom = "auto";
      }
      if (data[PANEL_COLLAPSED_KEY]) {
        panel.classList.add("collapsed");
        collapse.textContent = "+";
      }
    }).catch(() => {});

    collapse.addEventListener("click", () => {
      const collapsed = panel.classList.toggle("collapsed");
      collapse.textContent = collapsed ? "+" : "–";
      chrome.storage.local.set({ [PANEL_COLLAPSED_KEY]: collapsed }).catch(() => {});
    });

    filter.addEventListener("click", () => {
      onlyProblems = !onlyProblems;
      filter.classList.toggle("on", onlyProblems);
      filter.textContent = onlyProblems ? "异常" : "全部";
      lastSignature = "";
      scan();
    });

    let drag = null;
    head.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button")) return;
      const rect = host.getBoundingClientRect();
      drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, id: event.pointerId };
      head.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    head.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const rect = host.getBoundingClientRect();
      const left = Math.min(Math.max(0, event.clientX - drag.dx), Math.max(0, window.innerWidth - rect.width));
      const top = Math.min(Math.max(0, event.clientY - drag.dy), Math.max(0, window.innerHeight - rect.height));
      host.style.left = `${left}px`;
      host.style.top = `${top}px`;
      host.style.right = "auto";
      host.style.bottom = "auto";
    });
    const endDrag = (event) => {
      if (!drag || (event && event.pointerId !== drag.id)) return;
      drag = null;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      chrome.storage.local.set({ [PANEL_POS_KEY]: { left: Math.round(rect.left), top: Math.round(rect.top) } }).catch(() => {});
    };
    head.addEventListener("pointerup", endDrag);
    head.addEventListener("pointercancel", endDrag);

    list.addEventListener("click", (event) => {
      const row = event.target.closest(".row");
      if (!row) return;
      const cell = cells[Number(row.dataset.i)];
      if (!cell || !cell.wrap) return;
      cell.wrap.scrollIntoView({ block: "center", behavior: "smooth" });
      const prevOutline = cell.wrap.style.outline;
      const prevOffset = cell.wrap.style.outlineOffset;
      cell.wrap.style.outline = "2px solid #3b82f6";
      cell.wrap.style.outlineOffset = "2px";
      setTimeout(() => {
        cell.wrap.style.outline = prevOutline;
        cell.wrap.style.outlineOffset = prevOffset;
      }, 1200);
    });
    return true;
  };

  const removePanel = () => {
    if (host) host.remove();
    host = null;
    panel = null;
    list = null;
    progress = null;
    summary = null;
    collapse = null;
    lastSignature = "";
  };

  const scan = () => {
    if (location.hostname !== "labs.cjlu.dilabs.cn" || !location.pathname.startsWith("/data-analysis/")) {
      removePanel();
      return;
    }
    if (document.hidden) return;
    const next = collect();
    if (!next.length) {
      removePanel();
      return;
    }
    if (!ensurePanel()) return;

    const counts = { success: 0, error: 0, running: 0, idle: 0 };
    for (const cell of next) counts[cell.state]++;
    cells = next;

    const visible = onlyProblems ? next.filter((cell) => cell.state === "error" || cell.state === "running") : next;
    const signature = `${onlyProblems ? "p" : "a"}:${next.map((cell) => `${cell.marker}|${cell.state}`).join(";")}`;
    if (signature === lastSignature) return;
    lastSignature = signature;

    progress.textContent = `已运行 ${counts.success + counts.error}/${next.length}`;
    summary.innerHTML = `成功 <span class="ok">${counts.success}</span> · 失败 <span class="bad">${counts.error}</span> · 运行中 ${counts.running} · 未运行 ${counts.idle}`;
    list.innerHTML = visible.length ? visible.map((cell) => {
      const [label, cls] = STATES[cell.state];
      const marker = cell.marker ? `In [${escapeHtml(cell.marker)}]` : "In [ ]";
      return `<button class="row ${cls}" data-i="${cell.index}" title="点击定位第 ${cell.index + 1} 个格子"><span class="idx">${String(cell.index + 1).padStart(2, "0")}</span><span class="dot"></span><span class="label">${label}</span><span class="marker">${marker}</span></button>`;
    }).join("") : '<div class="empty">没有失败或运行中的格子</div>';
  };

  let pending = null;
  const schedule = () => {
    if (pending || document.hidden) return;
    pending = setTimeout(() => {
      pending = null;
      scan();
    }, 200);
  };

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  let scanTimer = setInterval(scan, 1200);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearInterval(scanTimer);
      scanTimer = null;
    } else {
      scan();
      if (!scanTimer) scanTimer = setInterval(scan, 1200);
    }
  });

  window.addEventListener("resize", () => {
    if (!host || !host.style.left) return;
    const rect = host.getBoundingClientRect();
    if (rect.right > window.innerWidth) host.style.left = `${Math.max(0, window.innerWidth - rect.width)}px`;
    if (rect.bottom > window.innerHeight) host.style.top = `${Math.max(0, window.innerHeight - rect.height)}px`;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan, { once: true });
  } else {
    scan();
  }
})();
