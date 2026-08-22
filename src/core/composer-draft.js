/** Stage TackMark feedback in the visible Hermes composer without sending it. */
export function visibleComposerTarget(documentObj = document) {
  const surfaces = Array.from(documentObj.querySelectorAll('[data-composer-target]'))
  const visible = surfaces.find(surface =>
    !surface.closest('[data-pane-hidden]') &&
    surface.getClientRects().length > 0
  )
  return visible?.dataset?.composerTarget || 'main'
}

export function draftInComposer(
  text,
  imageBlobs = [],
  { documentObj = document, windowObj = window } = {},
) {
  const draft = String(text || '').trim()
  if (!draft) return false
  const target = visibleComposerTarget(documentObj)
  windowObj.setTimeout(() => {
    windowObj.dispatchEvent(new CustomEvent('hermes:composer-insert', {
      detail: { mode: 'block', target, text: draft },
    }))
    if (imageBlobs.length) {
      windowObj.dispatchEvent(new CustomEvent('hermes:composer-attach-images', {
        detail: { blobs: imageBlobs, target },
      }))
    }
    windowObj.dispatchEvent(new CustomEvent('hermes:composer-focus', {
      detail: { target },
    }))
  }, 0)
  return true
}
