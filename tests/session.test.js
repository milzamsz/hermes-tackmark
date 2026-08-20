// Session resolver tests — focusedSessionId preference, busy state, success detection
import { getTargetSessionId, isSessionBusy, checkSendSafety, checkSubmitSuccess } from '../src/core/session.js'

let pass = 0, fail = 0
function check(name, actual, expected) {
  if (actual === expected) { pass++; console.log('PASS: ' + name) }
  else { fail++; console.error('FAIL: ' + name + ' — got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected)) }
}
function checkTrue(name, actual) { check(name, Boolean(actual), true) }
function checkFalse(name, actual) { check(name, Boolean(actual), false) }

console.log('--- getTargetSessionId ---')
const mockHost = {
  state: {
    focusedSessionId: { get: () => 'sess-focused-123' },
    activeSessionId: { get: () => 'sess-active-456' },
    busy: { get: () => false },
    busyBySession: { get: () => ({}) },
  }
}
check('prefers focusedSessionId', getTargetSessionId(mockHost), 'sess-focused-123')

const hostNoFocused = { state: { activeSessionId: { get: () => 'sess-active-456' } } }
check('falls back to activeSessionId', getTargetSessionId(hostNoFocused), 'sess-active-456')

const hostNoState = { state: {} }
check('returns null when no session', getTargetSessionId(hostNoState), null)
check('returns null when host is null', getTargetSessionId(null), null)

console.log('\n--- isSessionBusy ---')
const busyHost = {
  state: {
    busyBySession: { get: () => ({ 'sess-1': true, 'sess-2': false }) },
    busy: { get: () => false },
  }
}
checkTrue('busy session detected', isSessionBusy(busyHost, 'sess-1'))
checkFalse('idle session detected', isSessionBusy(busyHost, 'sess-2'))
checkFalse('no host returns false', isSessionBusy(null, 'sess-1'))

console.log('\n--- checkSendSafety ---')
const safeHost = {
  state: {
    focusedSessionId: { get: () => 'sess-safe' },
    busyBySession: { get: () => ({}) },
  }
}
const safeResult = checkSendSafety(safeHost)
checkTrue('safe to send', safeResult.safe)
check('safe session id', safeResult.sessionId, 'sess-safe')

const busyResult = checkSendSafety({
  state: {
    focusedSessionId: { get: () => 'sess-busy' },
    busyBySession: { get: () => ({ 'sess-busy': true }) },
  }
})
checkFalse('not safe when busy', busyResult.safe)
checkTrue('has reason when busy', Boolean(busyResult.reason))

const noSessionResult = checkSendSafety({ state: {} })
checkFalse('not safe when no session', noSessionResult.safe)
checkTrue('has reason when no session', Boolean(noSessionResult.reason))

console.log('\n--- checkSubmitSuccess (streaming contract) ---')
checkTrue('streaming = success', checkSubmitSuccess({ status: 'streaming' }).success)
checkTrue('ok:true = success', checkSubmitSuccess({ ok: true }).success)
checkFalse('ok:false = failure', checkSubmitSuccess({ ok: false }).success)
checkFalse('error present = failure', checkSubmitSuccess({ error: { message: 'broke' } }).success)
checkTrue('error has reason', Boolean(checkSubmitSuccess({ error: { message: 'broke' } }).reason))
checkFalse('null result = failure', checkSubmitSuccess(null).success)
checkFalse('non-object = failure', checkSubmitSuccess('hello').success)
checkFalse('unknown shape = failure', checkSubmitSuccess({ weird: true }).success)
checkTrue('unknown shape has reason', Boolean(checkSubmitSuccess({ weird: true }).reason))

console.log('\n' + pass + ' passed, ' + fail + ' failed')
if (fail > 0) process.exit(1)
