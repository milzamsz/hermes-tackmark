# TackMark — Design Doc v0.1

> Visual feedback for Hermes Agent. Click elements, annotate, and let AI fix code.

---

## 一、项目定位

**TackMark** 是 Hermes Desktop 的内置插件，实现类似 Trae Work 的交互式预览+标注功能。

**核心价值：** 把"截图 → 粘贴 → 描述 → 猜测"的反馈循环，缩短为"点击 → 标注 → 精准修改"。

---

## 二、用户故事

| 场景 | 当前方式 | TackMark 方式 |
|------|---------|--------------|
| 修改 UI 样式 | 截图 + "那个蓝色按钮" | 直接点击按钮 → "改成紫色" |
| 参考外部设计 | 截图 + 描述布局 | 标注元素 → "这个导航栏抄过来" |
| 记录页面状态 | 截图 + 文字说明 | 标注元素 → "这个报错了" |
| 布局调试 | 反复截图对比 | 实时预览 + 标注重叠区域 |

---

## 三、技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Hermes Desktop (Electron)                 │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              TackMark Desktop Plugin                   │  │
│  │                                                       │  │
│  │  ┌──────────────┐    ┌─────────────────────────────┐  │  │
│  │  │ Control Panel│    │ Preview Panel (iframe)      │  │  │
│  │  │              │    │                             │  │  │
│  │  │ • 标注列表    │    │  ┌─────────────────────┐   │  │  │
│  │  │ • 过滤/搜索   │    │  │ Annotation Layer    │   │  │  │
│  │  │ • 操作按钮    │    │  │ (inject via JS)     │   │  │  │
│  │  │              │    │  │                     │   │  │  │
│  │  └──────────────┘    │  │  • 点击选择元素     │   │  │  │
│  │         │            │  │  • 显示选择器高亮    │   │  │  │
│  │         │            │  │  • 弹出标注输入框    │   │  │  │
│  │         │            │  └─────────────────────┘   │  │  │
│  │         │            └─────────────────────────────┘  │  │
│  │         │                       │                     │  │
│  │         ▼                       ▼                     │  │
│  │  ┌────────────────────────────────────────────────┐   │  │
│  │  │              Core Logic (JS)                   │   │  │
│  │  │                                                │   │  │
│  │  │  • selector-generator (CSS 选择器生成)          │   │  │
│  │  │  • element-inspector (元素信息采集)             │   │  │
│  │  │  • annotation-store (标注数据管理)              │   │  │
│  │  │  • hermes-bridge (调用 host.request)           │   │  │
│  │  └────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────┘  │
│                           │                                 │
│                           ▼                                 │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Hermes Gateway API                        │  │
│  │  • file_read / file_edit — 读取/修改代码              │  │
│  │  • terminal — 执行命令（重启 dev server）              │  │
│  │  • session — 发送标注到当前对话                        │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 四、数据结构

### Annotation（标注）

```typescript
interface Annotation {
  id: string                    // 唯一 ID
  url: string                   // 页面 URL
  selector: string              // CSS 选择器
  selectorPath: string          // 完整 DOM 路径
  comment: string               // 用户评论
  elementInfo: {
    tag: string                 // 标签名
    classes: string[]           // 类名
    text: string                // 文本内容
    styles: Record<string, string>  // 计算样式
    position: { x: number, y: number, width: number, height: number }
  }
  screenshot?: string           // 可选截图（base64）
  status: 'pending' | 'resolved' | 'dismissed'
  createdAt: number
  updatedAt: number
}
```

### AnnotationMessage（发送给 Agent 的消息）

```typescript
interface AnnotationMessage {
  annotations: Annotation[]
  summary: string               // 自动生成的摘要
  codebaseHints: {
    selector: string
    possibleFiles: string[]     // 可能相关的文件
    suggestedAction: string     // 建议操作
  }[]
}
```

---

## 五、功能清单（v0.1）

### P0 - 核心功能

- [ ] 预览面板（iframe 加载 localhost URL）
- [ ] 点击元素 → 高亮 + 显示选择器
- [ ] 弹出输入框 → 添加标注
- [ ] 标注列表面板（侧边栏）
- [ ] 发送标注到 Agent 对话

### P1 - 增强功能

