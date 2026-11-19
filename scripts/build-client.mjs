// Assemble lib/client.js: one lazy `window.__ModuleLoader__.load` factory whose id is the package name.
// The module table holds the shared vocabulary, the notifier, and the settings section, in that order.
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const id = manifest.name

if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) throw new Error(`Package name is not a module id: ${id}`)

const source = path => readFile(resolve(root, path), 'utf8')

/** Drop ESM export keywords so the module body runs inside the factory. */
const asModuleBody = text => text.replace(/^export (?:const|function|async function|class|let)\b/gm, match => match.slice('export '.length))

/** Collect the names a module exports so the factory can return them. */
const exportNames = text => {
  const names = []
  for (const match of text.matchAll(/^export (?:const|function|async function|class|let)\s+([A-Za-z_$][\w$]*)/gm)) names.push(match[1])
  return names
}

/** End every module body with an explicit return so the table can hand out its exports. */
function moduleBody(text, names) {
  const body = asModuleBody(text).trim()
  if (/^return \{/m.test(body)) return body
  if (names.length === 0) throw new Error('A module without a return must export something.')
  return `${body}\n\nreturn { ${names.join(', ')} }`
}

/** Rewrite ESM import specifiers into a destructuring pattern. */
function toDestructure(names) {
  const specifiers = names
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const alias = part.match(/^(\S+)\s+as\s+(\S+)$/)
      return alias ? `${alias[1]}: ${alias[2]}` : part
    })
  if (specifiers.length === 0) throw new Error('Empty import list.')
  return specifiers.join(', ')
}

/** Replace one single-line import with a lookup in the local module table. */
function localImport(text, moduleId) {
  return text.replace(new RegExp(`^import \\{([^}]*)\\} from '\\./${moduleId}\\.js'$`, 'm'), (match, names) => {
    return `const { ${toDestructure(names)} } = local(${JSON.stringify(moduleId)})`
  })
}

const sharedSource = await source('lib/shared.js')
const notificationsSource = await source('lib/notifications.js')
const clientSource = await source('src/client.js')

const shared = moduleBody(sharedSource, exportNames(sharedSource))
const notifications = moduleBody(localImport(notificationsSource, 'shared'), exportNames(notificationsSource))
const client = moduleBody(
  localImport(
    localImport(
      clientSource
        .replace(/^import \{([^}]*)\} from 'react'$/m, (match, names) => `const { ${toDestructure(names)} } = require("react")`)
        .replace(/^import \{([^}]*)\} from '@deepseek-ai\/dsh-client-ui-primitives'$/m, (match, names) => `const { ${toDestructure(names)} } = require("@deepseek-ai/dsh-client-ui-primitives")`),
      'shared'
    ),
    'notifications'
  ),
  exportNames(clientSource)
).trim()

const modules = [
  ['shared', shared],
  ['notifications', notifications],
  ['client', localImport(localImport(client, 'shared'), 'notifications').trim()]
]

const table = modules
  .map(([moduleId, body]) => `${JSON.stringify(moduleId)}: () => {\n${body}\n}`)
  .join(',\n')

const output = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(id)},
  factory: (require) => {
    const cache = Object.create(null);
    const modules = {
${table}
    };
    const local = (moduleId) => cache[moduleId] ?? (cache[moduleId] = modules[moduleId]());
    return local('client');
  }
});
`

// Fail on an unresolved import instead of shipping a factory that throws at load time.
const leftovers = output.match(/^import .*$/gm)
if (leftovers) throw new Error(`Unresolved imports:\n${leftovers.join('\n')}`)
if (output.includes('export const') || output.includes('export function')) throw new Error('Unresolved export keyword in the client artifact.')

await writeFile(resolve(root, 'lib/client.js'), output)
