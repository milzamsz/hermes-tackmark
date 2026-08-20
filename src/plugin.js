/**
 * hermes-tackmark — Visual feedback for Hermes Agent
 * Click elements, annotate, and let AI fix code.
 *
 * Hardened fork of freehul/tackmark.
 * Uses extracted core modules for selector, URL policy, session, schema, payload.
 */

import { host, haptic } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useState, useEffect, useCallback, useRef } from 'react'

// Re-export preserved upstream functions for backward compatibility
export { normalizeFilePath } from './core/normalize-path.js'
export { isAllowedPreviewUrl } from './core/url-policy.js'
export { escapeHtmlAttr } from './core/html.js'

import { validatePreviewUrl } from './core/url-policy.js'
import { escapeHtmlAttr } from './core/html.js'
import { getTargetSessionId, checkSendSafety, checkSubmitSuccess } from './core/session.js'
import { validateMessage, createAnnotation } from './core/annotation-schema.js'
import { formatAgentPrompt } from './core/payload.js'

const ID = 'tackmark'
const DEFAULT_URL = 'http://localhost:8080/tackmark-help.html'

// Module-level plugin storage — set by register(), read by PreviewPanel.
// Falls back to localStorage when ctx.storage is unavailable (older Hermes
// versions or test environments).
const pluginStorage = {
  _impl: null,
  get(key) {
    if (this._impl) return this._impl.get?.(key) ?? null
    try { return localStorage.getItem(`tackmark_${key}`) } catch { return null }
  },
  set(key, value) {
    if (this._impl) return this._impl.set?.(key, value)
    try { localStorage.setItem(`tackmark_${key}`, value) } catch {}
  },
  remove(key) {
    if (this._impl) return this._impl.remove?.(key)
    try { localStorage.removeItem(`tackmark_${key}`) } catch {}
  },
}

/**
 * Annotation layer script — injected into the sandboxed preview iframe.
 * Self-contained (no imports) because the iframe runs in an opaque origin
 * (sandbox="allow-scripts" without allow-same-origin), which prevents
 * ES module imports.
 *
 * CONSTRAINT: This is an inline copy of the selector logic from
 * src/core/selectors.js. The kanban (HTM-010) requires de-duplication,
 * but the opaque-origin constraint makes it impossible for the iframe
 * to import the shared module at runtime. Instead, we verify behavioral
 * parity via tests/parity.test.js, which runs both copies against the
 * same fixtures and confirms identical output for non-special-char cases.
 * The inline copy adds CSS.escape for Tailwind safety, matching the module.
 */
