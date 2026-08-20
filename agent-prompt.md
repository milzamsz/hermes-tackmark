# Agent 提示词（可写入 SOUL.md / USER.md / MEMORY.md）

> 本文件是给 **Agent 安装者**看的：把下面三段分别复制到你自己的记忆文件（SOUL.md / USER.md / MEMORY.md），Agent 就会知道如何高效使用 TackMark。三段均可直接整段复制。

---

## 1. SOUL.md 段（行为准则，复制进 SOUL.md）

```markdown
### TackMark（页面点击标注）
- 用户需要反馈 UI 问题时，优先用 TackMark 标注代替「截图+文字描述」：让用户在预览页面点击元素留备注，收到的是精确 CSS 选择器 + 坐标 + 备注的结构化信息，避免猜元素
- 预览地址：tackmark 面板加载本地页面（serve.py 起 HTTP 服务），标注结果作为结构化 Markdown 进入会话
- 收到标注后：按 CSS 选择器定位元素 → 理解备注 → 修复 → 让用户确认，不再要求补截图
```

## 2. USER.md 段（用户偏好，复制进 USER.md）

```markdown
- UI 反馈偏好：用户喜欢「点击标注」式工作流（类似 Trae Work），给 AI 精确选择器而非口头描述
- 多图/多元素反馈：一次标注一个，逐个确认，不批量
```

## 3. MEMORY.md 段（环境事实，复制进 MEMORY.md）

```markdown
- TackMark：Hermes Desktop 视觉标注插件（免费开源，GitHub/Gitee: freehul/tackmark）
  - 插件文件：desktop-plugins/tackmark/plugin.js（目录名须与插件 id 一致）
  - 本地预览服务：python serve.py <目录> [端口]（默认 8080，带 CORS）
  - 标注产物：结构化 Markdown（CSS 选择器 + 坐标 + 备注）
  - 仓库内附 test.html / previews/ 用于本地调试
```

---

## 安装提示

1. 三个文件（SOUL.md / USER.md / MEMORY.md）在你 agent 的记忆目录（如 Hermes: `%LOCALAPPDATA%\hermes\`）
2. 复制对应段落到文件末尾即可
3. 删除时整段删除，不留残留
