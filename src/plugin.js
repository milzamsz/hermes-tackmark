/**
 * TackMark — Visual feedback for Hermes Agent
 * Click elements, annotate, and let AI fix code.
 */

import { host, haptic } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useState, useEffect, useCallback, useRef } from 'react'

const ID = 'tackmark'

/**
 * 规范化文件路径，防御 MSYS/Git Bash 的路径转换。
 * MSYS2 运行时会自动把 Unix 风格路径（/d/Projects/...）与 Windows 路径互相改写，
 * 导致 host.request('file.*', { path }) 拿到的路径格式错误、文件找不到。
 *
 * 支持输入：
 *   '/c/Users/foo/bar'   → 'C:\Users\foo\bar'   (MSYS 风格)
 *   'C:/Users/foo/bar'   → 'C:\Users\foo\bar'   (正斜杠 Windows 风格)
 *   'C:\Users\foo\bar'   → 'C:\Users\foo\bar'   (原样)
 *
 * 注意：只用于文件路径，不要用于 URL 或选择器。
 */
export function normalizeFilePath(input) {
  if (typeof input !== 'string' || input.length === 0) return input
  // MSYS 风格盘符：/c/... → C:\
  input = input.replace(/^\/[a-zA-Z]\//, (m) => m.charAt(1).toUpperCase() + ':\\')
  // 统一为正斜杠 → 反斜杠
  input = input.replace(/\//g, '\\')
  return input
}

// URL 白名单：只允许 http/https，拦截 data:/javascript: 等无网络注入路径
export function isAllowedPreviewUrl(url) {
  return typeof url === 'string' && /^https?:\/\/.+/.test(url)
}

// HTML 属性值转义：用于 <base href> 注入，防属性逃逸 XSS
export function escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// 选择器生成
function generateSelector(element) {
  if (!element) return ''
  
  // 1. 有 id 直接用
  if (element.id) return `#${element.id}`
  
  // 2. 找独特的类名组合
  if (element.classList && element.classList.length > 0) {
    const classes = Array.from(element.classList)
    const selector = classes.map(c => `.${c}`).join('')
    // 验证是否唯一
    try {
      if (document.querySelectorAll(selector).length === 1) {
        return selector
      }
    } catch (e) {}
  }
  
  // 3. 用 nth-child 路径
  const path = []
  let current = element
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase()
    if (current.id) {
      selector = `#${current.id}`
      path.unshift(selector)
      break
    }
    if (current.classList && current.classList.length > 0) {
      selector += Array.from(current.classList).map(c => `.${c}`).join('')
    }
    
    // 计算 nth-child
    const parent = current.parentElement
    if (parent) {
      const siblings = Array.from(parent.children)
      const index = siblings.indexOf(current) + 1
      selector += `:nth-child(${index})`
    }
    
    path.unshift(selector)
    current = current.parentElement
  }
  
  return path.join(' > ')
}

// 标注输入弹窗组件
function AnnotationPopup({ element, onSubmit, onCancel }) {
  const [comment, setComment] = useState('')
  const inputRef = useRef(null)
  
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])
  
  const handleSubmit = () => {
    if (comment.trim()) {
      onSubmit(comment)
    }
  }
  
  // 弹窗定位：跟随鼠标（popupPosition），以 iframe 可视区为边界钳制
  // 边界信息在 PreviewPanel 计算坐标时已随 element.viewportBounds 传入
  const pos = element.popupPosition || element.position || { x: 0, y: 0 }
  const popupWidth = 260
  const popupHeight = 160
  const bound = element.viewportBounds
    || { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
  let left = pos.x + 12
  let top = pos.y + 16
  // 右侧放不下 → 翻转到左侧；左侧也放不下 → 贴左边界
  if (left + popupWidth > bound.right - 4) {
    left = pos.x - popupWidth - 12
  }
  if (left < bound.left + 4) left = bound.left + 4
  // 底部放不下 → 翻转到上方；上方也放不下 → 贴顶边界
  if (top + popupHeight > bound.bottom - 4) {
    top = pos.y - popupHeight - 12
  }
  if (top < bound.top + 4) top = bound.top + 4
  
  return jsxs('div', {
    className: 'fixed z-[9999] rounded-lg shadow-xl p-3 min-w-[250px]',
    style: {
      top: `${top}px`,
      left: `${left}px`,
      background: '#1e293b',
      color: '#ffffff',
      border: '1px solid #334155',
    },
    onClick: (e) => e.stopPropagation(),
    children: [
      jsx('div', {
        className: 'text-xs mb-2 break-all',
        style: { color: '#7dd3fc' },
        children: `${element.tag} ${element.classes.map(c => `.${c}`).join('')}`
      }),
      jsx('input', {
        ref: inputRef,
        type: 'text',
        className: 'w-full px-2 py-1.5 border rounded text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500',
        style: {
          background: '#0f172a',
          color: '#ffffff',
          border: '1px solid #475569',
        },
        placeholder: '输入标注...',
        value: comment,
        onChange: (e) => setComment(e.target.value),
        onKeyDown: (e) => {
          if (e.key === 'Enter') handleSubmit()
          if (e.key === 'Escape') onCancel()
        }
      }),
      jsxs('div', {
        className: 'flex justify-end gap-2',
        children: [
          jsx('button', {
            className: 'px-2 py-1 text-xs',
            style: { color: '#cbd5e1' },
            onClick: onCancel,
            children: '取消'
          }),
          jsx('button', {
            className: 'px-2 py-1 text-xs rounded',
            style: { background: '#22c55e', color: '#ffffff' },
            onClick: handleSubmit,
            children: '添加'
          })
        ]
      })
    ]
  })
}

