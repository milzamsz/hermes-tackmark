/**
 * hermes-tackmark — Visual feedback for Hermes Agent
 * Click elements, annotate, and let AI fix code.
 *
 * Hardened fork of freehul/tackmark.
 * Uses extracted core modules for selector, URL policy, session, schema, payload.
 */

import { Badge, Button, Codicon, EmptyState, Input, KEYBINDS_AREA, PALETTE_AREA, StatusDot, Tip, host, haptic } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useState, useEffect, useCallback, useRef } from 'react'

// Re-export preserved upstream functions for backward compatibility
export { normalizeFilePath } from './core/normalize-path.js'
export { isAllowedPreviewUrl } from './core/url-policy.js'
export { escapeHtmlAttr } from './core/html.js'

import { validatePreviewUrl } from './core/url-policy.js'
import { escapeHtmlAttr } from './core/html.js'

import { validateMessage, createAnnotation } from './core/annotation-schema.js'
import { formatAgentPrompt } from './core/payload.js'
import { draftInComposer } from './core/composer-draft.js'
import { normalizeZoomPercent, stepZoomPercent } from './core/zoom.js'
import { clampLauncherPosition } from './core/launcher-position.js'

const ID = 'hermes-tackmark'
const TOGGLE_SELECTION_EVENT = 'hermes-tackmark:toggle-selection'
const WINDOW_STATE_EVENT = 'hermes-tackmark:window-state'

function requestToggleSelection() {
  showFloatingBrowser()
  window.dispatchEvent(new Event(TOGGLE_SELECTION_EVENT))
}

function notifyWindowState(minimized) {
  window.dispatchEvent(new CustomEvent(WINDOW_STATE_EVENT, { detail: { minimized: Boolean(minimized) } }))
}

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


const FLOATING_BROWSER_SELECTOR = '[data-floating-pane$="floating-browser"]'
const FLOATING_POSITIONS_KEY = 'hermes.desktop.floatingPanes.v1'

function clearLegacyCollapsedState() {
  try {
    const state = JSON.parse(localStorage.getItem(FLOATING_POSITIONS_KEY) || '{}')
    const paneId = `${ID}:floating-browser`
    if (state[paneId]?.collapsed) {
      state[paneId] = { ...state[paneId], collapsed: false }
      localStorage.setItem(FLOATING_POSITIONS_KEY, JSON.stringify(state))
    }
  } catch {}
}
let maximizedRestore = null
let minimizedRestoreSize = null
let launcherDragged = false

function floatingBrowserCard() {
  return document.querySelector(FLOATING_BROWSER_SELECTOR)
}

function nativeCollapseButton(card) {
  return card?.querySelector('header [data-floating-no-drag]') || null
}

function floatingBrowserExpanded(card) {
  return !card?.querySelector('.codicon-chevron-up')
}

function restoreLegacyNativeCollapse(card) {
  if (!card || floatingBrowserExpanded(card)) return false
  nativeCollapseButton(card)?.click()
  return true
}

function showFloatingBrowser() {
  const card = floatingBrowserCard()
  if (!card) return false
  card.style.display = ''
  restoreLegacyNativeCollapse(card)
  if (minimizedRestoreSize) {
    card.style.width = minimizedRestoreSize.width
    card.style.height = minimizedRestoreSize.height
    minimizedRestoreSize = null
  }
  pluginStorage.set('windowHidden', 'false')
  notifyWindowState(false)
  return true
}

function hideFloatingBrowser() {
  const card = floatingBrowserCard()
  if (!card) return false
  card.style.display = 'none'
  pluginStorage.set('windowHidden', 'true')
  return true
}

function toggleFloatingBrowser() {
  const card = floatingBrowserCard()
  if (!card) return false
  if (card.style.display === 'none' || minimizedRestoreSize || !floatingBrowserExpanded(card)) return showFloatingBrowser()
  return hideFloatingBrowser()
}

function minimizeFloatingBrowser() {
  const card = floatingBrowserCard()
  if (!card) return false
  card.style.display = ''
  if (!minimizedRestoreSize) {
    const rect = card.getBoundingClientRect()
    minimizedRestoreSize = {
      width: card.style.width || `${rect.width}px`,
      height: card.style.height || `${rect.height}px`,
    }
  }
  card.style.width = '360px'
  card.style.height = '220px'
  notifyWindowState(true)
  return true
}

function toggleMaximizeFloatingBrowser() {
  const card = floatingBrowserCard()
  if (!card) return false
  showFloatingBrowser()
  if (!maximizedRestore) {
    maximizedRestore = {
      left: card.style.left,
      top: card.style.top,
      width: card.style.width,
      height: card.style.height,
    }
    card.style.left = '8px'
    card.style.top = '42px'
    card.style.width = `${Math.max(420, window.innerWidth - 16)}px`
    card.style.height = `${Math.max(300, window.innerHeight - 50)}px`
  } else {
    Object.assign(card.style, maximizedRestore)
    maximizedRestore = null
  }
  return true
}

