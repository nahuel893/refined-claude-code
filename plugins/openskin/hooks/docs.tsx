import type { EngineInterface } from 'claude-code'
import type { DocEntry, DocsIndex } from '../types'

/**
 * The project's docs index: the reference documents (architecture, design, notes, ODD files)
 * Claude keeps listed through the `docs` tool, for the status panel's Docs tab. The index belongs
 * to the project, not the session: it lives in `docs.json` beside the project's session folders,
 * so every session in the project sees the same list and nothing is written into the repository.
 * Paths are kept relative to the project's directory. The tool writes the index file alone: no
 * document is ever written, moved or deleted.
 */
const PROJECTS = '.cache/refined-claude-code/projects'

/** The group of a document added with none. */
export const DEFAULT_GROUP = 'Docs'

/** The docs tool's short name; the model calls it as `mcp__openskin__docs`. */
export const DOCS_TOOL_NAME = 'docs'

/** The docs tool as the model calls it: `mcp__<plugin>__<name>`. */
export const DOCS_TOOL = `mcp__openskin__${DOCS_TOOL_NAME}`

export const DOCS_TOOL_DESCRIPTION = [
  "Keep this project's index of reference documents (architecture, design, notes, ODD files), shown to the user in the Docs tab of the status panel.",
  'add: index a document by its path in the project, with a group such as Architecture, Design, Notes or ODD; adding an indexed path again moves it to that group.',
  'remove: drop a path from the index; the file is left alone.',
  'list: the index, numbered.',
  'The tool never writes the documents themselves.',
].join(' ')

export const DOCS_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['add', 'remove', 'list'], description: 'add or remove a document, or list the index' },
    path: { type: 'string', description: "add, remove: the document's path, relative to the project or absolute inside it" },
    group: { type: 'string', description: 'add: the group it is listed under, such as Architecture, Design, Notes or ODD (default Docs)' },
  },
  required: ['action'],
} as const

/** The line the session start hands the model, as the tool may wait behind ToolSearch. */
export const docsHintOf = (tool: string) =>
  `Docs: keep this project's index of reference documents with the ${tool} tool: add the architecture, design, notes and ODD documents you write or rely on, each under a group, and remove those that go away.`

/** The project's index file: `docs.json` in the project's folder (its slug: every `/` of `cwd` a `-`). */
export const docsIndexPath = (home: string, cwd: string) => `${home}/${PROJECTS}/${cwd.replace(/\//g, '-')}/docs.json`

/**
 * `raw` as a path relative to the project in `cwd`: absolute, `~/`, `./` and `..` resolved by
 * spelling alone. null when it lands outside the project, or on the project's directory itself.
 */
export const projectPath = (cwd: string, home: string, raw: string): string | null => {
  let path = raw.trim()
  if (path === '~' || path.startsWith('~/')) path = `${home}${path.slice(1)}`
  const parts: string[] = []
  for (const part of (path.startsWith('/') ? path : `${cwd}/${path}`).split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  const root = cwd.replace(/\/+$/, '')
  const full = `/${parts.join('/')}`

  return full.startsWith(`${root}/`) ? full.slice(root.length + 1) : null
}

/** A group's name as given: spaces collapsed, the default for none. */
const groupName = (raw: unknown) => (typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '') || DEFAULT_GROUP

/** `index` with its groups in first-use order, those no document uses dropped. */
const tidy = (groups: string[], docs: DocEntry[]): DocsIndex => {
  const used = new Set(docs.map(doc => doc.group))
  const kept = groups.filter((group, i) => used.has(group) && groups.indexOf(group) === i)
  for (const doc of docs) if (!kept.includes(doc.group)) kept.push(doc.group)

  return { groups: kept, docs }
}

/**
 * The index file's text as an index: a file that is not JSON, or not an index, reads as empty, and
 * entries of the wrong shape, or with a path that is not a plain one inside the project, are
 * skipped. Never throws.
 */
export const parseDocsIndex = (text: string): DocsIndex => {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { groups: [], docs: [] }
  }
  const value = (raw ?? {}) as { groups?: unknown; docs?: unknown }
  const groups = Array.isArray(value.groups) ? value.groups.filter((group): group is string => typeof group === 'string') : []
  const docs: DocEntry[] = []
  for (const entry of Array.isArray(value.docs) ? value.docs : []) {
    const { path, group } = (entry ?? {}) as { path?: unknown; group?: unknown }
    if (typeof path !== 'string' || projectPath('/p', '/h', path) !== path) continue
    if (docs.some(doc => doc.path === path)) continue
    docs.push({ path, group: groupName(group) })
  }

  return tidy(groups.map(groupName), docs)
}

