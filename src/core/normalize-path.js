/**
 * hermes-tackmark — MSYS/Git Bash path normalization
 *
 * Preserved from upstream (src/plugin.js lines 24-31).
 * Converts MSYS-style paths (/c/Users/...) to Windows paths (C:\Users\...).
 * Only for file paths, never URLs or selectors.
 */
export function normalizeFilePath(input) {
  if (typeof input !== 'string' || input.length === 0) return input
  // MSYS drive letter: /c/... → C:\
  input = input.replace(/^\/[a-zA-Z]\//, (m) => m.charAt(1).toUpperCase() + ':\\')
  // Unify forward slashes → backslashes
  input = input.replace(/\//g, '\\')
  return input
}
