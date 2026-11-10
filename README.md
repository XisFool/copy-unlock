# 复制解锁增强版（copy-unlock）

一个 Chrome / Chromium MV3 解压扩展：恢复被页面脚本禁用的文本选择、复制与粘贴，并为在线实验页提供拖选自动复制与代码格子运行状态面板。

> 当前版本 1.0.3。扩展本体在 [`extension/`](extension/)，用「加载已解压的扩展程序」直接加载该目录即可，**无需构建**。

## 功能

- **复制 / 粘贴解锁**：阻断页面用于禁止复制的事件传播（只 `stopPropagation`，不 `preventDefault`），清理内联 `oncopy/onpaste` 等处理器，恢复原生选择、Ctrl/Cmd+C/X/V 与右键菜单。
- **拖选自动复制**：鼠标拖选后自动写入剪贴板并提示「已复制 N 字」，无需再按 Ctrl+C；自动跳过链接、输入框与代码编辑器，避免误复制。
- **格子状态面板**：实验页右下角汇总可见代码格的运行状态（未运行 / 运行中 / 成功 / 失败），点击条目可定位；支持拖动、折叠记忆、「全部 / 异常」筛选，页面隐藏时暂停刷新。
- **按站点启用**：popup 里对当前站点单独开启，配置存于 `chrome.storage.local`，未开启的站点不注入。
- **注入自检与一键修复**：popup 检测动态内容脚本是否丢失（重载扩展后常见），并提供「修复注入并刷新」。

## 适用范围

- 复制 / 粘贴解锁对**在 popup 中开启的任意 http/https 站点**生效。
- 拖选自动复制与格子面板默认仅针对 `labs.cjlu.dilabs.cn` 的 `/data-analysis/` 实验页；相关 host 常量写在各脚本顶部，按需调整即可。

## 安装

1. 打开 `chrome://extensions`，开启右上角「开发者模式」。
2. 点「加载已解压的扩展程序」，选择**直接包含 `manifest.json`** 的 `extension/` 目录（不要选仓库根目录）。
3. 建议把扩展固定到工具栏。
4. 打开目标站点，点扩展图标，点「开启复制增强」；页面会自动刷新。

逐条引导、验证清单与常见问题见 [`doc/skills/install-copy-unlock/SKILL.md`](doc/skills/install-copy-unlock/SKILL.md)。

> 换路径加载会生成新的扩展 ID，已保存的站点开关 / 自动复制设置不会继承，请保持加载路径稳定。

## 使用

- **popup**：显示当前域名与站点开关；实验页额外显示「拖选自动复制」复选框（默认勾选，改动即时生效、无需刷新）。
- **格子面板**：`In [0]` / 空 = 未运行，`In [*]` = 运行中，数字 > 0 = 成功；结果含 `Traceback` / `XxxError:` 或错误样式时判为失败。
- 自动复制需要**真实鼠标拖拽**（浏览器要求可信用户手势），脚本模拟选区不会触发。

## 目录结构

```
extension/    MV3 扩展本体（manifest、service worker、内容脚本、popup、图标）
doc/skills/   安装与验证指引
```

无构建步骤；改动 `extension/` 后在 `chrome://extensions` 点「重新加载」即生效。

## 工作原理

内容脚本由 `background.js` 通过 `chrome.scripting.registerContentScripts` **动态注册**，没有静态 `content_scripts`：

- `copy-guard`（`guard.js` + `guard.css`）：`document_start`、MAIN world、所有 frame，注入到已开启的站点。
- `cell-panel`（`panel.js`）：`document_idle`、ISOLATED world，仅注入目标实验页。

guard 必须早于页面脚本执行，因此是 `document_start` + MAIN world；它只阻断传播、从不 `preventDefault()`，否则会连原生复制/粘贴/选择一起破坏。

## 已知限制

- 依赖 JS `paste` 事件的编辑器（CodeMirror 6、Monaco 等）可能被误伤；CodeMirror 5 已验证正常。
- MAIN world 的 `document.execCommand("copy")` 在部分 Chrome 版本的真实页面上可能不生效，此时按 Ctrl+C 仍可复制。
- 重载扩展会清空动态注册，用 popup 的「修复注入并刷新」或重新开关站点即可恢复。
- 面板只统计可见 `.code-cell-wrap` 内的 `.CodeMirror`，隐藏 / 零高度格子会被忽略（属正常）。

## 合规说明

本项目仅用于恢复浏览器本应提供的选择 / 复制 / 粘贴等基础交互，便于个人学习与无障碍使用。请在目标网站使用条款与适用法律法规允许的范围内使用，勿用于侵犯版权或绕过授权限制；使用方式由使用者自行负责。

## 许可证

[MIT](LICENSE) © 2026 copy-unlock contributors