/** The index as file text. */
export const docsIndexText = (index: DocsIndex) => `${JSON.stringify(index, null, 2)}\n`

/** The index as the tool answers it: each group's name, then its documents numbered from 1 in that order. */
export const numberedIndex = (index: DocsIndex) => {
  if (index.docs.length === 0) return 'The docs index is empty.'
  const lines: string[] = []
  let n = 0
  for (const group of index.groups) {
    lines.push(group)
    for (const doc of index.docs) if (doc.group === group) lines.push(`${++n}. ${doc.path}`)
  }
  return lines.join('\n')
}

const documentsOf = (count: number) => `${count} document${count === 1 ? '' : 's'}`

/**
 * One tool call applied to the index: the new index when it changed, and the text the model reads.
 * A call that cannot apply changes nothing and says why in one line.
 */
export const applyDocsCall = (
  index: DocsIndex,
  input: Record<string, unknown>,
  project: { cwd: string; home: string },
): { index?: DocsIndex; reply: string } => {
  const { action } = input
  if (action === 'list') return { reply: numberedIndex(index) }
  if (action !== 'add' && action !== 'remove') return { reply: `Unknown action ${String(action)}: use add, remove or list.` }

  const raw = typeof input.path === 'string' ? input.path.trim() : ''
  if (!raw) return { reply: "Give the document's path." }
  const path = projectPath(project.cwd, project.home, raw)
  if (path === null) return { reply: `Not ${action === 'add' ? 'added' : 'removed'}: ${raw} is outside the project (${project.cwd}).` }
  const current = index.docs.find(doc => doc.path === path)

  if (action === 'remove') {
    if (!current) return { reply: `${path} is not in the index.` }
    const next = tidy(index.groups, index.docs.filter(doc => doc !== current))
    return { index: next, reply: `ok · removed ${path} · ${documentsOf(next.docs.length)}\n${numberedIndex(next)}` }
  }

  // A group named in another case joins the one already listed.
  const wanted = groupName(input.group)
  const group = index.groups.find(each => each.toLowerCase() === wanted.toLowerCase()) ?? wanted
  if (current?.group === group) return { reply: `${path} is already in ${group}.\n${numberedIndex(index)}` }

  const next = tidy([...index.groups, group], [...index.docs.filter(doc => doc !== current), { path, group }])
  const verb = current ? 'moved' : 'added'
  return { index: next, reply: `ok · ${verb} ${path} to ${group} · ${documentsOf(next.docs.length)}\n${numberedIndex(next)}` }
}

/**
 * Where the docs tool keeps the project's index: the project (known once `session.start` has read
 * the home), and the chain of calls in flight, so each reads the index the one before wrote.
 */
export type DocsStore = { home: string; cwd: string; chain: Promise<void> }

export const createDocsStore = (): DocsStore => ({ home: '', cwd: '', chain: Promise.resolve() })

/** The project's index as the file holds it; a missing or unreadable file reads as empty. */
export async function readDocsIndex($: EngineInterface, home: string, cwd: string): Promise<DocsIndex> {
  const text = await $.fs.read(docsIndexPath(home, cwd)).catch(() => '')

  return parseDocsIndex(text)
}

/** Applies one call to the index file: reads it, applies, writes it back when it changed. */
async function applyDocsTool($: EngineInterface, store: DocsStore, input: Record<string, unknown>): Promise<string> {
  try {
    if (!store.home || !store.cwd) return 'Docs index not changed: HOME is not set'
    const index = await readDocsIndex($, store.home, store.cwd)
    const { index: next, reply } = applyDocsCall(index, input, store)
    if (next) await $.fs.write(docsIndexPath(store.home, store.cwd), docsIndexText(next))

    return reply
  } catch (error) {
    return `Docs index not changed: ${error instanceof Error ? error.message : String(error)}`
  }
}

/**
 * (A function declaration: the engine follows `$` past an import only into one.)
 * Serves one docs tool call after the calls in flight, so no two read the index before either
 * wrote it and no entry is lost. A failure is a reply too, never a throw.
 */
export async function callDocsTool($: EngineInterface, store: DocsStore, input: Record<string, unknown>): Promise<string> {
  const applied = store.chain.then(() => applyDocsTool($, store, input))
  store.chain = applied.then(
    () => undefined,
    () => undefined,
  )
  return applied
}
