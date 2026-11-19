import { createElement as h, useSyncExternalStore, useState } from 'react'
import { Switch, Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { BASE_PATH, DEFAULTS, DETAIL_DEFAULTS, DOTS, KINDS, COPY, renderTemplate, validateSettings, validateTemplates, validateDetails, validateTitle } from './shared.js'
import { createNotifier } from './notifications.js'

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
