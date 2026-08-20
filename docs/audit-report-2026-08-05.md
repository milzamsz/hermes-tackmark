# TackMark 审查报告（2026-08-05）

审查方式：双专家（可用性/UI + 架构/安全）并行只读审查 + 主 agent 编排复核。
审查范围：src/plugin.js（657 行）、serve.py、tests/、README 双语、DESIGN.md、test.html。
验证：现有测试 7/7、注入 payload 实测构造、serve.py 行为实测、与 Hermes 桌面应用源码对照 API 用法。

## 结论

核心标注闭环（加载→标注→发送）代码路径正确（prompt.submit 用法与宿主一致）。
首次发现：1 条完整 XSS 利用链、3 处首次使用硬断裂、2 处静默死路、1 处对比度回归、README 与实现 5 处不一致。

## 🔴 已修复（10 条，PR-A：PR#1 安全 / PR#2 UX / PR#3 工程）

| # | 问题 | 修复 |
|---|------|------|
| 1 | README 安装指令指向不存在的根级 plugin.js（复制与下载双 404） | 修正为 src/plugin.js，双语一致 |
| 2 | 默认 URL tackmark-help.html 不存在，首次打开即 404 | 新增 tackmark-help.html 说明页 |
| 3 | 加载失败零反馈 + 静默清空用户输入 | toast 报错原因 + 自愈回退可见 |
| 4 | 标注模式与 iframe 失同步（刷新/HMR 后静默死路） | tackmark-ready 握手重同步 + ref 镜像 |
| 5 | baseUrl 未转义 + URL 零校验 → 属性逃逸 XSS（同源代码执行） | escapeHtmlAttr 转义 + isAllowedPreviewUrl 白名单（http/https） |
| 6 | iframe 无 sandbox，预览页脚本获应用同源权限 | sandbox="allow-scripts"（opaque origin 隔离） |
| 7 | serve.py：CORS * + 目录列表 + 可服务点文件 + OPTIONS 501 | 点文件 404、目录 403、do_OPTIONS 204 |
| 8 | postMessage 不验源 → 伪造消息白屏崩溃 / prompt 注入 | 验 event.source + element 结构校验 |
| 9 | 工具栏对比度 1.3:1（按钮隐形） | #cbd5e1 → #334155，激活态 #16a34a |
| 10 | 无 package.json / 测试不可复现 | package.json + npm test + 13 个安全用例 |

验证证据：npm test 20 用例全绿；serve.py 实测 403/404/204；注入 payload 转义用例覆盖。

## 🟡 待修复（15 条，PR-B 建议）

- 交互：无加载指示；加载竞态（无 abort/序号）；中文输入法误提交（isComposing）；非标注模式点击零提示；无标注列表/单条删除/清空无确认
- 数据流：采集 12 项样式坐标发送时丢弃（与 README「零歧义」不符）；页面内容直拼 prompt 无约束；RPC 成功判定脆弱（result?.ok === false）
- 代码：generateSelector 双份复制已分叉；非法伪类静默降级；巨型内嵌脚本字符串；8 处错误吞噬；loadPage 五职混杂；localStorage URL 无 scheme 白名单（存储型注入链）
- 样式：README「全内联」声称不实；硬编码颜色破坏主题（应 var(--ui-*)）；README 面板位置/UI 图虚构
- 测试：正则提取源码的脆弱模式；核心逻辑（选择器生成、HTML 注入）零覆盖

## 🟢 建议改（18 条）

ann_Date.now() id 碰撞；NaN 坐标兜底；</head> 正则首处替换；launch 脚本硬编码本机路径；发送/添加按钮无 loading；空标注可提交；popup 无外部点击关闭；tooltip 无上边界翻转；StatusChip 无实际功能；Ctrl+K 文档过时；popup 无 aria 标签；无翻转箭头指示；坐标陈旧不刷新；添加按钮对比度 2.5:1；busy 会话未处理；popup 深色与工具栏浅色割裂；serve.py log 全静默；fallback 路径跨源页面可伪造消息（已由验源缓解）。

## 修复记录

- ee2fef9 refactor: 存量重构（popover 翻转 + 深色弹窗）提交为基线
- cfcde2f Merge PR #1: 安全加固（4 项）
- ae621ee Merge PR #2: 首次使用修复（5 项）
- 46941a8 Merge PR #3: 工程（package.json + 测试）
- 3d04738 docs: 复查补丁（漏网 2 处 README 旧引用）
