// Host-level check for the configuration store: defaults, partial saves, and persistence.
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { createStore } from '../lib/store.js'

const directory = await mkdtemp(join(tmpdir(), 'dsh-notifications-'))
const file = join(directory, 'settings.json')
try {
  const store = await createStore(file)
  const initial = store.snapshot()
  assert.deepEqual(initial.values, { ask: true, question: true, done: true, error: true, 'subagent-done': false, 'turn-end': false })
  assert.deepEqual(initial.details, { ask: true, question: true, done: false, error: true, 'subagent-done': false, 'turn-end': false })
  assert.deepEqual(initial.templates, {})
  assert.equal(initial.title, '')
  assert.equal(initial.revision, 0)

  await store.update({ values: { done: false } })
  await store.update({ templates: { done: '✅ {session}' } })
  await store.update({ details: { error: false } })
  await store.update({ title: '{session} · DSH' })
  const saved = store.snapshot()
  assert.equal(saved.values.done, false)
  assert.equal(saved.templates.done, '✅ {session}')
  assert.equal(saved.details.error, false)
  assert.equal(saved.details.ask, true, 'a partial detail save must not reset the other kinds')
  assert.equal(saved.title, '{session} · DSH')
  assert.equal(saved.revision, 4)

  // The file keeps the flat shape and reloads into the same configuration.
  const written = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(written.done, false)
  assert.deepEqual(written.templates, { done: '✅ {session}' })
  assert.deepEqual(written.details, { ask: true, question: true, done: false, error: false, 'subagent-done': false, 'turn-end': false })
  const reloaded = await createStore(file)
  assert.deepEqual(reloaded.snapshot().values, saved.values)
  assert.deepEqual(reloaded.snapshot().templates, saved.templates)
  assert.deepEqual(reloaded.snapshot().details, saved.details)
  assert.equal(reloaded.snapshot().title, saved.title)
  await store.close()
  await reloaded.close()

  // A file written by the earlier release still loads with the new defaults.
  const legacy = join(directory, 'legacy.json')
  await createStore(legacy)
  const { writeFile } = await import('node:fs/promises')
  await writeFile(legacy, JSON.stringify({ ask: true, question: true, done: true, error: true, 'subagent-done': false, 'turn-end': false }))
  const legacyStore = await createStore(legacy)
  assert.deepEqual(legacyStore.snapshot().templates, {})
  assert.deepEqual(legacyStore.snapshot().details, { ask: true, question: true, done: false, error: true, 'subagent-done': false, 'turn-end': false })
  await legacyStore.close()

  console.log('host store: ok')
} finally {
  await rm(directory, { recursive: true, force: true })
}
