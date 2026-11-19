window.__ModuleLoader__.load({
  id: "dsh-windows-notifications",
  factory: (require) => {
    const cache = Object.create(null);
    const modules = {
"shared": () => {
/** Fixed wire vocabulary shared by the Host and renderer. */
const KINDS = Object.freeze(['ask', 'question', 'done', 'error', 'subagent-done', 'turn-end'])
const DEFAULTS = Object.freeze({ ask: true, question: true, done: true, error: true, 'subagent-done': false, 'turn-end': false })
/** Event details are opt-in per kind; the actionable kinds start enabled. */
const DETAIL_DEFAULTS = Object.freeze({ ask: true, question: true, done: true, error: true, 'subagent-done': false, 'turn-end': false })
/** Colored status glyphs Windows renders in notification bodies. */
const DOTS = Object.freeze({ ask: '🟡', question: '🟡', done: '🟢', 'subagent-done': '🟢', 'turn-end': '🟢', error: '🔴' })
const BASE_PATH = '/dsh-windows-notifications'
/** Notification titles stay one short single line. */
const TITLE_MAX_CHARS = 80
/** Custom notification text stays one short single line. */
const TEMPLATE_MAX_CHARS = 240
/** Event detail text stays one short single line. */
const DETAIL_MAX_CHARS = 240
/** The last assistant reply is a summary line, not a transcript copy. */
const SUMMARY_MAX_CHARS = 160

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

/** Collapse any text into one bounded single line. */
function sanitizeLine(value, maxChars) {
  if (typeof value !== 'string') return ''
  const line = value
    .replace(/[^\S\r\n]+/gu, ' ')
    .replace(/[\r\n\t\x00-\x1f\x7f]/gu, ' ')
    .replace(/ {2,}/gu, ' ')
    .trim()
  if (line.length === 0) return ''
  return line.length > maxChars ? `${line.slice(0, maxChars - 1)}…` : line
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

/** Normalize the per-kind custom text map; an empty string means "use the built-in text". */
function validateTemplates(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected an object of notification templates.')
  const result = {}
  for (const key of Object.keys(value)) {
    if (!KINDS.includes(key)) continue
    if (typeof value[key] !== 'string') throw new TypeError('Notification templates must be strings.')
    const clean = sanitizeLine(value[key], TEMPLATE_MAX_CHARS)
    if (clean.length === 0) continue
    result[key] = clean
  }
  return result
}

/** Normalize the per-kind detail switches. */
function validateDetails(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected an object of detail switches.')
  const result = {}
  for (const key of Object.keys(value)) {
    if (!KINDS.includes(key)) continue
    if (typeof value[key] !== 'boolean') throw new TypeError('Detail switches must be booleans.')
    result[key] = value[key]
  }
  return result
}

/** Normalize the optional notification title template. */
function validateTitle(value) {
  if (typeof value !== 'string') throw new TypeError('The notification title must be a string.')
  return sanitizeLine(value, TEMPLATE_MAX_CHARS)
}

/** Validate a complete configuration: event switches, custom text, and detail switches. */
function validateConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected an object with boolean fields.')
  return {
    values: validateSettings(value),
    templates: value.templates === undefined ? {} : validateTemplates(value.templates),
    details: value.details === undefined ? { ...DETAIL_DEFAULTS } : { ...DETAIL_DEFAULTS, ...validateDetails(value.details) },
    title: value.title === undefined ? '' : validateTitle(value.title)
  }
}

/** Validate one partial save request. */
function validatePatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected an object with boolean fields.')
  const values = {}
  for (const key of Object.keys(value)) {
    if (!KINDS.includes(key)) continue
    if (typeof value[key] !== 'boolean') throw new TypeError('Event switches must be booleans.')
    values[key] = value[key]
  }
  const patch = {}
  if (Object.keys(values).length > 0) patch.values = values
  if (value.templates !== undefined) patch.templates = validateTemplates(value.templates)
  if (value.details !== undefined) patch.details = validateDetails(value.details)
  if (value.title !== undefined) patch.title = validateTitle(value.title)
  if (Object.keys(patch).length === 0) throw new TypeError('Nothing to save.')
  return patch
}

/** Replace the known placeholders in one custom template. */
function renderTemplate(template, vars) {
  let text = String(template).replace(/\{(dot|kind|session|detail|time)\}/gu, (match, name) => (typeof vars[name] === 'string' ? vars[name] : ''))
  // An empty variable must not leave a dangling separator behind.
  text = text.replace(/\s*·\s*(?=·|$)/gu, ' ')
  return text.replace(/ {2,}/gu, ' ').trim()
}

/** Parse a bounded notification received from the Host. */
function validateNotice(value) {
  if (!value || typeof value !== 'object' || !KINDS.includes(value.kind) || !validId(value.id) || !validId(value.sessionId)) return null
  if (!Number.isSafeInteger(value.time) || value.time < 0) return null
  const title = sanitizeTitle(value.title)
  const detail = value.detail === undefined ? undefined : sanitizeLine(value.detail, DETAIL_MAX_CHARS)
  return {
    id: value.id,
    kind: value.kind,
    sessionId: value.sessionId,
    time: value.time,
    ...(title === undefined ? {} : { title }),
    ...(detail === undefined || detail.length === 0 ? {} : { detail })
  }
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

/** Join the readable parts of an event into one bounded detail line. */
function detailOf(parts) {
  const text = sanitizeLine(
    parts
      .filter(part => typeof part === 'string')
      .map(part => part.trim())
      .filter(part => part.length > 0)
      .join(' · '),
    DETAIL_MAX_CHARS
  )
  return text.length === 0 ? undefined : text
}

/** Read the first usable message out of the shapes DSH uses for failures. */
function failureText(source) {
  if (!source || typeof source !== 'object') return undefined
  const candidates = [source.message, source.error?.message, source.reason?.message, source.error, source.reason]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate
  }
  return undefined
}

/** Read the text of one assistant message; reasoning blocks stay out of the notification. */
function assistantText(message) {
  if (!message || typeof message !== 'object') return undefined
  const content = message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return undefined
  const parts = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    if (block.type !== undefined && block.type !== 'text') continue
    if (typeof block.text === 'string' && block.text.trim().length > 0) parts.push(block.text.trim())
  }
  return parts.length === 0 ? undefined : parts.join(' ')
}

/** Pure state transition over observed DSH events. The caller owns the state map. */
function classifyEvent(state, type, payload) {
  const notices = []
  const next = { ...state }
  const add = (kind, sessionId, key, detail) => {
    if (!validId(sessionId)) return
    const line = detail === undefined ? undefined : sanitizeLine(detail, DETAIL_MAX_CHARS)
    notices.push({ kind, sessionId, key, ...(line === undefined || line.length === 0 ? {} : { detail: line }) })
  }
  switch (type) {
    case 'approval/request':
      if (!payload.signal?.aborted) add('ask', payload.agent?.id, payload.callId, detailOf([payload.toolName, payload.reason]))
      break
    case 'user-questions/request': {
      if (!payload.signal?.aborted) {
        const question = payload.questions?.[0]
        add('question', payload.agent?.id, payload.wait?.callId, detailOf([question?.header, question?.question]))
      }
      break
    }
    case 'agent/status':
      if (payload.status === 'running') {
        next.running = true
        next.ended = undefined
      }
      if (payload.status === 'idle' && state.running) {
        next.running = false
        if (state.ended?.reason.kind === 'completed' && payload.agent.session.header.origin !== 'subagent') {
          // The last assistant reply of the finished turn is the summary of the work.
          add('done', payload.agent.id, `turn-${state.ended.turn}`, state.lastText)
        }
      }
      break
    case 'session/event': {
      const { session, event } = payload
      if (event.type === 'turn/start') {
        next.lastText = undefined
        break
      }
      if (event.type === 'assistant/message') {
        const text = assistantText(event.data?.message)
        if (text !== undefined) next.lastText = sanitizeLine(text, SUMMARY_MAX_CHARS)
        break
      }
      if (event.type !== 'turn/end') break
      next.ended = event.data
      if (session.header.origin !== 'subagent' && event.data.reason.kind !== 'forked') {
        add('turn-end', session.id, `turn-${event.data.turn}`, state.lastText)
      }
      if (event.data.reason.kind === 'error') add('error', session.id, `turn-${event.data.turn}`, failureText(event.data.reason))
      break
    }
    case 'agent/error':
      add('error', payload.agent.id, `turn-${payload.turn}`, failureText(payload.error) ?? failureText(payload))
      break
    case 'agent-loop/config-start-failed':
      add('error', payload.sessionId, undefined, failureText(payload.error) ?? failureText(payload))
      break
    case 'subagent/end':
      if (payload.stopReason === 'completed') add('subagent-done', payload.id, payload.runId)
      if (payload.stopReason === 'error') add('error', payload.id, payload.runId, failureText(payload.error) ?? failureText(payload))
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
    customText: 'Custom notification text',
    titleTemplate: 'Notification title',
    titlePlaceholder: '{session} · DeepSeek Harness',
    includeDetail: 'Include the event detail',
    placeholders: 'Variables: {dot} {kind} {session} {detail} {time}',
    template: '{dot} {kind} · Click to open the related DeepSeek Harness session.',
    templateSummary: '{dot} {kind} · {detail}',
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
    customText: '自定义通知文案',
    titleTemplate: '通知标题',
    titlePlaceholder: '{session} · DeepSeek Harness',
    includeDetail: '附带事件详情',
    placeholders: '可用变量：{dot} {kind} {session} {detail} {time}',
    template: '{dot} {kind} · 点击打开对应的 DeepSeek Harness 会话。',
    templateSummary: '{dot} {kind} · {detail}',
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

return { KINDS, DEFAULTS, DETAIL_DEFAULTS, DOTS, BASE_PATH, TITLE_MAX_CHARS, TEMPLATE_MAX_CHARS, DETAIL_MAX_CHARS, SUMMARY_MAX_CHARS, validateSettings, sanitizeLine, sanitizeTitle, validId, validateTemplates, validateDetails, validateTitle, validateConfig, validatePatch, renderTemplate, validateNotice, createDedupe, classifyEvent, COPY, copyFor }
},
"notifications": () => {
const { createDedupe, validateNotice } = local("shared")

/** Hold renderer Notification objects until close, and release callbacks on disposal. */
function createNotifier({ NotificationClass, windowObject, openSession, copy, render, onStatus = () => {} }) {
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
      const rendered = test ? { title: copy('testTitle'), body: copy('testBody') } : render(notice)
      const heading = rendered.title
      const body = rendered.body
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
const { createElement: h, useSyncExternalStore, useState } = require("react")
const { Switch, Button, Input } = require("@deepseek-ai/dsh-client-ui-primitives")
const { BASE_PATH, DEFAULTS, DETAIL_DEFAULTS, DOTS, KINDS, COPY, renderTemplate, validateSettings, validateTemplates, validateDetails, validateTitle } = local("shared")
const { createNotifier } = local("notifications")

const name = 'dsh-windows-notifications'
const inject = ['slots', 'locale', 'uiWorkspace']
const NS = 'dsh-windows-notifications'
const ORDER = ['ask', 'question', 'done', 'subagent-done', 'error', 'turn-end']
const dictionaries = {
  en: { ...COPY.en, ask: 'Approval waiting', question: 'Question for you', 'subagent-done': 'Subtask completed', error: 'Task error', 'turn-end': 'Turn completed' },
  zh: { ...COPY.zh, ask: '审批等待', question: '向你提问', 'subagent-done': '子任务完成', error: '任务出错', 'turn-end': '轮次完成' }
}

/** The built-in text of one kind: kinds that carry a detail show it, the others keep the click hint. */
function defaultTemplateFor(kind, t) {
  return DETAIL_DEFAULTS[kind] ? t('templateSummary') : t('template')
}

/** Own the HTTP requests, notification receiver, and browser permission lifecycle. */
function createClient({ fetcher, EventSourceClass, NotificationClass, windowObject, openSession, t }) {
  const listeners = new Set()
  const abort = new AbortController()
  const timers = new Map()
  // The notifier reads the live configuration when a notification arrives.
  const live = { templates: {}, title: '' }
  let disposed = false
  let source
  let revision = -1
  let generation = 0
  let state = {
    values: { ...DEFAULTS },
    templates: {},
    details: { ...DETAIL_DEFAULTS },
    title: '',
    loaded: false,
    busy: false,
    permission: 'unsupported',
    connected: false,
    active: false,
    status: 'loading'
  }
  const publish = patch => {
    if (disposed) return
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }
  /** Build the toast title and body from the template the user configured. */
  const render = notice => {
    const kind = notice.kind
    const vars = {
      dot: DOTS[kind] ?? '🟡',
      kind: t(kind),
      session: notice.title ?? '',
      detail: notice.detail ?? '',
      time: new Date(notice.time).toLocaleTimeString()
    }
    const fallback = renderTemplate(defaultTemplateFor(kind, t), vars)
    const body = renderTemplate(live.templates[kind] ?? defaultTemplateFor(kind, t), vars) || fallback
    // Without a session title the toast keeps the product name instead of an empty template.
    const title = notice.title === undefined ? 'DeepSeek Harness' : live.title ? renderTemplate(live.title, vars) || notice.title : notice.title
    return { title, body }
  }
  const notifier = createNotifier({ NotificationClass, windowObject, openSession, copy: t, render, onStatus: status => publish({ status }) })
  const accept = snapshot => {
    if (!Number.isSafeInteger(snapshot?.revision) || snapshot.revision < 0) throw new TypeError('Invalid configuration revision.')
    const values = validateSettings(snapshot.values)
    if (snapshot.revision < revision) return
    revision = snapshot.revision
    const templates = snapshot.templates === undefined ? {} : validateTemplates(snapshot.templates)
    const details = snapshot.details === undefined ? { ...DETAIL_DEFAULTS } : { ...DETAIL_DEFAULTS, ...validateDetails(snapshot.details) }
    const title = snapshot.title === undefined ? '' : validateTitle(snapshot.title)
    live.templates = templates
    live.title = title
    publish({ values, templates, details, title, loaded: true })
  }
  /** Keep only the fields the Host understands. */
  const normalize = patch => {
    const body = {}
    for (const key of Object.keys(patch)) {
      if (KINDS.includes(key)) {
        if (typeof patch[key] !== 'boolean') throw new TypeError('Event switches must be booleans.')
        body[key] = patch[key]
      }
    }
    if (patch.templates !== undefined) body.templates = validateTemplates(patch.templates)
    if (patch.details !== undefined) body.details = validateDetails(patch.details)
    if (patch.title !== undefined) body.title = validateTitle(patch.title)
    if (Object.keys(body).length === 0) throw new TypeError('Nothing to save.')
    return body
  }
  const request = async patch => {
    const response = await fetcher(`${BASE_PATH}/settings`, {
      method: patch ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: abort.signal,
      headers: { 'Content-Type': 'application/json', 'x-dsh-notifications': '1' },
      ...(patch ? { body: JSON.stringify(patch) } : {})
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
        await request(normalize({ [kind]: value }))
        publish({ status: 'saved' })
      } catch (error) {
        publish({ status: 'failure' })
      } finally {
        publish({ busy: false })
      }
    },
    /** Save one custom text after the user stops typing. */
    saveTemplate(kind, text) {
      if (disposed || !state.loaded) return
      publish({ templates: { ...state.templates, [kind]: text } })
      const pending = timers.get(kind)
      if (pending) clearTimeout(pending)
      timers.set(
        kind,
        setTimeout(() => {
          timers.delete(kind)
          void (async () => {
            try {
              await request(normalize({ templates: { [kind]: text } }))
              publish({ status: 'saved' })
            } catch (error) {
              publish({ status: 'failure' })
            }
          })()
        }, 500)
      )
    },
    async saveDetail(kind, value) {
      if (disposed || state.busy || !state.loaded) return
      publish({ busy: true, status: 'saving' })
      try {
        await request(normalize({ details: { [kind]: value } }))
        publish({ status: 'saved' })
      } catch (error) {
        publish({ status: 'failure' })
      } finally {
        publish({ busy: false })
      }
    },
    async saveTitle(text) {
      if (disposed || state.busy || !state.loaded) return
      publish({ busy: true, status: 'saving' })
      try {
        await request(normalize({ title: text }))
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
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      windowObject.removeEventListener('focus', onFocus)
      notifier.dispose()
      listeners.clear()
    }
  }
}

/** Render the six switches with the same native controls as built-in DSH pages. */
function NotificationsSection({ controller, t }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const [custom, setCustom] = useState(false)
  const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 0' }
  const fieldStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '4px 0 8px 16px' }
  const inputStyle = { flex: 1, minWidth: 0 }
  return h(
    'section',
    { 'aria-label': t('title'), style: { padding: 16 } },
    h('h3', null, t('title')),
    h('p', null, t('description')),
    h(
      'div',
      { style: rowStyle },
      h('span', null, t('customText')),
      h(Switch, { label: t('customText'), checked: custom, onChange: value => setCustom(Boolean(value)) })
    ),
    ...ORDER.map(kind =>
      h(
        'div',
        { key: kind },
        h(
          'div',
          { style: rowStyle },
          h('span', null, t(kind)),
          h(Switch, { label: t(kind), checked: state.values[kind], disabled: !state.loaded || state.busy, onChange: value => void controller.save(kind, value) })
        ),
        custom
          ? h(
              'div',
              { style: fieldStyle },
              h(Input, {
                id: `dsh-notification-template-${kind}`,
                style: inputStyle,
                value: state.templates[kind] ?? '',
                placeholder: defaultTemplateFor(kind, t),
                onChange: event => controller.saveTemplate(kind, event.target.value)
              }),
              h(Switch, {
                label: t('includeDetail'),
                checked: state.details[kind],
                disabled: state.busy,
                onChange: value => void controller.saveDetail(kind, value)
              })
            )
          : null
      )
    ),
    custom
      ? h(
          'div',
          { style: fieldStyle },
          h('span', null, t('titleTemplate')),
          h(Input, {
            id: 'dsh-notification-title',
            style: inputStyle,
            value: state.title,
            placeholder: t('titlePlaceholder'),
            onChange: event => void controller.saveTitle(event.target.value)
          })
        )
      : null,
    custom ? h('p', null, t('placeholders')) : null,
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
