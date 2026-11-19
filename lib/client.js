window.__ModuleLoader__.load({
  id: "dsh-windows-notifications",
  factory: (require) => {
    const cache = Object.create(null);
    const modules = {
"shared": () => {
/** Fixed wire vocabulary shared by the Host and renderer. */
const KINDS = Object.freeze(['ask', 'question', 'done', 'error', 'subagent-done', 'turn-end'])
const DEFAULTS = Object.freeze({ ask: true, question: true, done: true, error: true, 'subagent-done': false, 'turn-end': false })
const BASE_PATH = '/dsh-windows-notifications'
/** Notification titles stay one short single line. */
const TITLE_MAX_CHARS = 80

/** Reject non-boolean persisted or HTTP values; unknown keys are dropped for forward compatibility. */
function validateSettings(value, partial = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected an object with boolean fields.')
  const result = {}
  for (const key of Object.keys(value)) {
    if (KINDS.includes(key) && typeof value[key] === 'boolean') result[key] = value[key]
  }
  if (!partial && KINDS.some(key => !Object.hasOwn(result, key))) throw new TypeError('All six event fields are required.')
  if (partial && Object.keys(result).length === 0) throw new TypeError('At least one event field is required.')
  return result
}

/** Sanitize one untrusted session title for display: single line and bounded. */
function sanitizeTitle(value) {
  if (typeof value !== 'string') return undefined
  const line = value
    .replace(/[^\S\r\n]+/gu, ' ')
    .replace(/[\r\n\t\x00-\x1f\x7f]/gu, ' ')
    .replace(/ {2,}/gu, ' ')
    .trim()
  if (line.length === 0) return undefined
  return line.length > TITLE_MAX_CHARS ? `${line.slice(0, TITLE_MAX_CHARS - 1)}…` : line
}

/** IDs are opaque DSH strings, not URL destinations or filesystem paths. */
function validId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\s\x00-\x1f\x7f]/u.test(value)
}

/** Parse a bounded notification received from the Host. */
function validateNotice(value) {
  if (!value || typeof value !== 'object' || !KINDS.includes(value.kind) || !validId(value.id) || !validId(value.sessionId)) return null
  if (!Number.isSafeInteger(value.time) || value.time < 0) return null
  const title = sanitizeTitle(value.title)
  return { id: value.id, kind: value.kind, sessionId: value.sessionId, time: value.time, ...(title === undefined ? {} : { title }) }
}

/** A bounded recent-ID set prevents duplicate events without retaining sessions forever. */
function createDedupe({ limit = 1024, ttlMs = 120000, now = Date.now } = {}) {
  const seen = new Map()
  return {
    accept(id) {
      const time = now()
      for (const [key, expires] of seen) if (expires <= time) seen.delete(key)
      if (seen.has(id)) return false
      seen.set(id, time + ttlMs)
      while (seen.size > limit) seen.delete(seen.keys().next().value)
      return true
    },
    clear() {
      seen.clear()
    },
    get size() {
      return seen.size
    }
  }
}

/** Pure state transition over observed DSH events. The caller owns the state map. */
function classifyEvent(state, type, payload) {
  const notices = []
  const next = { ...state }
  const add = (kind, sessionId, key) => {
    if (validId(sessionId)) notices.push({ kind, sessionId, key })
  }
  switch (type) {
    case 'approval/request':
      if (!payload.signal?.aborted) add('ask', payload.agent?.id, payload.callId)
      break
    case 'user-questions/request':
      if (!payload.signal?.aborted) add('question', payload.agent?.id, payload.wait?.callId)
      break
    case 'agent/status':
      if (payload.status === 'running') {
        next.running = true
        next.ended = undefined
      }
      if (payload.status === 'idle' && state.running) {
        next.running = false
        if (state.ended?.reason.kind === 'completed' && payload.agent.session.header.origin !== 'subagent') {
          add('done', payload.agent.id, `turn-${state.ended.turn}`)
        }
      }
      break
    case 'session/event': {
      const { session, event } = payload
      if (event.type !== 'turn/end') break
      next.ended = event.data
      if (session.header.origin !== 'subagent' && event.data.reason.kind !== 'forked') {
        add('turn-end', session.id, `turn-${event.data.turn}`)
      }
      if (event.data.reason.kind === 'error') add('error', session.id, `turn-${event.data.turn}`)
      break
    }
    case 'agent/error':
      add('error', payload.agent.id, `turn-${payload.turn}`)
      break
    case 'agent-loop/config-start-failed':
      add('error', payload.sessionId, undefined)
      break
    case 'subagent/end':
      if (payload.stopReason === 'completed') add('subagent-done', payload.id, payload.runId)
      if (payload.stopReason === 'error') add('error', payload.id, payload.runId)
      break
    default:
      break
  }
  return { state: next, notices }
}

/** Localized copy contains no transcript, tool arguments, or error details. */
const COPY = Object.freeze({
  en: {
    title: 'Windows notifications',
    description: 'Native Windows notifications. Click a notification to open its session.',
    ask: 'Approval required',
    question: 'Question',
    done: 'Task completed',
    error: 'Error',
    'subagent-done': 'Subagent completed',
    'turn-end': 'Turn ended',
    permission: 'Permission',
    granted: 'Allowed',
    denied: 'Blocked in Windows notifications or the browser',
    default: 'Not requested',
    unsupported: 'Not supported',
    request: 'Allow notifications',
    test: 'Send test notification',
    refresh: 'Refresh status',
    loading: 'Loading configuration',
    saving: 'Saving configuration',
    saved: 'Configuration saved',
    connected: 'Connected',
    reconnecting: 'Reconnecting',
    receiver: 'This window receives notifications',
    standby: 'Another window receives notifications',
    help: 'Allow DeepSeek Harness in Windows Settings > System > Notifications.',
    testSent: 'Test submitted. Windows Focus assist or Do not disturb can hide it.',
    testShown: 'The system accepted the test notification.',
    testFailed: 'The system rejected the test notification.',
    unavailable: 'Allow notifications before you send a test.',
    body: 'Click to open the related DeepSeek Harness session.',
    testTitle: 'DeepSeek Harness test',
    testBody: 'Windows notifications are enabled. Click to focus DeepSeek Harness.',
    failure: 'The request failed. Refresh the status and try again.'
  },
  zh: {
    title: 'Windows 通知',
    description: '原生 Windows 通知，点击通知返回对应会话。',
    ask: '审批请求',
    question: '提问',
    done: '任务完成',
    error: '错误',
    'subagent-done': '子代理完成',
    'turn-end': '回合结束',
    permission: '通知权限',
    granted: '已允许',
    denied: '已被 Windows 通知设置或浏览器阻止',
    default: '尚未请求',
    unsupported: '当前环境不支持',
    request: '允许通知',
    test: '发送测试通知',
    refresh: '刷新状态',
    loading: '正在读取配置',
    saving: '正在保存配置',
    saved: '配置已保存',
    connected: '已连接',
    reconnecting: '正在重新连接',
    receiver: '当前窗口接收通知',
    standby: '其他窗口正在接收通知',
    help: '请在 Windows 设置 > 系统 > 通知中允许 DeepSeek Harness 发送通知。',
    testSent: '测试已提交，Windows 的专注助手或“请勿打扰”可能隐藏通知。',
    testShown: '系统已接受测试通知。',
    testFailed: '系统未能显示测试通知。',
    unavailable: '请先允许通知，再发送测试。',
    body: '点击打开对应的 DeepSeek Harness 会话。',
    testTitle: 'DeepSeek Harness 测试',
    testBody: 'Windows 通知已启用。点击返回 DeepSeek Harness。',
    failure: '请求失败，请刷新状态后重试。'
  }
})

/** Resolve one locale without importing a different plugin implementation. */
function copyFor(language) {
  return COPY[String(language).startsWith('zh') ? 'zh' : 'en']
}

return { KINDS, DEFAULTS, BASE_PATH, TITLE_MAX_CHARS, validateSettings, sanitizeTitle, validId, validateNotice, createDedupe, classifyEvent, COPY, copyFor }
},
"notifications": () => {
const { createDedupe, validateNotice } = local("shared")

/** Colored status glyphs Windows renders in notification bodies. */
const DOTS = Object.freeze({ ask: '🟡', question: '🟡', done: '🟢', 'subagent-done': '🟢', 'turn-end': '🟢', error: '🔴' })

/** Hold renderer Notification objects until close, and release callbacks on disposal. */
function createNotifier({ NotificationClass, windowObject, openSession, copy, onStatus = () => {} }) {
  const live = new Set()
  const dedupe = createDedupe()
  let disposed = false
  const permission = () => (typeof NotificationClass === 'function' ? NotificationClass.permission : 'unsupported')
  const show = (notice, test = false) => {
    if (disposed || permission() !== 'granted') {
      if (test) onStatus('unavailable')
      return false
    }
    let notification
    try {
      const heading = test ? copy('testTitle') : (notice.title ?? 'DeepSeek Harness')
      const body = test ? copy('testBody') : `${DOTS[notice.kind] ?? '🟡'} ${copy(notice.kind)} · ${copy('body')}`
      // The tag replaces an earlier toast for the same event instead of stacking duplicates in Action Center.
      notification = new NotificationClass(heading, { body, tag: test ? `dsh-test-${Date.now()}` : `dsh-${notice.id}` })
    } catch (error) {
      onStatus('testFailed')
      return false
    }
    live.add(notification)
    // Bound retained callbacks even when Windows never delivers a close event.
    while (live.size > 64) {
      const oldest = live.values().next().value
      oldest.onclick = oldest.onclose = oldest.onerror = oldest.onshow = null
      oldest.close()
      live.delete(oldest)
    }
    notification.onclick = () => {
      // Focus must still run when navigation fails or the session no longer exists.
      try {
        if (notice?.sessionId) openSession(notice.sessionId)
      } finally {
        try {
          windowObject.focus()
        } finally {
          notification.close()
          live.delete(notification)
        }
      }
    }
    notification.onclose = () => live.delete(notification)
    notification.onerror = () => {
      live.delete(notification)
      onStatus('testFailed')
    }
    if (test) {
      notification.onshow = () => onStatus('testShown')
      onStatus('testSent')
    }
    return true
  }
  return {
    permission,
    async requestPermission() {
      if (disposed || typeof NotificationClass !== 'function') return 'unsupported'
      return NotificationClass.requestPermission()
    },
    receive(value) {
      const notice = validateNotice(value)
      if (!notice || permission() !== 'granted' || !dedupe.accept(notice.id)) return false
      return show(notice)
    },
    test() {
      return show(null, true)
    },
    dispose() {
      disposed = true
      for (const notification of live) {
        notification.onclick = notification.onclose = notification.onerror = notification.onshow = null
        notification.close()
      }
      live.clear()
      dedupe.clear()
    }
  }
}

return { createNotifier }
},
"client": () => {
const { createElement: h, useSyncExternalStore } = require("react")
const { Switch, Button } = require("@deepseek-ai/dsh-client-ui-primitives")
const { BASE_PATH, DEFAULTS, COPY, validateSettings } = local("shared")
const { createNotifier } = local("notifications")

const name = 'dsh-windows-notifications'
const inject = ['slots', 'locale', 'uiWorkspace']
const NS = 'dsh-windows-notifications'
const ORDER = ['ask', 'question', 'done', 'subagent-done', 'error', 'turn-end']
const dictionaries = {
  en: { ...COPY.en, ask: 'Approval waiting', question: 'Question for you', 'subagent-done': 'Subtask completed', error: 'Task error', 'turn-end': 'Turn completed' },
  zh: { ...COPY.zh, ask: '审批等待', question: '向你提问', 'subagent-done': '子任务完成', error: '任务出错', 'turn-end': '轮次完成' }
}

/** Own the HTTP requests, notification receiver, and browser permission lifecycle. */
function createClient({ fetcher, EventSourceClass, NotificationClass, windowObject, openSession, t }) {
  const listeners = new Set()
  const abort = new AbortController()
  let disposed = false
  let source
  let revision = -1
  let generation = 0
  let state = { values: { ...DEFAULTS }, loaded: false, busy: false, permission: 'unsupported', connected: false, active: false, status: 'loading' }
  const publish = patch => {
    if (disposed) return
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }
  const notifier = createNotifier({ NotificationClass, windowObject, openSession, copy: t, onStatus: status => publish({ status }) })
  const accept = snapshot => {
    if (!Number.isSafeInteger(snapshot?.revision) || snapshot.revision < 0) throw new TypeError('Invalid configuration revision.')
    const values = validateSettings(snapshot.values)
    if (snapshot.revision < revision) return
    revision = snapshot.revision
    publish({ values, loaded: true })
  }
  const request = async patch => {
    const response = await fetcher(`${BASE_PATH}/settings`, {
      method: patch ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: abort.signal,
      headers: { 'Content-Type': 'application/json', 'x-dsh-notifications': '1' },
      ...(patch ? { body: JSON.stringify(validateSettings(patch, true)) } : {})
    })
    if (!response.ok) throw new Error('Configuration request failed.')
    accept(await response.json())
  }
  const connect = () => {
    if (disposed) return
    source?.close()
    const current = ++generation
    revision = -1
    publish({ permission: notifier.permission(), connected: false, active: false })
    if (typeof EventSourceClass !== 'function') {
      publish({ status: 'failure' })
      return
    }
    source = new EventSourceClass(`${BASE_PATH}/events?ready=${notifier.permission() === 'granted' ? '1' : '0'}`)
    const listen = (event, callback) =>
      source.addEventListener(event, payload => {
        if (disposed || current !== generation) return
        try {
          callback(payload)
        } catch (error) {
          publish({ status: 'failure' })
        }
      })
    listen('open', () => {
      revision = -1
      publish({ connected: true })
    })
    listen('error', () => publish({ connected: false, active: false }))
    listen('settings', payload => accept(JSON.parse(payload.data)))
    listen('receiver', payload => {
      const value = JSON.parse(payload.data)
      if (typeof value?.active !== 'boolean') throw new TypeError('Invalid receiver state.')
      publish({ active: value.active })
    })
    listen('notification', payload => notifier.receive(JSON.parse(payload.data)))
  }
  const refresh = async () => {
    if (disposed || state.busy) return
    publish({ busy: true, status: 'loading' })
    connect()
    try {
      await request()
      publish({ status: 'connected' })
    } catch (error) {
      publish({ status: 'failure' })
    } finally {
      publish({ busy: false })
    }
  }
  const onFocus = () => {
    if (notifier.permission() !== state.permission) connect()
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start() {
      windowObject.addEventListener('focus', onFocus)
      void refresh()
    },
    refresh,
    async save(kind, value) {
      if (disposed || state.busy || !state.loaded) return
      publish({ busy: true, status: 'saving' })
      try {
        await request({ [kind]: value })
        publish({ status: 'saved' })
      } catch (error) {
        publish({ status: 'failure' })
      } finally {
        publish({ busy: false })
      }
    },
    async requestPermission() {
      if (disposed || state.busy) return
      publish({ busy: true })
      try {
        await notifier.requestPermission()
        connect()
      } catch (error) {
        publish({ status: 'failure' })
      } finally {
        publish({ busy: false })
      }
    },
    test() {
      notifier.test()
    },
    dispose() {
      disposed = true
      generation += 1
      abort.abort()
      source?.close()
      windowObject.removeEventListener('focus', onFocus)
      notifier.dispose()
      listeners.clear()
    }
  }
}

/** Render the six switches with the same native controls as built-in DSH pages. */
function NotificationsSection({ controller, t }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 0' }
  return h(
    'section',
    { 'aria-label': t('title'), style: { padding: 16 } },
    h('h3', null, t('title')),
    h('p', null, t('description')),
    ...ORDER.map(kind =>
      h(
        'div',
        { key: kind, style: rowStyle },
        h('span', null, t(kind)),
        h(Switch, { label: t(kind), checked: state.values[kind], disabled: !state.loaded || state.busy, onChange: value => void controller.save(kind, value) })
      )
    ),
    h('p', null, `${t('permission')}: ${t(state.permission)}`),
    state.permission === 'denied' ? h('p', null, t('help')) : null,
    h('p', null, t(state.connected ? (state.active ? 'receiver' : 'standby') : 'reconnecting')),
    h(
      'div',
      { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
      h(
        Button,
        { variant: 'primary', disabled: state.busy || state.permission === 'unsupported' || state.permission === 'granted', onClick: () => void controller.requestPermission() },
        t('request')
      ),
      h(Button, { variant: 'outline', disabled: state.busy || state.permission !== 'granted', onClick: () => controller.test() }, t('test')),
      h(Button, { variant: 'ghost', disabled: state.busy, onClick: () => void controller.refresh() }, t('refresh'))
    ),
    h('p', { role: 'status', 'aria-live': 'polite' }, t(state.status))
  )
}

/** Register a locale-owned settings section and one receiver per plugin lifetime. */
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, dictionaries))
  const t = ctx.locale.bind(NS)
  const controller = createClient({
    fetcher: window.fetch.bind(window),
    EventSourceClass: window.EventSource,
    NotificationClass: window.Notification,
    windowObject: window,
    openSession: id => ctx.uiWorkspace.openSession(id),
    t
  })
  ctx.effect(() => {
    controller.start()
    return () => controller.dispose()
  })
  ctx.effect(() =>
    ctx.slots.inject('settings.section', () =>
      ctx.slots.register(
        {
          name: 'settings.section',
          id: NS,
          order: 90,
          locale: NS,
          label: () => t('title'),
          inject: () => ({ controller })
        },
        NotificationsSection
      )
    )
  )
}

return { name, inject, createClient, NotificationsSection, apply }
}
    };
    const local = (moduleId) => cache[moduleId] ?? (cache[moduleId] = modules[moduleId]());
    return local('client');
  }
});
