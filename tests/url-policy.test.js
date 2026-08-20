// URL policy tests — local-first validation, credential rejection, host allowlist
import { validatePreviewUrl, isAllowedPreviewUrl } from '../src/core/url-policy.js'

let pass = 0, fail = 0
function check(name, actual, expected) {
  if (actual === expected) { pass++; console.log('PASS: ' + name) }
  else { fail++; console.error('FAIL: ' + name + ' — got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected)) }
}
function checkTrue(name, actual) {
  check(name, Boolean(actual), true)
}
function checkFalse(name, actual) {
  check(name, Boolean(actual), false)
}

console.log('--- Default loopback allow ---')
checkTrue('localhost allowed', validatePreviewUrl('http://localhost:5173').ok)
checkTrue('127.0.0.1 allowed', validatePreviewUrl('http://127.0.0.1:8080').ok)
checkTrue('[::1] allowed', validatePreviewUrl('http://[::1]:3000').ok)
check('loopback trust level', validatePreviewUrl('http://localhost:3000').trustLevel, 'loopback')

console.log('\n--- Remote rejection ---')
checkFalse('example.com denied', validatePreviewUrl('https://example.com').ok)
checkFalse('remote denied', validatePreviewUrl('http://10.0.0.1:3000').ok)

console.log('\n--- Scheme enforcement ---')
checkFalse('javascript: denied', validatePreviewUrl('javascript:alert(1)').ok)
checkFalse('data: denied', validatePreviewUrl('data:text/html,hello').ok)
checkFalse('file: denied', validatePreviewUrl('file:///etc/passwd').ok)
checkFalse('no scheme denied', validatePreviewUrl('localhost:3000').ok)
checkFalse('empty denied', validatePreviewUrl('').ok)
checkFalse('non-string denied', validatePreviewUrl(42).ok)

console.log('\n--- Credential rejection ---')
checkFalse('user:pass denied', validatePreviewUrl('http://user:pass@localhost:3000').ok)
checkFalse('user only denied', validatePreviewUrl('http://user@localhost:3000').ok)

console.log('\n--- Custom host allowlist ---')
const policy = { allowedHosts: ['10.0.0.1', 'mydev.example.com'] }
checkTrue('allowed host in policy', validatePreviewUrl('http://10.0.0.1:3000', policy).ok)
checkTrue('custom domain in policy', validatePreviewUrl('https://mydev.example.com', policy).ok)
check('custom host trust level', validatePreviewUrl('http://10.0.0.1', policy).trustLevel, 'lan')
checkFalse('non-allowlisted remote denied', validatePreviewUrl('https://evil.com', policy).ok)

console.log('\n--- Legacy boolean API ---')
check('legacy localhost', isAllowedPreviewUrl('http://localhost:3000'), true)
check('legacy remote', isAllowedPreviewUrl('https://example.com'), false)

console.log('\n--- Rejection reason ---')
const rejected = validatePreviewUrl('https://example.com')
checkTrue('has reason', rejected.reason?.includes('not in allowlist'))

console.log('\n' + pass + ' passed, ' + fail + ' failed')
if (fail > 0) process.exit(1)
