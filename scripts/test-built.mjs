// Runtime check for the built client artifact and the shared Host vocabulary.
// It stubs the browser environment, so no real notification is ever delivered.
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const artifact = await readFile(resolve(root, 'lib/client.js'), 'utf8')

let captured
const fakeWindow = {
  __ModuleLoader__: {
    load(spec) {
      captured = spec
    }
  }
}
globalThis.window = fakeWindow

// eslint-disable-next-line no-new-func
new Function('window', artifact)(fakeWindow)

assert.ok(captured, 'the artifact must call window.__ModuleLoader__.load')
assert.equal(captured.id, 'dsh-windows-notifications')

const reactStub = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot()
}
const primitivesStub = { Switch: 'Switch', Button: 'Button' }
const requireStub = name => {
  if (name === 'react') return reactStub
  if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub
  throw new Error(`unexpected module request: ${name}`)
}

const exported = captured.factory(requireStub)
assert.equal(exported.name, 'dsh-windows-notifications')
assert.deepEqual(exported.inject, ['slots', 'locale', 'uiWorkspace'])

// A fake notification platform that records what the plugin asks Windows to show.
const shown = []
class FakeNotification {
  static permission = 'granted'
  static requestPermission() {
    return Promise.resolve('granted')
  }
  constructor(title, options) {
    this.title = title
    this.options = options
    this.closed = false
    shown.push(this)
  }
  close() {
    this.closed = true
  }
}
assert.equal(FakeNotification.permission, 'granted')

// A fake event stream that the test drives by hand.
const streams = []
class FakeEventSource {
  constructor(url) {
    this.url = url
    this.listeners = new Map()
    this.closed = false
    streams.push(this)
  }
  addEventListener(type, callback) {
    this.listeners.set(type, callback)
  }
  close() {
    this.closed = true
  }
  emit(type, data) {
    const callback = this.listeners.get(type)
    if (callback) callback({ data: JSON.stringify(data) })
  }
}

const requests = []
const snapshot = { values: { ask: true, question: true, done: true, error: true, 'subagent-done': false, 'turn-end': false }, revision: 0 }
const fetcher = async (url, options) => {
  requests.push({ url, options })
  return { ok: true, json: async () => snapshot }
}

const opened = []
let focused = 0
const fakeWindowObject = {
  addEventListener() {},
  removeEventListener() {},
  focus() {
    focused += 1
  }
}

const controller = exported.createClient({
  fetcher,
  EventSourceClass: FakeEventSource,
  NotificationClass: FakeNotification,
  windowObject: fakeWindowObject,
  openSession: id => opened.push(id),
  t: key => key
})

controller.start()
await new Promise(resolve => setTimeout(resolve, 10))

assert.equal(controller.getSnapshot().loaded, true, 'the settings snapshot must load')
assert.equal(requests[0].url, '/dsh-windows-notifications/settings')
assert.equal(requests[0].options.method, 'GET')
assert.equal(streams.length, 1)
assert.equal(streams[0].url, '/dsh-windows-notifications/events?ready=1', 'a permitted window must announce itself as ready')

await controller.save('done', false)
const saved = requests.at(-1)
assert.equal(saved.options.method, 'POST')
assert.deepEqual(JSON.parse(saved.options.body), { done: false })

streams[0].emit('notification', { id: 'lifetime:1', kind: 'ask', sessionId: 'session-1', time: Date.now(), title: 'Build the report' })
assert.equal(shown.length, 1, 'the event notification must reach the notification platform')
assert.equal(shown[0].title, 'Build the report')
assert.match(shown[0].options.body, /ask/)
shown[0].onclick()
assert.deepEqual(opened, ['session-1'], 'clicking a notification must open its session')
assert.equal(focused, 1, 'clicking a notification must focus the window')

controller.test()
assert.equal(shown.length, 2, 'the test button must submit a notification')
assert.equal(shown[1].title, 'testTitle')

// The shared vocabulary stays in step with the Host module.
const shared = await import(new URL('../lib/shared.js', import.meta.url))
assert.deepEqual([...shared.KINDS], ['ask', 'question', 'done', 'error', 'subagent-done', 'turn-end'])
assert.deepEqual(shared.DEFAULTS, { ask: true, question: true, done: true, error: true, 'subagent-done': false, 'turn-end': false })
assert.equal(shared.BASE_PATH, '/dsh-windows-notifications')
assert.deepEqual(shared.validateSettings({ ask: true, done: false, unknown: 1 }, true), { ask: true, done: false })
assert.throws(() => shared.validateSettings({ ask: true }), TypeError)
assert.throws(() => shared.validateSettings({ ask: 'yes' }, true), TypeError)

const approval = shared.classifyEvent({}, 'approval/request', { agent: { id: 'agent-1' }, callId: 'call-1' })
assert.deepEqual(approval.notices, [{ kind: 'ask', sessionId: 'agent-1', key: 'call-1' }])
const done = shared.classifyEvent({ running: true, ended: { turn: 3, reason: { kind: 'completed' } } }, 'agent/status', {
  status: 'idle',
  agent: { id: 'agent-1', session: { header: { origin: 'main' } } }
})
assert.deepEqual(done.notices, [{ kind: 'done', sessionId: 'agent-1', key: 'turn-3' }])

console.log('client artifact and shared vocabulary: ok')
