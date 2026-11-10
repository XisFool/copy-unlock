(() => {
  "use strict";
  if (window.__copyGuardInstalled) return;
  window.__copyGuardInstalled = true;

  const swallow = (event) => {
    event.stopImmediatePropagation();
    event.stopPropagation();
  };

  ["beforecopy", "copy", "cut", "paste", "selectstart", "contextmenu", "dragstart"].forEach((type) => {
    window.addEventListener(type, swallow, true);
  });

  const comboGuard = (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = (event.key || "").toLowerCase();
    if (key === "c" || key === "x" || key === "v") swallow(event);
  };
  window.addEventListener("keydown", comboGuard, true);
  window.addEventListener("keyup", comboGuard, true);

  const inlineProps = [
    "oncopy", "oncut", "onpaste", "oncontextmenu", "onselectstart", "ondragstart"
  ];

  const clearInline = (root) => {
    if (!root) return;
    const nodes = [root];
    if (root.querySelectorAll) nodes.push(...root.querySelectorAll("*"));
    for (const element of nodes) {
      for (const prop of inlineProps) {
        try {
          if (element[prop]) element[prop] = null;
        } catch (_) {}
      }
    }
  };

  clearInline(document);
  document.addEventListener("DOMContentLoaded", () => {
    clearInline(document);
    console.log("[copy-guard] active:", location.href.slice(0, 120));
  }, true);

  let dragStart = null;

  const isInteractive = (element) =>
    element && element.closest &&
    element.closest('a, button, input, textarea, select, [contenteditable=""], [contenteditable="true"], [draggable="true"], [role="button"], .CodeMirror, .cm-editor, .monaco-editor, .ace_editor, #__cell_status_panel_host');

  const autoCopyEnabled = () =>
    location.hostname === "labs.cjlu.dilabs.cn" &&
    location.pathname.startsWith("/data-analysis/") &&
    document.documentElement.dataset.copyGuardAutoCopy === "on";

  const showToast = (message) => {
    if (!document.body) return;
    let toast = document.getElementById("__copy_guard_toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "__copy_guard_toast";
      toast.style.cssText = "position:fixed;left:50%;bottom:150px;transform:translateX(-50%);z-index:2147483647;padding:6px 10px;border-radius:6px;background:rgba(17,24,39,.92);color:#fff;font:12px/1.4 system-ui,-apple-system,'Segoe UI','Microsoft YaHei',sans-serif;pointer-events:none;user-select:none;opacity:0;transition:opacity .15s;";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = "1";
    clearTimeout(toast.__hideTimer);
    clearTimeout(toast.__removeTimer);
    toast.__hideTimer = setTimeout(() => {
      toast.style.opacity = "0";
      toast.__removeTimer = setTimeout(() => toast.remove(), 200);
    }, 1400);
  };

  const autoCopySelection = () => {
    if (!autoCopyEnabled()) return;
    const selection = window.getSelection();
    const text = selection ? selection.toString() : "";
    if (!text.trim()) return;
    const length = text.trim().length;
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (_) {}
    if (copied) {
      showToast(`已复制 ${length} 字`);
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showToast(`已复制 ${length} 字`),
        () => showToast("自动复制失败，请按 Ctrl+C")
      );
    } else {
      showToast("自动复制失败，请按 Ctrl+C");
    }
  };

  window.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || isInteractive(event.target)) {
      dragStart = null;
      return;
    }
    dragStart = { x: event.clientX, y: event.clientY };
  }, true);

  window.addEventListener("mouseup", (event) => {
    const start = dragStart;
    dragStart = null;
    if (!start || event.button !== 0) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) return;

    const end = { x: event.clientX, y: event.clientY };

    const restore = () => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) return true;
      if (!document.caretRangeFromPoint) return false;

      const from = document.caretRangeFromPoint(start.x, start.y);
      const to = document.caretRangeFromPoint(end.x, end.y);
      if (!from || !to) return false;

      let first = from;
      let second = to;
      try {
        if (from.compareBoundaryPoints(Range.START_TO_START, to) > 0) {
          first = to;
          second = from;
        }
        const range = document.createRange();
        range.setStart(first.startContainer, first.startOffset);
        range.setEnd(second.startContainer, second.startOffset);
        if (range.collapsed) return false;
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      } catch (_) {
        return false;
      }
    };

    let autoCopied = false;
    const attempt = () => {
      const ok = restore();
      if (ok && !autoCopied) {
        autoCopied = true;
        autoCopySelection();
      }
    };
    setTimeout(attempt, 0);
    setTimeout(attempt, 120);
  }, true);
})();