function applyStoredFloatingSize() {
  const card = floatingBrowserCard()
  if (!card) return
  try {
    const size = JSON.parse(pluginStorage.get('windowSize') || 'null')
    if (size?.width >= 420 && size?.height >= 300) {
      card.style.width = `${size.width}px`
      card.style.height = `${size.height}px`
    }
  } catch {}
  const collapse = nativeCollapseButton(card)
  if (collapse) collapse.style.display = 'none'
  if (pluginStorage.get('windowHidden') === 'true') card.style.display = 'none'
}

function beginFloatingResize(event) {
  const card = floatingBrowserCard()
  if (!card) return
  event.preventDefault()
  event.stopPropagation()
  showFloatingBrowser()
  maximizedRestore = null
  const start = {
    x: event.clientX,
    y: event.clientY,
    width: card.getBoundingClientRect().width,
    height: card.getBoundingClientRect().height,
  }
  const shield = document.createElement('div')
  shield.style.cssText = 'position:fixed;inset:0;z-index:2147483646;cursor:nwse-resize;'
  document.body.appendChild(shield)
  const move = moveEvent => {
    const maxWidth = Math.max(420, window.innerWidth - card.getBoundingClientRect().left - 8)
    const maxHeight = Math.max(300, window.innerHeight - card.getBoundingClientRect().top - 8)
    const width = Math.min(maxWidth, Math.max(420, start.width + moveEvent.clientX - start.x))
    const height = Math.min(maxHeight, Math.max(300, start.height + moveEvent.clientY - start.y))
    card.style.width = `${Math.round(width)}px`
    card.style.height = `${Math.round(height)}px`
  }
  const stop = () => {
    shield.removeEventListener('pointermove', move)
    shield.removeEventListener('pointerup', stop)
    shield.remove()
    const rect = card.getBoundingClientRect()
    pluginStorage.set('windowSize', JSON.stringify({ width: Math.round(rect.width), height: Math.round(rect.height) }))
  }
  shield.addEventListener('pointermove', move)
  shield.addEventListener('pointerup', stop)
}



function applyStoredLauncherPosition(card) {
  if (!card) return
  let stored = null
  try { stored = JSON.parse(pluginStorage.get('launcherPosition') || 'null') } catch {}
  const current = card.getBoundingClientRect()
  const position = clampLauncherPosition(
    stored || { x: current.left, y: current.top },
    { width: window.innerWidth, height: window.innerHeight, top: 34 },
    { width: 44, height: 44 },
  )
  card.style.left = `${position.x}px`
  card.style.top = `${position.y}px`
}

function beginLauncherDrag(event) {
  const card = event.currentTarget?.closest('[data-floating-pane]')
  if (!card) return
  event.stopPropagation()
  launcherDragged = false
  const rect = card.getBoundingClientRect()
  const start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top }
  const shield = document.createElement('div')
  shield.style.cssText = 'position:fixed;inset:0;z-index:2147483646;cursor:grabbing;'
  document.body.appendChild(shield)
  const move = moveEvent => {
    const dx = moveEvent.clientX - start.x
    const dy = moveEvent.clientY - start.y
    if (Math.abs(dx) + Math.abs(dy) > 4) launcherDragged = true
    const position = clampLauncherPosition(
      { x: start.left + dx, y: start.top + dy },
      { width: window.innerWidth, height: window.innerHeight, top: 34 },
      { width: 44, height: 44 },
    )
    card.style.left = `${position.x}px`
    card.style.top = `${position.y}px`
  }
  const stop = () => {
    shield.removeEventListener('pointermove', move)
    shield.removeEventListener('pointerup', stop)
    shield.remove()
    const finalRect = card.getBoundingClientRect()
    pluginStorage.set('launcherPosition', JSON.stringify({ x: Math.round(finalRect.left), y: Math.round(finalRect.top) }))
    if (!launcherDragged) {
      haptic('tap')
      toggleFloatingBrowser()
    }
    launcherDragged = false
  }
  shield.addEventListener('pointermove', move)
  shield.addEventListener('pointerup', stop)
}