- [ ] 元素 hover 高亮（蓝色边框）
- [ ] 选择器自动优化（避免过长路径）
- [ ] 标注状态管理（pending/resolved/dismissed）
- [ ] 截图自动附加

### P2 - 高级功能

- [ ] 外部网站标注（跨域处理）
- [ ] 标注历史持久化（ctx.storage）
- [ ] 批量发送标注
- [ ] Agent 反向对话（"已修复" / "需要更多信息"）

---

## 六、选择器生成策略

```javascript
// 优先级：id > 独特类名 > nth-child 路径

function generateSelector(element) {
  // 1. 有 id 直接用
  if (element.id) return `#${element.id}`
  
  // 2. 找独特的类名组合
  const uniqueClasses = findUniqueClassCombination(element)
  if (uniqueClasses) return uniqueClasses
  
  // 3. 用 nth-child 路径
  return generateNthChildPath(element)
}

// 优化：避免过长路径
function optimizeSelector(selector, element) {
  // 从最短路径开始，验证是否唯一
  // 如果不唯一，逐步添加父级
}
```

---

## 七、实现路径

### Phase 1：PoC（1-2天）
- 创建 Plugin 骨架
- 实现 iframe 预览
- 注入简单的点击事件
- 验证可行性

### Phase 2：核心功能（3-5天）
- 完整的标注交互层
- 选择器生成
- 标注列表面板
- 发送到 Agent

### Phase 3：打磨（2-3天）
- 样式优化
- 错误处理
- 用户体验改进

---

## 八、文件结构

```
D:\Projects\tackmark\
├── DESIGN.md                 # 本文档
├── README.md                 # 项目说明
├── src/
│   ├── plugin.js             # Desktop Plugin 入口
│   ├── components/
│   │   ├── PreviewPanel.jsx  # 预览面板
│   │   ├── ControlPanel.jsx  # 控制面板
│   │   └── AnnotationList.jsx# 标注列表
│   ├── core/
│   │   ├── selector.js       # 选择器生成
│   │   ├── inspector.js      # 元素信息采集
│   │   └── store.js          # 标注数据管理
│   └── inject/
│       └── annotation-layer.js # 注入到 iframe 的标注层
├── templates/
│   └── plugin.js             # 插件模板
└── tests/
    └── selector.test.js      # 选择器生成测试
```

---

## 九、风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| iframe 跨域限制 | 无法注入标注层 | 只支持 localhost；外部网站用代理 |
| 选择器不唯一 | 修改错误元素 | 多策略生成 + 人工确认 |
| Agent 不理解标注 | 修改效果不符预期 | 结构化数据 + 截图辅助 |
| 性能问题 | 页面卡顿 | 延迟注入 + 按需加载 |

---

## 十、开放问题

1. **与 Vibe Annotations 的关系？**
   - 复用核心逻辑？
   - 还是完全自研？
   - 建议：先自研，保持轻量

2. **是否需要 Python 后端？**
   - v0.1 不需要
   - 如果需要缓存/历史/协作，再加

3. **如何与 open_preview 共存？**
   - TackMark 替代 open_preview？
   - 还是并行存在？
   - 建议：TackMark 作为增强版，逐步替代

---

## 附录 A：参考项目

| 项目 | Stars | 特点 | 可借鉴 |
|------|-------|------|--------|
| Vibe Annotations | 121 | Chrome 扩展 + MCP | 选择器生成、标注 UI |
| Agentation | - | 浮动工具栏 | 元素高亮、结构化输出 |
| Trae Work | - | 内置浏览器 | 选择模式、直接编辑 |

---

## 附录 B：API 参考

### Hermes Desktop Plugin API

```javascript
// 注册面板
ctx.register({
  id: 'tackmark-preview',
  area: 'panes',
  placement: 'right',
  render: () => jsx(PreviewPanel)
})

// 调用 Gateway
const result = await host.request('file.edit', {
  path: '/path/to/file',
  old_string: 'old',
  new_string: 'new'
})

// 监听事件
host.onEvent('annotation.created', (data) => {
  console.log('New annotation:', data)
})

// 本地存储
ctx.storage.set('annotations', annotations)
```

---

*Last updated: 2026-08-02*
*Author: Hermes Agent (AI)*
*Status: Draft*
