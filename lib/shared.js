/** Fixed wire vocabulary shared by the Host and renderer. */
export const KINDS = Object.freeze(['ask', 'question', 'done', 'error', 'subagent-done', 'turn-end'])
export const DEFAULTS = Object.freeze({ ask: true, question: true, done: true, error: true, 'subagent-done': false, 'turn-end': false })
/** Event details are opt-in per kind; the actionable kinds start enabled. */
export const DETAIL_DEFAULTS = Object.freeze({ ask: true, question: true, done: true, error: true, 'subagent-done': false, 'turn-end': false })
/** Colored status glyphs Windows renders in notification bodies. */
export const DOTS = Object.freeze({ ask: '🟡', question: '🟡', done: '🟢', 'subagent-done': '🟢', 'turn-end': '🟢', error: '🔴' })
export const BASE_PATH = '/dsh-windows-notifications'
/** Notification titles stay one short single line. */
export const TITLE_MAX_CHARS = 80
/** Custom notification text stays one short single line. */
export const TEMPLATE_MAX_CHARS = 240
/** Event detail text stays one short single line. */
export const DETAIL_MAX_CHARS = 400
/** The last assistant reply is a summary line, not a transcript copy. */
export const SUMMARY_MAX_CHARS = 240

/** Reject non-boolean persisted or HTTP values; unknown keys are dropped for forward compatibility. */
export function validateSettings(value, partial = false) {
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
export function sanitizeLine(value, maxChars) {
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
export function sanitizeTitle(value) {
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
export function validId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\s\x00-\x1f\x7f]/u.test(value)
}

/** Normalize the per-kind custom text map; an empty string means "use the built-in text". */
export function validateTemplates(value) {
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
export function validateDetails(value) {
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
export function validateTitle(value) {
  if (typeof value !== 'string') throw new TypeError('The notification title must be a string.')
  return sanitizeLine(value, TEMPLATE_MAX_CHARS)
}

/** Validate a complete configuration: event switches, custom text, and detail switches. */
export function validateConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected an object with boolean fields.')
  return {
    values: validateSettings(value),
    templates: value.templates === undefined ? {} : validateTemplates(value.templates),
    details: value.details === undefined ? { ...DETAIL_DEFAULTS } : { ...DETAIL_DEFAULTS, ...validateDetails(value.details) },
    title: value.title === undefined ? '' : validateTitle(value.title)
  }
}

/** Validate one partial save request. */
export function validatePatch(value) {
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
export function renderTemplate(template, vars) {
  let text = String(template).replace(/\{(dot|kind|session|detail|time)\}/gu, (match, name) => (typeof vars[name] === 'string' ? vars[name] : ''))
  // An empty variable must not leave a dangling separator behind.
  text = text.replace(/\s*·\s*(?=·|$)/gu, ' ')
  return text.replace(/ {2,}/gu, ' ').trim()
}

/** Parse a bounded notification received from the Host. */
export function validateNotice(value) {
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
export function createDedupe({ limit = 1024, ttlMs = 120000, now = Date.now } = {}) {
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
  if (typeof source === 'string' && source.trim().length > 0) return source
  if (!source || typeof source !== 'object') return undefined
  // DSH errors carry an uppercase code (e.g. INVALID_REQUEST) plus a human message.
  const candidates = [
    source.message,
    source.error?.message,
    source.reason?.message,
    source.error?.code,
    source.reason?.code,
    source.code,
    source.error,
    source.reason
  ]
  const parts = []
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) continue
    const line = candidate.trim()
    if (!parts.includes(line)) parts.push(line)
    if (parts.length >= 2) break
  }
  return parts.length === 0 ? undefined : parts.join(' · ')
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
export function classifyEvent(state, type, payload) {
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
export const COPY = Object.freeze({
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
export function copyFor(language) {
  return COPY[String(language).startsWith('zh') ? 'zh' : 'en']
}