/**
 * Annotation layer script — injected into Electron's isolated preview webview.
 * Self-contained because executeJavaScript runs it inside the guest page; the
 * embedder reads a bounded message queue through the same isolated channel.
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
    if (window.__tackmarkInstalled) return;
    window.__tackmarkInstalled = true;
    window.__tackmarkQueue = [];
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
        outerHTML: (element.outerHTML || '').substring(0, 2000),
        contextHTML: (element.parentElement && element.parentElement.outerHTML || '').substring(0, 3500),
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
      var prefixes = ['data-testid', 'data-test', 'data-cy', 'data-qa', 'data-oe', 'data-astro', 'data-source', 'data-file', 'data-line'];
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

      window.__tackmarkQueue.push({
        type: 'tackmark-element-selected',
        element: {
          selector: selResult.selector,
          selectorStrategy: selResult.strategy,
          ...info,
          mouse: { x: e.clientX, y: e.clientY }
        }
      });
    }

    window.__tackmarkSetEnabled = function(enabled) {
      isAnnotating = Boolean(enabled);
      if (isAnnotating && !overlay) createOverlay();
      if (overlay) overlay.style.display = isAnnotating ? 'block' : 'none';
      if (tooltip) tooltip.style.display = isAnnotating ? 'block' : 'none';
      return isAnnotating;
    };

    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('wheel', function(event) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      window.__tackmarkQueue.push({ type: 'tackmark-zoom', deltaY: event.deltaY });
    }, { capture: true, passive: false });
  })();
`

// Annotation input popup component
function AnnotationPopup({ element, onSubmit, onCancel }) {
  const [comment, setComment] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = () => {
    const note = comment.trim()
    if (note) onSubmit(note)
  }

  const pos = element.popupPosition || element.position || { x: 0, y: 0 }
  const popupWidth = 320
  const popupHeight = 150
  const bound = element.viewportBounds
    || { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
  let left = pos.x + 12
  let top = pos.y + 16
  if (left + popupWidth > bound.right - 8) left = pos.x - popupWidth - 12
  if (left < bound.left + 8) left = bound.left + 8
  if (top + popupHeight > bound.bottom - 8) top = pos.y - popupHeight - 12
  if (top < bound.top + 8) top = bound.top + 8

  const identity = element.id
    ? `${element.tag}#${element.id}`
    : element.classes?.length
      ? `${element.tag}.${element.classes.slice(0, 2).join('.')}`
      : element.tag

  return jsxs('div', {
    className: 'fixed z-[9999] w-80 rounded-md border border-border/70 bg-background p-3 shadow-xl',
    style: { top: `${top}px`, left: `${left}px` },
    onClick: event => event.stopPropagation(),
    children: [
      jsx('div', {
        className: 'mb-1 text-xs font-medium text-foreground',
        children: 'Describe the change',
      }),
      jsx('div', {
        className: 'mb-2 truncate font-mono text-[0.6875rem] text-muted-foreground',
        title: element.selector || identity,
        children: identity,
      }),
      jsx(Input, {
        ref: inputRef,
        size: 'sm',
        className: 'w-full',
        placeholder: 'What should change?',
        value: comment,
        onChange: event => setComment(event.target.value),
        onKeyDown: event => {
          if (event.key === 'Enter') handleSubmit()
          if (event.key === 'Escape') onCancel()
        },
      }),
      jsxs('div', {
        className: 'mt-3 flex justify-end gap-1.5',
        children: [
          jsx(Button, {
            variant: 'text',
            size: 'sm',
            onClick: onCancel,
            children: 'Cancel',
          }),
          jsx(Button, {
            variant: 'default',
            size: 'sm',
            disabled: !comment.trim(),
            onClick: handleSubmit,
            children: 'Add feedback',
          }),
        ],
      }),
    ],
  })
}

// Preview panel component
function PreviewPanel() {
  const [loadedUrl, setLoadedUrl] = useState(() => pluginStorage.get('lastUrl') || '')
  const [urlInput, setUrlInput] = useState(loadedUrl)
  const [history, setHistory] = useState({ back: false, forward: false })
  const [zoomPercent, setZoomPercent] = useState(() =>
    normalizeZoomPercent(pluginStorage.get('zoomPercent'), 100)
  )
  const zoomPercentRef = useRef(zoomPercent)
  const [annotations, setAnnotations] = useState([])
  const [isAnnotating, setIsAnnotating] = useState(false)
  const isAnnotatingRef = useRef(false)
  const [selectedElement, setSelectedElement] = useState(null)
  const [showPopup, setShowPopup] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [annotationReady, setAnnotationReady] = useState(false)
  const annotationReadyRef = useRef(false)
  const [loadError, setLoadError] = useState('')
  const [windowMinimized, setWindowMinimized] = useState(false)
  const previewHostRef = useRef(null)
  const webviewRef = useRef(null)

  const applyAnnotationMode = useCallback(async enabled => {
    const webview = webviewRef.current
    if (!webview?.executeJavaScript) return false
    try {
      return Boolean(await webview.executeJavaScript(
        `window.__tackmarkSetEnabled ? window.__tackmarkSetEnabled(${Boolean(enabled)}) : false`
      ))
    } catch {
      return false
    }
  }, [])

  const handleSelectedElement = useCallback(element => {
    const webview = webviewRef.current
    if (!webview) return
    const result = validateMessage({ type: 'tackmark-element-selected', element })
    if (!result.valid) return
    const rect = webview.getBoundingClientRect()
    const selected = result.element
    selected.popupPosition = {
      x: rect.left + (selected.mouse?.x ?? selected.position.x),
      y: rect.top + (selected.mouse?.y ?? selected.position.y),
    }
    selected.viewportBounds = {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    }
    setSelectedElement(selected)
    setShowPopup(true)
  }, [])

  useEffect(() => {
    const update = event => setWindowMinimized(Boolean(event.detail?.minimized))
    window.addEventListener(WINDOW_STATE_EVENT, update)
    return () => window.removeEventListener(WINDOW_STATE_EVENT, update)
  }, [])

  useEffect(() => {
    const hostElement = previewHostRef.current
    if (!hostElement) return

    const webview = document.createElement('webview')
    webview.className = 'h-full w-full flex-1 bg-transparent'
    webview.setAttribute('partition', 'persist:hermes-preview')
    webview.setAttribute('webpreferences', 'contextIsolation=yes,nodeIntegration=no,sandbox=yes')
    webview.setAttribute('src', loadedUrl || 'about:blank')

    const onStart = () => {
      setIsLoading(true)
      setLoadError('')
      annotationReadyRef.current = false
      setAnnotationReady(false)
    }
    const onReady = async () => {
      setIsLoading(false)
      try {
        await webview.executeJavaScript(ANNOTATION_SCRIPT)
        setHistory({ back: webview.canGoBack?.() || false, forward: webview.canGoForward?.() || false })
        webview.setZoomFactor?.(zoomPercentRef.current / 100)
        annotationReadyRef.current = true
        setAnnotationReady(true)
        await webview.executeJavaScript(
          `window.__tackmarkSetEnabled && window.__tackmarkSetEnabled(${Boolean(isAnnotatingRef.current)})`
        )
      } catch (error) {
        annotationReadyRef.current = false
        setAnnotationReady(false)
        setLoadError(`Page opened, but annotation injection failed: ${error?.message || error}`)
      }
    }
    let lastAllowedUrl = ''
    const initialPolicy = validatePreviewUrl(loadedUrl || '')
    if (initialPolicy.ok) lastAllowedUrl = initialPolicy.url.href

    const guardNavigation = event => {
      const nextUrl = event?.url || ''
      if (!nextUrl || nextUrl === 'about:blank') return true
      const policy = validatePreviewUrl(nextUrl)
      if (policy.ok) {
        lastAllowedUrl = policy.url.href
        return true
      }
      event?.preventDefault?.()
      setLoadError(`Blocked navigation to ${nextUrl}. TackMark previews loopback URLs only.`)
      return false
    }
    const onNavigate = event => {
      const nextUrl = event?.url || webview.getURL?.() || ''
      if (!nextUrl || nextUrl === 'about:blank') return
      if (!guardNavigation(event)) {
        webview.stop?.()
        if (lastAllowedUrl && webview.getURL?.() !== lastAllowedUrl) {
          webview.loadURL(lastAllowedUrl).catch(() => {})
        }
        return
      }
      setLoadedUrl(nextUrl)
      setUrlInput(nextUrl)
      pluginStorage.set('lastUrl', nextUrl)
      setHistory({ back: webview.canGoBack?.() || false, forward: webview.canGoForward?.() || false })
    }
    const onWillNavigate = event => { guardNavigation(event) }
    const onNewWindow = event => {
      if (!guardNavigation(event)) return
      event?.preventDefault?.()
      webview.loadURL(event.url).catch(() => {})
    }
    const onFail = event => {
      if (event?.errorCode === -3) return
      setIsLoading(false)
      annotationReadyRef.current = false
      setAnnotationReady(false)
      const failedUrl = event?.validatedURL || urlInput || 'the page'
      setLoadError(`Unable to connect to ${failedUrl}. Check that the local dev server is running.`)
    }

    webview.addEventListener('did-start-loading', onStart)
    webview.addEventListener('dom-ready', onReady)
    webview.addEventListener('will-navigate', onWillNavigate)
    webview.addEventListener('new-window', onNewWindow)
    webview.addEventListener('did-navigate', onNavigate)
    webview.addEventListener('did-navigate-in-page', onNavigate)
    webview.addEventListener('did-fail-load', onFail)
    hostElement.replaceChildren(webview)
    webviewRef.current = webview
    window.setTimeout(applyStoredFloatingSize, 0)


    const poll = window.setInterval(async () => {
      if (!webview.executeJavaScript || !annotationReadyRef.current) return
      try {
        const messages = await webview.executeJavaScript(
          `(() => { const q = window.__tackmarkQueue || []; return q.splice(0, q.length); })()`
        )
        if (Array.isArray(messages)) {
          for (const message of messages) {
            if (message?.type === 'tackmark-zoom') {
              const next = stepZoomPercent(zoomPercentRef.current, message.deltaY < 0 ? 1 : -1)
              zoomPercentRef.current = next
              setZoomPercent(next)
              pluginStorage.set('zoomPercent', String(next))
              webview.setZoomFactor?.(next / 100)
              continue
            }
            const result = validateMessage(message)
            if (result.valid && result.type === 'tackmark-element-selected') {
              handleSelectedElement(result.element)
            }
          }
        }
      } catch {}
    }, 160)

    return () => {
      window.clearInterval(poll)
      webview.removeEventListener('did-start-loading', onStart)
      webview.removeEventListener('dom-ready', onReady)
      webview.removeEventListener('will-navigate', onWillNavigate)
      webview.removeEventListener('new-window', onNewWindow)
      webview.removeEventListener('did-navigate', onNavigate)
      webview.removeEventListener('did-navigate-in-page', onNavigate)
      webview.removeEventListener('did-fail-load', onFail)
      hostElement.replaceChildren()
      webviewRef.current = null
    }
  }, [handleSelectedElement])

  const loadPage = useCallback(targetUrl => {
    const input = String(targetUrl || '').trim()
    if (!input) {
      setLoadedUrl('')
      setUrlInput('')
      setLoadError('')
      annotationReadyRef.current = false
      setAnnotationReady(false)
      pluginStorage.remove('lastUrl')
      webviewRef.current?.loadURL?.('about:blank')
      return
    }
    const normalized = /^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `http://${input}`
    const policy = validatePreviewUrl(normalized)
    if (!policy.ok) {
      setLoadError(policy.reason)
      return
    }
    setLoadError('')
    setIsLoading(true)
    setLoadedUrl(policy.url.href)
    setUrlInput(policy.url.href)
    pluginStorage.set('lastUrl', policy.url.href)
    const webview = webviewRef.current
    if (!webview?.loadURL) {
      setIsLoading(false)
      setLoadError('Preview webview is not ready. Reload desktop plugins and try again.')
      return
    }
    webview.loadURL(policy.url.href).catch(error => {
      setIsLoading(false)
      setLoadError(`Unable to connect to ${policy.url.href}. Check that the local dev server is running.`)
    })
  }, [])

  const reloadPage = useCallback(() => {
    const webview = webviewRef.current
    if (webview?.reload) {
      setLoadError('')
      webview.reload()
    } else if (loadedUrl) {
      loadPage(loadedUrl)
    }
  }, [loadPage, loadedUrl])

  const toggleAnnotation = useCallback(async () => {
    const next = !isAnnotatingRef.current
    if (!annotationReadyRef.current) {
      host.notify({ kind: 'warning', message: 'Open a page and wait for annotation mode to become ready.' })
      return
    }
    const applied = await applyAnnotationMode(next)
    if (!applied && next) {
      host.notify({ kind: 'error', message: 'Could not enable annotation mode on this page.' })
      return
    }
    isAnnotatingRef.current = next
    setIsAnnotating(next)
    haptic('tap')
  }, [applyAnnotationMode])

  useEffect(() => {
    const toggle = () => { void toggleAnnotation() }
    window.addEventListener(TOGGLE_SELECTION_EVENT, toggle)
    return () => window.removeEventListener(TOGGLE_SELECTION_EVENT, toggle)
  }, [toggleAnnotation])

  const setPageZoom = useCallback(nextValue => {
    const next = normalizeZoomPercent(nextValue, 100)
    zoomPercentRef.current = next
    setZoomPercent(next)
    pluginStorage.set('zoomPercent', String(next))
    webviewRef.current?.setZoomFactor?.(next / 100)
  }, [])

  const zoomOut = useCallback(() => setPageZoom(stepZoomPercent(zoomPercentRef.current, -1)), [setPageZoom])
  const zoomIn = useCallback(() => setPageZoom(stepZoomPercent(zoomPercentRef.current, 1)), [setPageZoom])
  const resetZoom = useCallback(() => setPageZoom(100), [setPageZoom])
  const handleHostWheel = useCallback(event => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    setPageZoom(stepZoomPercent(zoomPercentRef.current, event.deltaY < 0 ? 1 : -1))
  }, [setPageZoom])

  const captureElementScreenshot = useCallback(async element => {
    const webview = webviewRef.current
    const rect = element?.position
    if (!webview?.capturePage || !rect || rect.width <= 0 || rect.height <= 0) return null
    try {
      const image = await webview.capturePage({
        x: Math.max(0, Math.floor(rect.x - 8)),
        y: Math.max(0, Math.floor(rect.y - 8)),
        width: Math.max(1, Math.ceil(rect.width + 16)),
        height: Math.max(1, Math.ceil(rect.height + 16)),
      })
      if (!image || image.isEmpty?.()) return null
      const response = await fetch(image.toDataURL())
      return await response.blob()
    } catch {
      return null
    }
  }, [])

  const handleAddAnnotation = useCallback(async comment => {
    if (!selectedElement) return
    const screenshot = await captureElementScreenshot(selectedElement)
    const newAnnotation = createAnnotation({
      page: { url: loadedUrl },
      target: {
        selector: selectedElement.selector,
        selectorStrategy: selectedElement.selectorStrategy,
        tag: selectedElement.tag,
        id: selectedElement.id,
        classes: selectedElement.classes,
        text: selectedElement.text,
        outerHTML: selectedElement.outerHTML,
        contextHTML: selectedElement.contextHTML,
        metadata: selectedElement.metadata,
        rect: selectedElement.position,
        styles: selectedElement.styles,
      },
      note: comment,
      screenshot,
    })
    setAnnotations(previous => [...previous, newAnnotation])
    setShowPopup(false)
    setSelectedElement(null)
    haptic('success')
    host.notify({ kind: 'success', message: 'Annotation added' })
  }, [captureElementScreenshot, selectedElement, loadedUrl])

  const draftToChat = useCallback(() => {
    const pending = annotations.filter(annotation => annotation.status === 'pending')
    if (pending.length === 0) return
    const text = formatAgentPrompt({ annotations: pending, page: { url: loadedUrl } })
    const images = pending.map(annotation => annotation.screenshot).filter(Boolean)
    if (!draftInComposer(text, images)) {
      host.notify({ kind: 'error', message: 'Could not create a Hermes chat draft.' })
      return
    }
    setAnnotations(previous => previous.map(annotation =>
      annotation.status === 'pending' ? { ...annotation, status: 'drafted' } : annotation
    ))
    haptic('success')
    host.notify({
      kind: 'success',
      message: `Drafted ${pending.length} annotation(s) in chat — edit and send when ready.`,
    })
  }, [annotations, loadedUrl])

  const clearAnnotations = useCallback(() => {
    setAnnotations([])
    setShowPopup(false)
    setSelectedElement(null)
  }, [])

  const goBack = useCallback(() => {
    const webview = webviewRef.current
    if (webview?.canGoBack?.()) webview.goBack?.()
  }, [])

  const goForward = useCallback(() => {
    const webview = webviewRef.current
    if (webview?.canGoForward?.()) webview.goForward?.()
  }, [])

  const pendingCount = annotations.filter(annotation => annotation.status === 'pending').length

  return jsxs('div', {
    className: 'flex h-full min-h-0 flex-col bg-background',
    onWheel: handleHostWheel,
    children: [
      jsxs('div', {
        className: 'flex h-9 shrink-0 items-center gap-1 border-b border-border/60 bg-background px-2',
        children: windowMinimized ? [
          jsx('span', {
            className: 'min-w-0 flex-1 truncate px-1 text-[0.6875rem] font-medium text-foreground',
            children: 'TackMark — compact',
          }),
          jsx(Tip, {
            label: 'Restore browser',
            children: jsx(Button, {
              variant: 'ghost',
              size: 'icon-xs',
              onClick: showFloatingBrowser,
              children: jsx(Codicon, { name: 'chrome-restore' }),
            }),
          }),
          jsx(Tip, {
            label: 'Hide browser',
            children: jsx(Button, {
              variant: 'ghost',
              size: 'icon-xs',
              onClick: hideFloatingBrowser,
              children: jsx(Codicon, { name: 'close' }),
            }),
          }),
        ] : [
          jsx(Tip, {
            label: 'Back',
            children: jsx(Button, {
              variant: 'ghost',
              size: 'icon-xs',
              disabled: !history.back,
              onClick: goBack,
              children: jsx(Codicon, { name: 'arrow-left' }),
            }),
          }),
          jsx(Tip, {
            label: 'Forward',
            children: jsx(Button, {
              variant: 'ghost',
              size: 'icon-xs',
              disabled: !history.forward,
              onClick: goForward,
              children: jsx(Codicon, { name: 'arrow-right' }),
            }),
          }),
          jsx(Tip, {
            label: 'Reload',
            children: jsx(Button, {
              variant: 'ghost',
              size: 'icon-xs',
              disabled: !loadedUrl || isLoading,
              onClick: reloadPage,
              children: jsx(Codicon, { name: 'refresh', spinning: isLoading }),
            }),
          }),
          jsx(Input, {
            size: 'sm',
            containerClassName: 'min-w-0 flex-1 bg-(--ui-bg-secondary)',
            className: 'font-mono text-[0.6875rem]',
            prefix: jsx(Codicon, { name: 'globe', className: 'text-muted-foreground' }),
            suffix: jsx(Tip, {
              label: annotationReady ? 'Annotation ready' : isLoading ? 'Loading page' : 'No page loaded',
              children: jsx(StatusDot, { tone: annotationReady ? 'good' : isLoading ? 'warn' : 'muted' }),
            }),
            placeholder: 'localhost:4321',
            value: urlInput,
            onChange: event => setUrlInput(event.target.value),
            onKeyDown: event => { if (event.key === 'Enter') loadPage(urlInput) },
            'aria-label': 'Preview URL',
          }),
          jsx(Tip, {
            label: 'Zoom out',
            children: jsx(Button, {
              variant: 'ghost',
              size: 'icon-xs',
              disabled: zoomPercent <= 50,
              onClick: zoomOut,
              children: jsx(Codicon, { name: 'zoom-out' }),
            }),
          }),
          jsx(Tip, {
            label: 'Reset page zoom',
            children: jsx(Button, {
              variant: 'text',
              size: 'micro',
              className: 'w-10 justify-center font-mono tabular-nums',
              onClick: resetZoom,
              children: `${zoomPercent}%`,
            }),
          }),
          jsx(Tip, {
            label: 'Zoom in',
            children: jsx(Button, {
              variant: 'ghost',
              size: 'icon-xs',
              disabled: zoomPercent >= 200,
              onClick: zoomIn,
              children: jsx(Codicon, { name: 'zoom-in' }),
            }),
          }),
          jsx(Tip, {
            label: 'Open URL',
            children: jsx(Button, {
              variant: 'ghost',
              size: 'icon-xs',
              disabled: isLoading,
              onClick: () => loadPage(urlInput),
              children: jsx(Codicon, { name: 'go-to-file' }),
            }),
          }),
        ],
      }),
      jsxs('div', {
        className: windowMinimized ? 'hidden' : 'flex h-8 shrink-0 items-center gap-1 border-b border-border/60 bg-background px-2',
        children: [
          jsxs(Button, {
            variant: isAnnotating ? 'secondary' : 'ghost',
            size: 'xs',
            disabled: !annotationReady,
            onClick: toggleAnnotation,
            children: [
              jsx(Codicon, { name: isAnnotating ? 'target' : 'inspect' }),
              isAnnotating ? 'Selecting…' : 'Select element',
            ],
          }),
          jsxs(Button, {
            variant: 'ghost',
            size: 'xs',
            disabled: pendingCount === 0,
            onClick: draftToChat,
            children: [jsx(Codicon, { name: 'edit' }), 'Draft in chat'],
          }),
          pendingCount > 0 && jsx(Badge, { size: 'xs', variant: 'default', children: pendingCount }),
          jsx('span', {
            className: 'ml-1 min-w-0 flex-1 truncate text-[0.6875rem] text-muted-foreground',
            children: isAnnotating
              ? 'Click elements and batch your feedback.'
              : annotationReady
                ? 'Review notes, then draft them into chat.'
                : 'Open a local URL to begin.',
          }),
          jsx(Button, {
            variant: 'text',
            size: 'micro',
            disabled: annotations.length === 0,
            onClick: clearAnnotations,
            children: 'Clear',
          }),
          jsx(Tip, {
            label: 'Minimize browser',
            children: jsx(Button, {
              variant: 'ghost',
              size: 'icon-xs',
              onClick: minimizeFloatingBrowser,
              children: jsx(Codicon, { name: 'chrome-minimize' }),
            }),
          }),
          jsx(Tip, {
            label: 'Maximize or restore browser',
            children: jsx(Button, {
              variant: 'ghost',
              size: 'icon-xs',
              onClick: toggleMaximizeFloatingBrowser,
              children: jsx(Codicon, { name: 'screen-full' }),
            }),
          }),
          jsx(Tip, {
            label: 'Hide browser',
            children: jsx(Button, {
              variant: 'ghost',
              size: 'icon-xs',
              onClick: hideFloatingBrowser,
              children: jsx(Codicon, { name: 'eye-closed' }),
            }),
          }),
        ],
      }),
      jsxs('div', {
        className: 'relative min-h-0 flex-1 overflow-hidden bg-background',
        children: [
          jsx('div', {
            ref: previewHostRef,
            className: loadedUrl ? 'h-full w-full' : 'hidden h-full w-full',
          }),
          !loadedUrl && jsx(EmptyState, {
            className: 'h-full px-8',
            title: 'Open a local preview',
            description: 'Enter localhost:4321 in the address bar.',
          }),
          windowMinimized && jsx('div', {
            className: 'pointer-events-none absolute right-2 bottom-2 z-20 rounded border border-border bg-background/90 px-2 py-1 text-[0.625rem] text-muted-foreground shadow-sm backdrop-blur-sm',
            children: `${zoomPercent}% · compact preview`,
          }),
          loadError && jsxs('div', {
            className: 'absolute top-3 right-3 left-3 z-20 flex items-start gap-2 border border-destructive/30 bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm',
            children: [
              jsx(Codicon, { name: 'warning', className: 'mt-0.5 shrink-0 text-destructive' }),
              jsx('span', { className: 'min-w-0 flex-1 text-foreground', children: loadError }),
              jsx(Button, {
                variant: 'ghost',
                size: 'icon-xs',
                onClick: () => setLoadError(''),
                children: jsx(Codicon, { name: 'close' }),
              }),
            ],
          }),
          showPopup && selectedElement && jsx(AnnotationPopup, {
            element: selectedElement,
            onSubmit: handleAddAnnotation,
            onCancel: () => { setShowPopup(false); setSelectedElement(null) },
          }),
          jsx('div', {
            className: 'absolute right-0 bottom-0 z-30 size-4 cursor-nwse-resize',
            title: 'Resize TackMark browser',
            onPointerDown: beginFloatingResize,
            children: jsx(Codicon, {
              name: 'gripper',
              className: 'absolute right-0.5 bottom-0.5 rotate-45 text-muted-foreground',
              size: '0.65rem',
            }),
          }),
        ],
      }),
    ],
  })
}

// Status bar chip
function LauncherButton() {
  const launcherRef = useRef(null)
  useEffect(() => {
    const card = launcherRef.current?.closest('[data-floating-pane]')
    if (!card) return
    const header = card.querySelector('header')
    if (header) header.style.display = 'none'
    card.style.width = '44px'
    card.style.height = '44px'
    card.style.zIndex = '60'
    applyStoredLauncherPosition(card)
    const reflow = () => window.requestAnimationFrame(() => applyStoredLauncherPosition(card))
    window.addEventListener('resize', reflow)
    return () => window.removeEventListener('resize', reflow)
  }, [])
  return jsx(Tip, {
    label: 'Show or hide TackMark browser',
    children: jsx('button', {
      ref: launcherRef,
      className: 'flex h-full w-full cursor-grab rounded-md border border-border bg-background shadow-xl items-center justify-center text-(--ui-text-secondary) transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground',
      onPointerDown: beginLauncherDrag,
      'aria-label': 'Toggle TackMark browser',
      children: jsx(Codicon, { name: 'browser', size: '1rem' }),
    }),
  })
}

// Plugin export
export default {
  id: ID,
  name: 'TackMark',
  register(ctx) {
    clearLegacyCollapsedState()
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
      id: 'floating-browser',
      area: 'panes',
      title: 'TackMark',
      data: {
        placement: 'floating',
        anchor: 'top-left',
        width: '720px',
        height: '540px',
      },
      render: () => jsx(PreviewPanel, {})
    })

    // Rebindable Orca-style browser visibility shortcut (Ctrl/Cmd+Alt+A by default).
    ctx.register({
      id: 'toggle-browser-keybind',
      area: KEYBINDS_AREA,
      data: {
        id: 'tackmark.toggleBrowser',
        category: 'view',
        defaults: ['mod+alt+a'],
        label: 'TackMark: Show or hide browser',
        run: toggleFloatingBrowser,
      },
    })

    ctx.register({
      id: 'toggle-browser-command',
      area: PALETTE_AREA,
      data: {
        id: 'tackmark.toggleBrowser',
        action: 'tackmark.toggleBrowser',
        label: 'TackMark: Show or hide browser',
        keywords: ['tackmark', 'browser', 'show', 'hide', 'floating'],
        run: toggleFloatingBrowser,
      },
    })

    // Persistent Orca-style launcher stays visible when the browser is hidden or minimized.
    ctx.register({
      id: 'floating-launcher',
      area: 'panes',
      title: '',
      data: {
        placement: 'floating',
        anchor: 'top-right',
        width: '44px',
        height: '44px',
      },
      render: () => jsx(LauncherButton, {}),
    })
  }
}
