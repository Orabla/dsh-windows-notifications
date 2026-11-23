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
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  useState: value => [value, () => {}]
}
const primitivesStub = { Switch: 'Switch', Button: 'Button', Input: 'Input' }
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
const snapshot = {
  values: { ask: true, question: true, done: true, error: true, 'subagent-done': false, 'turn-end': false },
  templates: { done: '✅ {session} · {detail}' },
  details: { ask: true, question: true, done: true, error: true, 'subagent-done': false, 'turn-end': false },
  title: '{session} · DSH',
  revision: 0
}
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

const copyMap = {
  template: '{kind}\nclick to open',
  templateSummary: '{kind}\n{detail}',
  ask: 'approval',
  question: 'question',
  done: 'done',
  error: 'error',
  'subagent-done': 'subtask',
  'turn-end': 'turn',
  testTitle: 'test title',
  testBody: 'test body'
}
const t = key => copyMap[key] ?? key

const controller = exported.createClient({
  fetcher,
  EventSourceClass: FakeEventSource,
  NotificationClass: FakeNotification,
  windowObject: fakeWindowObject,
  openSession: id => opened.push(id),
  t
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

await controller.saveDetail('error', false)
assert.deepEqual(JSON.parse(requests.at(-1).options.body), { details: { error: false } })

await controller.saveTitle('{kind}')
assert.deepEqual(JSON.parse(requests.at(-1).options.body), { title: '{kind}' })

// A custom template replaces the built-in text and fills its variables.
streams[0].emit('notification', { id: 'lifetime:1', kind: 'done', sessionId: 'session-1', time: Date.now(), title: 'Session A', detail: 'all good' })
assert.equal(shown.length, 1, 'the event notification must reach the notification platform')
assert.equal(shown[0].title, 'Session A · DSH', 'the title template must fill its variables')
assert.equal(shown[0].options.body, '✅ Session A · all good')

// A kind without a custom template keeps the built-in text.
streams[0].emit('notification', { id: 'lifetime:2', kind: 'ask', sessionId: 'session-2', time: Date.now() })
assert.equal(shown.length, 2)
assert.equal(shown[1].options.body, 'approval', 'a detail kind with an empty detail shows just the event name')
assert.equal(shown[1].title, 'DeepSeek Harness', 'a notification without a session title keeps the product name')

shown[0].onclick()
assert.deepEqual(opened, ['session-1'], 'clicking a notification must open its session')
assert.equal(focused, 1, 'clicking a notification must focus the window')

controller.test()
assert.equal(shown.length, 3, 'the test button must submit a notification')
assert.equal(shown[2].title, 'test title')

// The shared vocabulary stays in step with the Host module.
const shared = await import(new URL('../lib/shared.js', import.meta.url))
assert.deepEqual([...shared.KINDS], ['ask', 'question', 'done', 'error', 'subagent-done', 'turn-end'])
assert.deepEqual(shared.DEFAULTS, { ask: true, question: true, done: true, error: true, 'subagent-done': false, 'turn-end': false })
assert.equal(shared.BASE_PATH, '/dsh-windows-notifications')
assert.deepEqual(shared.validateSettings({ ask: true, done: false, unknown: 1 }, true), { ask: true, done: false })
assert.throws(() => shared.validateSettings({ ask: true }), TypeError)
assert.throws(() => shared.validateSettings({ ask: 'yes' }, true), TypeError)

// The custom text and detail switches keep their shape.
assert.deepEqual(shared.validateTemplates({ done: 'x {session}', unknown: 'y' }), { done: 'x {session}' })
assert.deepEqual(shared.validateTemplates({ done: '   ' }), {}, 'an empty template falls back to the built-in text')
assert.throws(() => shared.validateTemplates({ done: 5 }), TypeError)
assert.deepEqual(shared.validateDetails({ error: false, unknown: true }), { error: false })
assert.throws(() => shared.validateDetails({ error: 'no' }), TypeError)
assert.deepEqual(shared.validatePatch({ done: false }), { values: { done: false } })
assert.deepEqual(shared.validatePatch({ templates: { done: 'x' } }), { templates: { done: 'x' } })
assert.deepEqual(shared.validatePatch({ details: { done: true } }), { details: { done: true } })
assert.throws(() => shared.validatePatch({}), TypeError)
assert.deepEqual(shared.validateConfig({ ask: true, question: true, done: true, error: true, 'subagent-done': false, 'turn-end': false }), {
  values: { ask: true, question: true, done: true, error: true, 'subagent-done': false, 'turn-end': false },
  templates: {},
  details: { ask: true, question: true, done: true, error: true, 'subagent-done': false, 'turn-end': false },
  title: ''
})
assert.deepEqual(shared.validateTemplates({ done: 'line 1\nline 2' }), { done: 'line 1\nline 2' }, 'custom templates keep newlines')
assert.equal(shared.renderTemplate('{kind}\n{detail}', { kind: 'done', detail: '' }), 'done', 'an empty detail leaves no dangling line')
assert.equal(shared.renderTemplate('{kind}\n{detail}', { kind: 'done', detail: 'all good' }), 'done\nall good')
assert.equal(shared.renderTemplate('{kind} · {detail}', { kind: 'done', detail: '' }), 'done', 'an empty detail leaves no dangling separator')
assert.equal(shared.renderTemplate('{unknown}', {}), '{unknown}')

// Event classification keeps its old behaviour and adds the detail line.
const approval = shared.classifyEvent({}, 'approval/request', { agent: { id: 'agent-1' }, callId: 'call-1', toolName: 'Bash', reason: 'writes a file' })
assert.deepEqual(approval.notices, [{ kind: 'ask', sessionId: 'agent-1', key: 'call-1', detail: 'Bash · writes a file' }])
const question = shared.classifyEvent({}, 'user-questions/request', {
  agent: { id: 'agent-2' },
  wait: { callId: 'call-2' },
  questions: [{ id: 'q1', question: 'Which branch?' }]
})
assert.deepEqual(question.notices, [{ kind: 'question', sessionId: 'agent-2', key: 'call-2', detail: 'Which branch?' }])
const failure = shared.classifyEvent({}, 'agent/error', { agent: { id: 'agent-3' }, turn: 2, error: { message: 'boom' } })
assert.deepEqual(failure.notices, [{ kind: 'error', sessionId: 'agent-3', key: 'turn-2', detail: 'boom' }])
const done = shared.classifyEvent({ running: true, ended: { turn: 3, reason: { kind: 'completed' } } }, 'agent/status', {
  status: 'idle',
  agent: { id: 'agent-1', session: { header: { origin: 'main' } } }
})
assert.deepEqual(done.notices, [{ kind: 'done', sessionId: 'agent-1', key: 'turn-3' }])

// A finished turn carries the last assistant reply as its detail.
const session = { id: 'agent-4', header: { origin: 'main' } }
let state = {}
let notices = []
for (const [type, payload] of [
  ['agent/status', { status: 'running', agent: { id: 'agent-4', session: { header: { origin: 'main' } } } }],
  ['session/event', { session, event: { type: 'turn/start', data: { turn: 1 } } }],
  ['session/event', { session, event: { type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: '已把插件改成 Windows 版' }] } } } }],
  ['session/event', { session, event: { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } } }],
  ['agent/status', { status: 'idle', agent: { id: 'agent-4', session: { header: { origin: 'main' } } } }]
]) {
  const result = shared.classifyEvent(state, type, payload)
  state = result.state
  notices = result.notices
}
assert.equal(state.lastText, '已把插件改成 Windows 版', 'the last assistant reply is kept as the summary')
assert.deepEqual(notices, [{ kind: 'done', sessionId: 'agent-4', key: 'turn-1', detail: '已把插件改成 Windows 版' }])

// Event details are capped at 50 characters so the toast stays compact.
const longReply = 'A'.repeat(80)
let truncated = []
for (const [type, payload] of [
  ['agent/status', { status: 'running', agent: { id: 'agent-5', session: { header: { origin: 'main' } } } }],
  ['session/event', { session: { id: 'agent-5', header: { origin: 'main' } }, event: { type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: longReply }] } } } }],
  ['session/event', { session: { id: 'agent-5', header: { origin: 'main' } }, event: { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } } }],
  ['agent/status', { status: 'idle', agent: { id: 'agent-5', session: { header: { origin: 'main' } } } }]
]) {
  const result = shared.classifyEvent(truncated.state ?? {}, type, payload)
  truncated = { state: result.state, notices: result.notices }
}
assert.equal(truncated.notices[0].detail.length, 50, 'the detail line must be capped at 50 characters')

console.log('client artifact and shared vocabulary: ok')
