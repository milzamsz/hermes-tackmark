/**
 * hermes-tackmark — Preview URL policy
 *
 * Replaces upstream's regex-only validation (/^https?:\/\//.test(url))
 * with parsed URL policy: scheme enforcement, loopback-only default,
 * explicit host allowlist, credential rejection.
 */

/** Default allowed loopback hosts. */
const DEFAULT_LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '0:0:0:0:0:0:0:1']

/**
 * Validate a preview URL against the local-first policy.
 *
 * @param {string} input - URL to validate
 * @param {object} [policy] - Optional policy overrides
 * @param {string[]} [policy.allowedHosts] - Additional allowed hosts beyond loopback
 * @returns {{ ok: boolean, url?: URL, reason?: string, trustLevel?: string }}
 */
export function validatePreviewUrl(input, policy = {}) {
  if (typeof input !== 'string' || input.length === 0) {
    return { ok: false, reason: 'URL is empty' }
  }

  let url
  try {
    url = new URL(input)
  } catch {
    return { ok: false, reason: 'Malformed URL' }
  }

  // Scheme enforcement
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `Scheme "${url.protocol}" not allowed — http/https only` }
  }

  // Reject embedded credentials
  if (url.username || url.password) {
    return { ok: false, reason: 'URL credentials are not allowed' }
  }

  const allowedHosts = [...DEFAULT_LOOPBACK_HOSTS, ...(policy.allowedHosts || [])]
  const hostname = url.hostname

  if (DEFAULT_LOOPBACK_HOSTS.includes(hostname)) {
    return { ok: true, url, trustLevel: 'loopback' }
  }

  if (policy.allowedHosts && policy.allowedHosts.includes(hostname)) {
    return { ok: true, url, trustLevel: 'lan' }
  }

  return {
    ok: false,
    reason: `Host "${hostname}" not in allowlist. Add to allowedHosts or use a loopback address.`,
    trustLevel: 'remote',
  }
}

/**
 * Legacy compatibility: boolean-only check matching upstream's isAllowedPreviewUrl.
 * Maintained for backward compatibility with code that expects a boolean.
 */
export function isAllowedPreviewUrl(url) {
  return validatePreviewUrl(url).ok
}