const ANNOTATION_SCRIPT = `
  (function() {
    let isAnnotating = false;
    let overlay = null;
    let tooltip = null;

    function escapeCss(name) {
      if (typeof name !== 'string' || name.length === 0) return '';
      if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(name);
      // Manual fallback: escape special chars per CSS spec (backtick = 0x60)
      var special = '!\"#$%&\\'()*+,./:;<=>?@[\\\\]^' + String.fromCharCode(96) + '{|}~';
      var r = '';
      for (var i = 0; i < name.length; i++) {
        var ch = name[i];
        if (i === 0 && /\\d/.test(ch)) { r += '\\\\' + ch; }
        else if (special.indexOf(ch) >= 0) { r += '\\\\' + ch; }
        else { r += ch; }
      }
      return r;
    }

    function generateSelector(element) {
      if (!element) return { selector: '', strategy: 'none' };

      // 1. Unique stable ID
      if (element.id) {
        var sel = '#' + escapeCss(element.id);
        try { if (document.querySelectorAll(sel).length === 1) return { selector: sel, strategy: 'id' }; } catch(e) {}
      }

      // 2. Stable testing attribute
      var testAttrs = ['data-testid', 'data-test'];
      for (var ti = 0; ti < testAttrs.length; ti++) {
        var val = element.getAttribute(testAttrs[ti]);
        if (val) {
          var attrSel = '[' + testAttrs[ti] + '="' + escapeCss(val) + '"]';
          try { if (document.querySelectorAll(attrSel).length === 1) return { selector: attrSel, strategy: 'test-attr' }; } catch(e) {}
        }
      }

      // 3. Escaped class combination (if unique)
      if (element.classList && element.classList.length > 0) {
        var classes = Array.from(element.classList);
        var classSel = classes.map(function(c) { return '.' + escapeCss(c); }).join('');
        try { if (classSel.length <= 500 && document.querySelectorAll(classSel).length === 1) return { selector: classSel, strategy: 'classes' }; } catch(e) {}
      }

      // 4. Bounded structural path with nth-child fallback
      var path = [];
      var current = element;
      var depth = 0;
      while (current && current !== document.body && depth < 15) {
        var segment = current.tagName.toLowerCase();
        if (current.id) {
          segment = '#' + escapeCss(current.id);
          path.unshift(segment);
          break;
        }
        if (current.classList && current.classList.length > 0) {
          segment += Array.from(current.classList).map(function(c) { return '.' + escapeCss(c); }).join('');
        }
        var parent = current.parentElement;
        if (parent) {
          var siblings = Array.from(parent.children);
          var index = siblings.indexOf(current) + 1;
          segment += ':nth-child(' + index + ')';
        }
        path.unshift(segment);
        current = parent;
        depth++;
      }
      return { selector: path.join(' > '), strategy: 'structural' };
    }

    function createOverlay() {
      overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:9998;border:2px solid #3b82f6;background:rgba(59,130,246,0.1);transition:all 0.15s ease;';
      document.body.appendChild(overlay);

      tooltip = document.createElement('div');
      tooltip.style.cssText = 'position:fixed;z-index:9999;background:#1e293b;color:white;padding:4px 8px;border-radius:4px;font-size:11px;pointer-events:none;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      document.body.appendChild(tooltip);
    }

    function updateHighlight(element) {
      if (!overlay) return;
      var rect = element.getBoundingClientRect();
      var z = parseFloat(document.documentElement.style.zoom) || 1;
      overlay.style.top = (rect.top / z) + 'px';
      overlay.style.left = (rect.left / z) + 'px';
      overlay.style.width = (rect.width / z) + 'px';
      overlay.style.height = (rect.height / z) + 'px';

      var tag = element.tagName.toLowerCase();
      var id = element.id ? '#' + element.id : '';
      var classes = Array.from(element.classList).map(function(c) { return '.' + c; }).join('');
      tooltip.textContent = tag + id + classes;
      tooltip.style.top = (rect.top / z - 28 / z) + 'px';
      tooltip.style.left = (rect.left / z) + 'px';
    }

    function inspectElement(element) {
      var styles = window.getComputedStyle(element);
      var rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        classes: Array.from(element.classList || []),
        text: (element.textContent || '').trim().substring(0, 300) || '',
        id: element.id || null,
        metadata: extractMetadata(element),
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

    function extractMetadata(element) {
      if (!element || !element.getAttributeNames) return [];
      var MAX = 20;
      var MAX_VAL = 200;
      var prefixes = ['data-testid', 'data-test', 'data-cy', 'data-qa', 'data-oe'];
      var deny = ['data-password', 'data-token', 'data-secret', 'data-auth', 'data-session', 'data-csrf'];
      var hints = [];
      var attrs = element.getAttributeNames().slice(0, MAX);
      for (var i = 0; i < attrs.length; i++) {
        var attr = attrs[i];
        if (deny.indexOf(attr) >= 0) continue;
        var matched = false;
        for (var p = 0; p < prefixes.length; p++) {
          if (attr === prefixes[p] || attr.indexOf(prefixes[p] + '-') === 0) { matched = true; break; }
        }
        if (!matched) continue;
        var val = element.getAttribute(attr);
        if (val == null) continue;
        hints.push({ name: attr, value: String(val).substring(0, MAX_VAL) });
      }
      return hints;
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

      var element = e.target;
      var selResult = generateSelector(element);
      var info = inspectElement(element);

      window.parent.postMessage({
        type: 'tackmark-element-selected',
        element: {
          selector: selResult.selector,
          selectorStrategy: selResult.strategy,
          ...info,
          mouse: { x: e.clientX, y: e.clientY }
        }
      }, '*');
    }

    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'tackmark-toggle-annotation') {
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

    // Design-preview auto-fit (preserved from upstream)
    var fitW = 0, fitH = 0;
    function fitPreview() {
      var docEl = document.documentElement;
      if (!fitW || !fitH) {
        fitW = docEl.scrollWidth || 0;
        fitH = docEl.scrollHeight || 0;
      }
      if (!fitW || !fitH) return;
      var scale = Math.min(window.innerWidth / fitW, window.innerHeight / fitH);
      // Guard against zero/negative scale (blank page or display:none)
      if (!isFinite(scale) || scale <= 0) return;
      var zoom = Math.min(scale, 1);
      docEl.style.zoom = zoom < 1 ? String(zoom) : '';
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

// Annotation input popup component
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

  // Popup positioning: follow mouse, clamp to iframe viewport
  const pos = element.popupPosition || element.position || { x: 0, y: 0 }
  const popupWidth = 260
  const popupHeight = 160
  const bound = element.viewportBounds
    || { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
  let left = pos.x + 12
  let top = pos.y + 16
  if (left + popupWidth > bound.right - 4) {
    left = pos.x - popupWidth - 12
  }
  if (left < bound.left + 4) left = bound.left + 4
  if (top + popupHeight > bound.bottom - 4) {
    top = pos.y - popupHeight - 12
  }
  if (top < bound.top + 4) top = bound.top + 4

  return jsxs('div', {
    className: 'fixed z-[9999] rounded-lg shadow-xl p-3 min-w-[250px]',
    style: {
      top: `${top}px`,
      left: `${left}px`,
      background: 'var(--ui-bg-elevated)',
      color: 'var(--ui-text-primary)',
      border: '1px solid var(--ui-stroke-secondary)',
    },
    onClick: (e) => e.stopPropagation(),
    children: [
      jsx('div', {
        className: 'text-xs mb-2 break-all',
        style: { color: 'var(--ui-accent-secondary)' },
        children: `${element.tag} ${element.classes.map(c => `.${c}`).join('')}`
      }),
      jsx('input', {
        ref: inputRef,
        type: 'text',
        className: 'w-full px-2 py-1.5 border rounded text-sm mb-2 focus:outline-none focus:ring-2',
        style: {
          background: 'var(--ui-bg-input)',
          color: 'var(--ui-text-primary)',
          border: '1px solid var(--ui-stroke-tertiary)',
        },
        placeholder: 'Add annotation...',
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
            style: { color: 'var(--ui-text-secondary)' },
            onClick: onCancel,
            children: 'Cancel'
          }),
          jsx('button', {
            className: 'px-2 py-1 text-xs rounded',
            style: { background: 'var(--ui-green)', color: 'var(--ui-text-primary)' },
            onClick: handleSubmit,
            children: 'Add'
          })
        ]
      })
    ]
  })
}

// Preview panel component
function PreviewPanel() {
  // `loadedUrl` is the URL currently loaded in the iframe (or being loaded).
  // `urlInput` is the text the user is typing in the input field.
  // Separating these prevents partial typing from being persisted or used
  // in annotation payloads, and lets us show a "loading" indicator.
  const [loadedUrl, setLoadedUrl] = useState(() => {
    const saved = pluginStorage.get('lastUrl')
    if (saved) return saved
    return DEFAULT_URL
  })
  const [urlInput, setUrlInput] = useState(loadedUrl)
  const [annotations, setAnnotations] = useState([])
  const [isAnnotating, setIsAnnotating] = useState(false)
  const isAnnotatingRef = useRef(false)
  const [selectedElement, setSelectedElement] = useState(null)
  const [showPopup, setShowPopup] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const iframeRef = useRef(null)

  // Handle iframe messages — uses strict schema validation
  useEffect(() => {
    const handleMessage = (event) => {
      const iframe = iframeRef.current
      if (!iframe || event.source !== iframe.contentWindow) return

      // Validate message through schema
      const result = validateMessage(event.data)
      if (!result.valid) return

      if (result.type === 'tackmark-ready') {
        if (isAnnotatingRef.current) {
          iframe.contentWindow.postMessage({
            type: 'tackmark-toggle-annotation',
            enabled: true
          }, '*')
        }
        return
      }

      if (result.type === 'tackmark-element-selected') {
        const element = result.element
        // Coordinate conversion: iframe-local → parent window
        const rect = iframe.getBoundingClientRect()
        element.popupPosition = {
          x: rect.left + (element.mouse?.x ?? element.position.x),
          y: rect.top + (element.mouse?.y ?? element.position.y)
        }
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

  // Initial load
  useEffect(() => {
    loadPage(loadedUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load page: fetch HTML → inject annotation script → srcdoc
  // If fetch fails (CORS), fall back to iframe.src with allow-same-origin
  // so the page loads with its resources. Annotation won't work in that
  // mode, but at least the page is visible.
  // Iterative fallback (no recursive self-healing)
  const loadPage = useCallback(async (targetUrl, isFallback = false) => {
    const iframe = iframeRef.current
    if (!iframe) return

    // URL validation: parsed local-first policy
    const policy = validatePreviewUrl(targetUrl)
    if (!policy.ok) {
      host.notify({ kind: 'error', message: policy.reason })
      return
    }

    setIsLoading(true)

    try {
      const cacheBust = targetUrl.includes('?') ? `&_t=${Date.now()}` : `?_t=${Date.now()}`
      const res = await fetch(targetUrl + cacheBust)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      let html = await res.text()
      const baseUrl = escapeHtmlAttr(targetUrl.replace(/[^/]*$/, ''))
      const baseTag = `<base href="${baseUrl}">`
      const scriptTag = `<script>${ANNOTATION_SCRIPT}<\/script>`
      if (/<\/head>/i.test(html)) {
        html = html.replace(/<\/head>/i, `${baseTag}${scriptTag}</head>`)
      } else {
        html = baseTag + scriptTag + html
      }
      iframe.srcdoc = html
      // Switch to sandbox with allow-scripts only (annotation works)
      iframe.sandbox = 'allow-scripts'
      // Persist the loaded URL
      pluginStorage.set('lastUrl', targetUrl)
      setLoadedUrl(targetUrl)
      setUrlInput(targetUrl)
      setLoadFailed(false)
    } catch (e) {
      // Fetch failed (likely CORS). Fall back to loading the URL directly
      // in the iframe with allow-same-origin so resources load. Annotation
      // mode won't work in this fallback, but the page is at least visible.
      iframe.sandbox = 'allow-scripts allow-same-origin'
      iframe.src = targetUrl
      pluginStorage.set('lastUrl', targetUrl)
      setLoadedUrl(targetUrl)
      setUrlInput(targetUrl)
      setLoadFailed(true)
      host.notify({ kind: 'warning', message: `Loaded directly (annotation disabled): ${e?.message || e}` })
    } finally {
      setIsLoading(false)
    }
  }, [])

  const toggleAnnotation = useCallback(() => {
    const newState = !isAnnotating
    setIsAnnotating(newState)
    isAnnotatingRef.current = newState

    const iframe = iframeRef.current
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'tackmark-toggle-annotation',
        enabled: newState
      }, '*')
    }
  }, [isAnnotating])

  // Add annotation — uses UUID-based createAnnotation
  const handleAddAnnotation = useCallback((comment) => {
    if (!selectedElement) return

    const newAnnotation = createAnnotation({
      page: { url: loadedUrl },
      target: {
        selector: selectedElement.selector,
        selectorStrategy: selectedElement.selectorStrategy,
        tag: selectedElement.tag,
        id: selectedElement.id,
        classes: selectedElement.classes,
        text: selectedElement.text,
        metadata: selectedElement.metadata,
        rect: selectedElement.position,
        styles: selectedElement.styles,
      },
      note: comment,
    })

    setAnnotations(prev => [...prev, newAnnotation])
    setShowPopup(false)
    setSelectedElement(null)

    haptic('success')
    host.notify({ kind: 'success', message: 'Annotation added' })
  }, [selectedElement, loadedUrl])

  // Send annotations to agent — uses focused session + streaming success detection
  const sendToAgent = useCallback(async () => {
    const pending = annotations.filter(a => a.status === 'pending')

    if (pending.length === 0) {
      host.notify({ kind: 'warning', message: 'No pending annotations' })
      return
    }

    // Check send safety: focused session + not busy
    const safety = checkSendSafety(host)
    if (!safety.safe) {
      host.notify({ kind: 'error', message: safety.reason })
      return
    }

    // Mark as sending
    setAnnotations(prev => prev.map(a =>
      a.status === 'pending' ? { ...a, status: 'sending' } : a
    ))

    try {
      // Format structured payload with untrusted-content framing
      const text = formatAgentPrompt({
        annotations: pending,
        page: { url: loadedUrl },
        session: { id: safety.sessionId },
      })

      const result = await host.request('prompt.submit', {
        session_id: safety.sessionId,
        text
      })

      // Check success against actual streaming contract
      const submitResult = checkSubmitSuccess(result)
      if (submitResult.success) {
        setAnnotations(prev => prev.map(a =>
          a.status === 'sending' ? { ...a, status: 'sent' } : a
        ))
        host.notify({ kind: 'success', message: `Sent ${pending.length} annotation(s)` })
      } else {
        setAnnotations(prev => prev.map(a =>
          a.status === 'sending' ? { ...a, status: 'error' } : a
        ))
        host.notify({ kind: 'error', message: 'Send failed: ' + submitResult.reason })
      }
    } catch (error) {
      setAnnotations(prev => prev.map(a =>
        a.status === 'sending' ? { ...a, status: 'error' } : a
      ))
      host.notify({ kind: 'error', message: 'Send failed: ' + error.message })
    }
  }, [annotations, loadedUrl])

  const clearAnnotations = useCallback(() => {
    setAnnotations([])
    host.notify({ kind: 'info', message: 'Cleared all annotations' })
  }, [])

  const pendingCount = annotations.filter(a => a.status === 'pending').length

  return jsxs('div', {
    className: 'flex h-full flex-col',
    children: [
      // Toolbar
      jsxs('div', {
        className: 'flex items-center gap-2 p-2 border-b',
        style: {
          borderColor: 'var(--ui-stroke-secondary)',
          background: 'var(--ui-bg-chrome)',
        },
        children: [
          jsx('input', {
            type: 'text',
            className: 'flex-1 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-2',
            style: {
              borderColor: 'var(--ui-stroke-tertiary)',
              background: 'var(--ui-bg-input)',
              color: 'var(--ui-text-primary)',
            },
            placeholder: 'http://localhost:3000',
            value: urlInput,
            onChange: (e) => setUrlInput(e.target.value),
            onKeyDown: (e) => {
              if (e.key === 'Enter') {
                loadPage(urlInput.trim())
              }
            }
          }),
          jsx('button', {
            className: 'px-2 py-1 text-xs rounded',
            style: {
              background: isLoading ? 'var(--ui-stroke-tertiary)' : 'var(--ui-accent-secondary)',
              color: 'var(--ui-text-primary)',
              opacity: isLoading ? 0.6 : 1,
            },
            onClick: () => loadPage(urlInput.trim()),
            disabled: isLoading,
            children: isLoading ? 'Loading…' : 'Load'
          }),
          jsx('button', {
            className: 'px-2 py-1 text-xs',
            style: { color: 'var(--ui-text-tertiary)' },
            onClick: () => loadPage(loadedUrl),
            disabled: isLoading,
            children: '↻'
          }),
          jsx('button', {
            className: 'px-2 py-1 text-xs',
            style: { color: isAnnotating ? 'var(--ui-green)' : 'var(--ui-text-tertiary)' },
            onClick: toggleAnnotation,
            children: isAnnotating ? '🎯 Annotating' : '📌 Annotate'
          }),
          jsx('button', {
            className: 'px-2 py-1 text-xs rounded disabled:opacity-50',
            style: { background: 'var(--ui-green)', color: 'var(--ui-text-primary)' },
            onClick: sendToAgent,
            disabled: pendingCount === 0,
            children: `Send (${pendingCount})`
          }),
          jsx('button', {
            className: 'px-2 py-1 text-xs',
            style: { color: 'var(--ui-text-tertiary)' },
            onClick: clearAnnotations,
            children: 'Clear'
          })
        ]
      }),
      // Preview area
      jsxs('div', {
        className: 'flex-1 relative',
        children: [
          jsx('iframe', {
            ref: iframeRef,
            className: 'w-full h-full border-0',
            sandbox: 'allow-scripts',
          }),
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

// Status bar chip
function StatusChip() {
  return jsx('button', {
    className: 'inline-flex h-full items-center gap-1 px-1.5 text-[0.6875rem] transition-colors text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover)',
    onClick: () => {
      haptic('tap')
      host.notify({ kind: 'info', message: 'TackMark loaded' })
    },
    children: '📌'
  })
}

// Plugin export
export default {
  id: ID,
  name: 'TackMark',
  register(ctx) {
    // Wire plugin-scoped storage (replaces direct localStorage)
    if (ctx.storage) {
      pluginStorage._impl = ctx.storage
    }

    // i18n
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

    // Register preview panel
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

    // Register status bar chip
    ctx.register({
      id: 'chip',
      area: 'statusBar.right',
      order: 130,
      render: () => jsx(StatusChip, {})
    })
  }
}
