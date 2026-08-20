/**
 * hermes-tackmark — Session resolver
 *
 * Uses focusedSessionId (tile-aware, SDK-recommended for session RPC)
 * with optional compatibility fallback to activeSessionId.
 */

/**
 * Resolve the target Hermes session ID for prompt submission.
 *
 * @param {object} host - The Hermes plugin SDK host object
 * @returns {string|null} - The focused session ID, or null if unavailable
 */
export function getTargetSessionId(host) {
  if (!host?.state) return null

  // Prefer focusedSessionId (tile-aware, SDK-recommended)
  const focused = host.state.focusedSessionId?.get?.()
  if (focused) return focused

  // Optional compatibility fallback for older Hermes versions
  // Must be explicitly documented when used
  return host.state.activeSessionId?.get?.() ?? null
}

/**
 * Check whether a session is busy (mid-turn).
 *
 * @param {object} host - The Hermes plugin SDK host object
 * @param {string} sessionId - The session to check
 * @returns {boolean}
 */
export function isSessionBusy(host, sessionId) {
  if (!host?.state) return false
  const busyBySession = host.state.busyBySession?.get?.()
  if (busyBySession && sessionId) {
    return Boolean(busyBySession[sessionId])
  }
  // Fallback: global busy state
  return Boolean(host.state.busy?.get?.())
}

/**
 * Determine whether it's safe to submit a prompt.
 *
 * @param {object} host - The Hermes plugin SDK host object
 * @returns {{ safe: boolean, sessionId: string|null, reason?: string }}
 */
export function checkSendSafety(host) {
  const sessionId = getTargetSessionId(host)

  if (!sessionId) {
    return { safe: false, sessionId: null, reason: 'No focused session' }
  }

  if (isSessionBusy(host, sessionId)) {
    return { safe: false, sessionId, reason: 'Session is busy' }
  }

  return { safe: true, sessionId }
}

/**
 * Determine whether a prompt.submit result indicates success.
 *
 * prompt.submit returns {"status": "streaming"} synchronously —
 * the turn runs asynchronously. This replaces the upstream's broken
 * result?.error || (result?.ok === false) check.
 *
 * @param {object} result - The return value of host.request('prompt.submit', ...)
 * @returns {{ success: boolean, reason?: string }}
 */
export function checkSubmitSuccess(result) {
  if (!result || typeof result !== 'object') {
    return { success: false, reason: 'Invalid response from prompt.submit' }
  }

  // Check for explicit error
  if (result.error) {
    return { success: false, reason: String(result.error.message || result.error || 'Unknown error') }
  }

  // Check for streaming status (the actual success contract)
  if (result.status === 'streaming') {
    return { success: true }
  }

  // Check for ok:true (legacy/alternative contract)
  if (result.ok === true) {
    return { success: true }
  }

  // Check for explicit failure
  if (result.ok === false) {
    return { success: false, reason: String(result.message || 'Submission rejected') }
  }

  // Unknown shape — don't assume success
  return { success: false, reason: 'Unrecognized response shape from prompt.submit' }
}