// 预览面板组件
const DEFAULT_URL = 'http://localhost:8080/tackmark-help.html'

function PreviewPanel() {
  // URL 持久化：重载插件/重启应用后自动恢复上次预览的页面
  // 自愈：本地存储的URL如果失效（旧版test.html等404），自动回退到说明页
  const [url, setUrl] = useState(() => {
    try {
      const saved = localStorage.getItem('tackmark_last_url')
      if (saved) return saved
      return DEFAULT_URL
    } catch {
      return DEFAULT_URL
    }
  })
  const [annotations, setAnnotations] = useState([])
  const [isAnnotating, setIsAnnotating] = useState(false)
  // ref 镜像：message handler 里读最新标注状态（闭包值会过期）
  const isAnnotatingRef = useRef(false)
  const [selectedElement, setSelectedElement] = useState(null)
  const [showPopup, setShowPopup] = useState(false)
  const iframeRef = useRef(null)
  
  // 处理 iframe 消息
  useEffect(() => {
    const handleMessage = (event) => {
      // 只接受来自当前预览 iframe 的消息（防其他窗口/页面伪造消息注入）
      const iframe = iframeRef.current
      if (!iframe || event.source !== iframe.contentWindow) return
      if (event.data?.type === 'tackmark-ready') {
        // 页面(重)加载完成：iframe 内标注状态已重置为关闭
        // 若父端仍显示"标注中"，重新同步，避免点击悬停静默失效
        if (isAnnotatingRef.current) {
          iframe.contentWindow.postMessage({
            type: 'tackmark-toggle-annotation',
            enabled: true
          }, '*')
        }
        return
      }
      if (event.data?.type === 'tackmark-element-selected') {
        const element = event.data.element
        // 结构校验：损坏/伪造的消息会导致面板崩溃（classes.map）或注入任意 selector
        if (!element || typeof element !== 'object'
            || !Array.isArray(element.classes)
            || typeof element.tag !== 'string') return
        // 坐标系转换：iframe 内坐标 → 父窗口坐标（fixed 定位基准）
        const rect = iframe.getBoundingClientRect()
        element.popupPosition = {
          x: rect.left + (element.mouse?.x ?? element.position.x),
          y: rect.top + (element.mouse?.y ?? element.position.y)
        }
        // 弹窗边界 = iframe 可视区（弹窗不应超出它）
        element.viewportBounds = {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom
        }
        setSelectedElement(element)
        setShowPopup(true)
      }
    }
    
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])
  
  // 初始加载默认 URL
  useEffect(() => {
    loadPage(url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  
  // 标注层脚本——注入到预览页面内执行（srcdoc 继承父窗口源，脚本可用）
  const ANNOTATION_SCRIPT = `
    (function() {
      let isAnnotating = false;
      let overlay = null;
      let tooltip = null;
      
      function createOverlay() {
        overlay = document.createElement('div');
        overlay.style.cssText = \`
          position: fixed;
          pointer-events: none;
          z-index: 9998;
          border: 2px solid #3b82f6;
          background: rgba(59, 130, 246, 0.1);
          transition: all 0.15s ease;
        \`;
        document.body.appendChild(overlay);
        
        tooltip = document.createElement('div');
        tooltip.style.cssText = \`
          position: fixed;
          z-index: 9999;
          background: #1e293b;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          pointer-events: none;
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        \`;
        document.body.appendChild(tooltip);
      }
      
      function updateHighlight(element) {
        if (!overlay) return;
        const rect = element.getBoundingClientRect();
        // zoom(设计稿适配缩放)下 fixed 元素的定位与尺寸会被 zoom 再缩放一遍，
        // 这里按 1/z 补偿，使 overlay/tooltip 与实际元素视觉位置精确贴合
        const z = parseFloat(document.documentElement.style.zoom) || 1;
        overlay.style.top = (rect.top / z) + 'px';
        overlay.style.left = (rect.left / z) + 'px';
        overlay.style.width = (rect.width / z) + 'px';
        overlay.style.height = (rect.height / z) + 'px';
        
        const tag = element.tagName.toLowerCase();
        const id = element.id ? '#' + element.id : '';
        const classes = Array.from(element.classList).map(c => '.' + c).join('');
        tooltip.textContent = tag + id + classes;
        tooltip.style.top = (rect.top / z - 28 / z) + 'px';
        tooltip.style.left = (rect.left / z) + 'px';
      }
      
      function generateSelector(element) {
        if (element.id) return '#' + element.id;
        if (element.classList && element.classList.length > 0) {
          const classes = Array.from(element.classList);
          const selector = classes.map(c => '.' + c).join('');
          try {
            if (document.querySelectorAll(selector).length === 1) return selector;
          } catch (e) {}
        }
        const path = [];
        let current = element;
        while (current && current !== document.body) {
          let selector = current.tagName.toLowerCase();
          if (current.id) {
            selector = '#' + current.id;
            path.unshift(selector);
            break;
          }
          if (current.classList && current.classList.length > 0) {
            selector += Array.from(current.classList).map(c => '.' + c).join('');
          }
          const parent = current.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children);
            const index = siblings.indexOf(current) + 1;
            selector += ':nth-child(' + index + ')';
          }
          path.unshift(selector);
          current = current.parentElement;
        }
        return path.join(' > ');
      }
      
      function inspectElement(element) {
        const styles = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          classes: Array.from(element.classList || []),
          text: element.textContent?.trim().substring(0, 100) || '',
          id: element.id || null,
          styles: {
            display: styles.display,
            position: styles.position,
            width: styles.width,
            height: styles.height,
            backgroundColor: styles.backgroundColor,
            color: styles.color,
            fontSize: styles.fontSize,
            fontFamily: styles.fontFamily,
            padding: styles.padding,
            margin: styles.margin,
            borderRadius: styles.borderRadius,
          },
          position: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          }
        };
      }
      
      function handleMouseMove(e) {
        if (!isAnnotating) return;
        e.preventDefault();
        e.stopPropagation();
        updateHighlight(e.target);
      }
      
      function handleClick(e) {
        if (!isAnnotating) return;
        e.preventDefault();
        e.stopPropagation();
        
        const element = e.target;
        const selector = generateSelector(element);
        const info = inspectElement(element);
        
        window.parent.postMessage({
          type: 'tackmark-element-selected',
          element: {
            selector,
            ...info,
            mouse: { x: e.clientX, y: e.clientY }
          }
        }, '*');
      }
      
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'tackmark-toggle-annotation') {
          isAnnotating = event.data.enabled;
          if (isAnnotating && !overlay) {
            createOverlay();
          }
          if (!isAnnotating && overlay) {
            overlay.style.display = 'none';
            tooltip.style.display = 'none';
          } else if (isAnnotating && overlay) {
            overlay.style.display = 'block';
            tooltip.style.display = 'block';
          }
        }
      });
      
      // ---- 设计稿适配：固定尺寸页面(如1080x1920封面)在预览区缩放完整显示 ----
      // 测量内容实际尺寸，按视口计算 zoom=min(宽比,高比)，仅缩小不放大
      let fitW = 0, fitH = 0;
      function fitPreview() {
        const docEl = document.documentElement;
        if (!fitW || !fitH) {
          fitW = docEl.scrollWidth;
          fitH = docEl.scrollHeight;
        }
        if (!fitW || !fitH) return;
        const scale = Math.min(window.innerWidth / fitW, window.innerHeight / fitH);
        const zoom = Math.min(scale, 1);
        docEl.style.zoom = zoom < 1 ? String(zoom) : '';
        // 缩放后内容不超过视口，隐藏可能的舍入滚动条
        document.body.style.overflowX = 'hidden';
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fitPreview);
      } else {
        fitPreview();
      }
      window.addEventListener('load', fitPreview);
      window.addEventListener('resize', fitPreview);

      document.addEventListener('mousemove', handleMouseMove, true);
      document.addEventListener('click', handleClick, true);
      
      window.parent.postMessage({ type: 'tackmark-ready' }, '*');
    })();
  `
  
  // 加载页面：fetch HTML → 注入标注脚本 → srcdoc（跨源 eval 被禁，srcdoc 继承父源可执行）
  const loadPage = useCallback(async (targetUrl) => {
    const iframe = iframeRef.current
    if (!iframe) return
    // URL 校验：只允许 http/https，拦截 data:/javascript: 等无网络注入路径
    if (!isAllowedPreviewUrl(targetUrl)) {
      host.notify({ kind: 'error', message: '仅支持 http/https 地址' })
      return
    }
    try {
      // 缓存破坏：带上时间戳参数，确保改文件后刷新立即生效
      const cacheBust = targetUrl.includes('?') ? `&_t=${Date.now()}` : `?_t=${Date.now()}`
      const res = await fetch(targetUrl + cacheBust)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      let html = await res.text()
      // baseUrl 必须 HTML 属性转义，否则用户 URL 可逃逸 <base href="..."> 注入脚本（同源 XSS）
      const baseUrl = escapeHtmlAttr(targetUrl.replace(/[^/]*$/, ''))
      const baseTag = `<base href="${baseUrl}">`
      const scriptTag = `<script>${ANNOTATION_SCRIPT}<\/script>`
      if (/<\/head>/i.test(html)) {
        html = html.replace(/<\/head>/i, `${baseTag}${scriptTag}</head>`)
      } else {
        html = baseTag + scriptTag + html
      }
      iframe.srcdoc = html
      try {
        localStorage.setItem('tackmark_last_url', targetUrl)
      } catch {}
    } catch (e) {
      console.error('Failed to load page with annotation:', e)
      // 明确反馈：toast 告知失败原因，不再静默替换输入框（原逻辑用户无感知）
      const errMsg = e?.message || String(e)
      host.notify({ kind: 'error', message: `加载失败: ${errMsg}` })
      // 自愈：URL失效（404/连不上）→ 回退说明页 + 清除无效的旧值
      if (targetUrl !== DEFAULT_URL) {
        try {
          localStorage.removeItem('tackmark_last_url')
        } catch {}
        setUrl(DEFAULT_URL)
        loadPage(DEFAULT_URL)
      } else {
        iframe.src = targetUrl
      }
    }
  }, [])
  
  // 切换标注模式
  const toggleAnnotation = useCallback(() => {
    const newState = !isAnnotating
    setIsAnnotating(newState)
    isAnnotatingRef.current = newState
    
    const iframe = iframeRef.current
    if (iframe?.contentWindow) {
      // targetOrigin 用 '*'：sandbox 后 iframe 是 opaque origin，无法指定具体 origin；
      // 'parent' 等非 origin 值会让 Chrome 直接抛 Invalid target origin，消息发不出去。
      // 安全由接收端 event.source === iframe.contentWindow 校验保障（见 handleMessage）。
      iframe.contentWindow.postMessage({
        type: 'tackmark-toggle-annotation',
        enabled: newState
      }, '*')
    }
  }, [isAnnotating])
  
  // 添加标注
  const handleAddAnnotation = useCallback((comment) => {
    if (!selectedElement) return
    
    const newAnnotation = {
      id: `ann_${Date.now()}`,
      url: url,
      selector: selectedElement.selector,
      comment,
      elementInfo: selectedElement,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    
    setAnnotations(prev => [...prev, newAnnotation])
    setShowPopup(false)
    setSelectedElement(null)
    
    haptic('success')
    host.notify({ kind: 'success', message: '标注已添加' })
  }, [selectedElement, url])
  
  // 发送标注到 Agent
  const sendToAgent = useCallback(async () => {
    const pendingAnnotations = annotations.filter(a => a.status === 'pending')
    
    if (pendingAnnotations.length === 0) {
      host.notify({ kind: 'warning', message: '没有待发送的标注' })
      return
    }
    
    try {
      // 发送到当前会话（桌面版标准发送RPC：prompt.submit，与输入框发送同通道）
      const text = `**页面标注反馈：**\n\n${pendingAnnotations.map((a, i) => 
        `${i + 1}. **${a.selector}**\n   ${a.comment}\n   元素: ${a.elementInfo.tag} ${a.elementInfo.classes.map(c => `.${c}`).join('')}`
      ).join('\n\n')}\n\n请根据标注修改代码。`
      
      const sid = host.state?.activeSessionId?.get?.() ?? null
      const result = await host.request('prompt.submit', {
        session_id: sid,
        text
      })
      
      // prompt.submit 成功返回 ok:true（或 error 字段为 None）
      const failed = result?.error || (result?.ok === false)
      if (!failed) {
        // 标记为已发送
        setAnnotations(prev => prev.map(a => 
          a.status === 'pending' ? { ...a, status: 'resolved' } : a
        ))
        host.notify({ kind: 'success', message: `已发送 ${pendingAnnotations.length} 个标注` })
      } else {
        const errMsg = (result?.error?.message || result?.message || '未知错误')
        host.notify({ kind: 'error', message: '发送失败: ' + errMsg })
      }
    } catch (error) {
      host.notify({ kind: 'error', message: '发送失败: ' + error.message })
    }
  }, [annotations])
  
  // 清空标注
  const clearAnnotations = useCallback(() => {
    setAnnotations([])
    host.notify({ kind: 'info', message: '已清空所有标注' })
  }, [])
  
  // 计算待处理数量
  const pendingCount = annotations.filter(a => a.status === 'pending').length
  
  return jsxs('div', {
    className: 'flex h-full flex-col',
    children: [
      // 工具栏
      jsxs('div', {
        className: 'flex items-center gap-2 p-2 border-b border-gray-200 bg-gray-50',
        children: [
          // URL 输入
          jsx('input', {
            type: 'text',
            className: 'flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500',
            placeholder: '输入 URL (如 http://localhost:3000)',
            value: url,
            onChange: (e) => {
              setUrl(e.target.value)
              try {
                localStorage.setItem('tackmark_last_url', e.target.value)
              } catch {}
            },
            onKeyDown: (e) => {
              if (e.key === 'Enter') {
                // 刷新 iframe（fetch+srcdoc 注入标注层）
                try {
                  localStorage.setItem('tackmark_last_url', url)
                } catch {}
                loadPage(url)
              }
            }
          }),
          
          // 刷新按钮：重新加载当前URL
          jsx('button', {
            className: 'px-2 py-1 text-xs',
            style: { color: '#334155' },
            onClick: () => {
              try {
                localStorage.setItem('tackmark_last_url', url)
              } catch {}
              loadPage(url)
            },
            children: '刷新'
          }),
          
          // 标注按钮
          jsx('button', {
            className: 'px-2 py-1 text-xs',
            style: { color: isAnnotating ? '#16a34a' : '#334155' },
            onClick: toggleAnnotation,
            children: isAnnotating ? '🎯 标注中' : '📌 标注'
          }),
          
          // 发送按钮
          jsx('button', {
            className: 'px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50',
            onClick: sendToAgent,
            disabled: pendingCount === 0,
            children: `发送 (${pendingCount})`
          }),
          
          // 清空按钮
          jsx('button', {
            className: 'px-2 py-1 text-xs',
            style: { color: '#334155' },
            onClick: clearAnnotations,
            children: '清空'
          })
        ]
      }),
      
      // 预览区域
      jsxs('div', {
        className: 'flex-1 relative',
        children: [
          jsx('iframe', {
            ref: iframeRef,
            className: 'w-full h-full border-0',
            // sandbox: 只给 allow-scripts（标注脚本需要），不给 allow-same-origin
            // → 被预览页面以 opaque origin 运行，无法访问宿主应用同源权限（localStorage/DOM）
            // 标注脚本只通过 postMessage 通信，不受影响
            sandbox: 'allow-scripts',
          }),
          
          // 标注弹窗
          showPopup && selectedElement && jsx(AnnotationPopup, {
            element: selectedElement,
            onSubmit: handleAddAnnotation,
            onCancel: () => {
              setShowPopup(false)
              setSelectedElement(null)
            }
          })
        ]
      })
    ]
  })
}

// 状态栏芯片组件
function StatusChip() {
  // 使用本地状态，不依赖 atom
  return jsx('button', {
    className: 'inline-flex h-full items-center gap-1 px-1.5 text-[0.6875rem] transition-colors text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover)',
    onClick: () => {
      haptic('tap')
      host.notify({ kind: 'info', message: 'TackMark 已加载' })
    },
    children: '📌'
  })
}

// 插件导出
export default {
  id: ID,
  name: 'TackMark',
  register(ctx) {
    // 注册 i18n
    ctx.i18n.register({
      en: {
        title: 'TackMark',
        description: 'Visual feedback for code',
      },
      zh: {
        title: 'TackMark',
        description: '可视化代码反馈',
      }
    })
    
    // 注册预览面板
    ctx.register({
      id: 'preview',
      area: 'panes',
      title: 'TackMark',
      data: { 
        placement: 'right', 
        width: '50%',
      },
      render: () => jsx(PreviewPanel, {})
    })
    
    // 注册状态栏芯片
    ctx.register({
      id: 'chip',
      area: 'statusBar.right',
      order: 130,
      render: () => jsx(StatusChip, {})
    })
  }
}
