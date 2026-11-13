import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { CWD, HOME, startSession, world } from './world'

/** The project's docs index: beside the session folders, not in one. */
const INDEX = `${HOME}/.cache/refined-claude-code/projects/-home-test-projects-app/docs.json`

const TOOL = 'mcp__openskin__docs'

/**
 * The status panel's world, plus what the docs tool needs: the tools registered, the session
 * start's context, and a file system that keeps what is written (each write recorded).
 */
const docsWorld = async ($: Engine, on: On, seed: Record<string, string> = {}) => {
  const w = world(on)
  const registered: { name: string; description: string; inputSchema?: Record<string, unknown> }[] = []
  const writes: { path: string; text: string }[] = []
  const texts: Record<string, string> = {}
  for (const [path, text] of Object.entries(seed)) {
    texts[path] = text
    w.write(path, text)
  }
  on('fs.write', ($, e) => {
    writes.push({ path: e.path, text: e.text })
    texts[e.path] = e.text
    w.write(e.path, e.text)
    return { value: undefined }
  })
  on('tool.register', ($, e) => {
    registered.push(e)
    return { value: { tool: `mcp__openskin__${e.name}` } }
  })
  on('classic.SessionStart', () => ({}))
  await startSession($, w.clock)

  return {
    ...w,
    registered,
    writes,
    texts,
    /** Calls the docs tool as the model would, and answers what the model reads. */
    call: async (input: Record<string, unknown>) => {
      const answer = await $.tool.call({ tool: TOOL, ...input })
      if (answer.deny !== undefined) throw new Error(`denied: ${answer.deny}`)
      return answer.result as string
    },
    /** The index file as JSON. */
    index: () => JSON.parse(texts[INDEX] ?? 'null'),
  }
}

test('the docs tool is registered at session start with an action schema', async ($, on) => {
  const { registered } = await docsWorld($, on)

  expect(registered.map(tool => tool.name)).toEqual(['docs'])
  expect(registered[0]?.description).toContain('Docs tab')
  expect(registered[0]?.inputSchema).toEqual(expect.objectContaining({ required: ['action'] }))
})

test('the session start names the docs tool in one line', async ($, on) => {
  await docsWorld($, on)

  const context = (await $.classic.SessionStart({ source: 'startup' })).additionalContext ?? []
  expect(context).toHaveLength(1)
  expect(context[0]).toContain(TOOL)
  expect(context[0]).toContain('architecture, design, notes and ODD documents')
  expect(context[0]).not.toContain('\n')
})

test('add indexes a path under its group in the project index and answers the numbered index', async ($, on) => {
  const { call, index, writes } = await docsWorld($, on)

  expect(await call({ action: 'add', path: 'docs/architecture.md', group: 'Architecture' })).toBe(
    'ok · added docs/architecture.md to Architecture · 1 document\nArchitecture\n1. docs/architecture.md',
  )
  expect(await call({ action: 'add', path: 'odd/tasks/docs-tab.md', group: 'ODD' })).toBe(
    'ok · added odd/tasks/docs-tab.md to ODD · 2 documents\nArchitecture\n1. docs/architecture.md\nODD\n2. odd/tasks/docs-tab.md',
  )
  expect(index()).toEqual({
    groups: ['Architecture', 'ODD'],
    docs: [
      { path: 'docs/architecture.md', group: 'Architecture' },
      { path: 'odd/tasks/docs-tab.md', group: 'ODD' },
    ],
  })
  expect(writes.map(write => write.path)).toEqual([INDEX, INDEX])
})

test('a document added with no group goes under Docs; a group named in another case joins the existing one', async ($, on) => {
  const { call, index } = await docsWorld($, on)

  await call({ action: 'add', path: 'NOTES.md' })
  await call({ action: 'add', path: 'docs/design.md', group: 'Design' })
  expect(await call({ action: 'add', path: 'docs/ui.md', group: ' design ' })).toBe(
    'ok · added docs/ui.md to Design · 3 documents\nDocs\n1. NOTES.md\nDesign\n2. docs/design.md\n3. docs/ui.md',
  )
  expect(index().groups).toEqual(['Docs', 'Design'])
})

test('paths are stored relative to the project, whether given absolute, with ./ or with ..', async ($, on) => {
  const { call, index } = await docsWorld($, on)

  await call({ action: 'add', path: `${CWD}/docs/a.md` })
  await call({ action: 'add', path: './docs/./b.md' })
  await call({ action: 'add', path: 'docs/old/../c.md' })
  expect(index().docs.map((doc: { path: string }) => doc.path)).toEqual(['docs/a.md', 'docs/b.md', 'docs/c.md'])
})

test('adding an indexed path again moves it to the new group; a group left empty goes', async ($, on) => {
  const { call, index } = await docsWorld($, on)
  await call({ action: 'add', path: 'docs/plan.md', group: 'Notes' })
  await call({ action: 'add', path: 'docs/arch.md', group: 'Architecture' })

  expect(await call({ action: 'add', path: 'docs/plan.md', group: 'Design' })).toBe(
    'ok · moved docs/plan.md to Design · 2 documents\nArchitecture\n1. docs/arch.md\nDesign\n2. docs/plan.md',
  )
  expect(index()).toEqual({
    groups: ['Architecture', 'Design'],
    docs: [
      { path: 'docs/arch.md', group: 'Architecture' },
      { path: 'docs/plan.md', group: 'Design' },
    ],
  })
})

test('adding a path already in that group changes nothing and writes nothing', async ($, on) => {
  const { call, writes } = await docsWorld($, on)
  await call({ action: 'add', path: 'docs/arch.md', group: 'Architecture' })

  expect(await call({ action: 'add', path: 'docs/arch.md', group: 'architecture' })).toBe(
    'docs/arch.md is already in Architecture.\nArchitecture\n1. docs/arch.md',
  )
  expect(writes).toHaveLength(1)
})

test('remove drops a path from the index and leaves the file alone', async ($, on) => {
  const { call, index, writes } = await docsWorld($, on, { [`${CWD}/docs/arch.md`]: '# Architecture\n' })
  await call({ action: 'add', path: 'docs/arch.md', group: 'Architecture' })
  await call({ action: 'add', path: 'NOTES.md' })

  expect(await call({ action: 'remove', path: 'docs/arch.md' })).toBe('ok · removed docs/arch.md · 1 document\nDocs\n1. NOTES.md')
  expect(index()).toEqual({ groups: ['Docs'], docs: [{ path: 'NOTES.md', group: 'Docs' }] })
  // S6: only the index is ever written.
  expect(writes.every(write => write.path === INDEX)).toBe(true)
})

test('list answers the numbered index and writes nothing; an empty index says so', async ($, on) => {
  const { call, writes } = await docsWorld($, on)

  expect(await call({ action: 'list' })).toBe('The docs index is empty.')
  await call({ action: 'add', path: 'docs/arch.md', group: 'Architecture' })
  expect(await call({ action: 'list' })).toBe('Architecture\n1. docs/arch.md')
  expect(writes).toHaveLength(1)
})

test('a path outside the project is refused in one line and writes nothing', async ($, on) => {
  const { call, writes } = await docsWorld($, on)

  expect(await call({ action: 'add', path: '../other/notes.md' })).toBe(`Not added: ../other/notes.md is outside the project (${CWD}).`)
  expect(await call({ action: 'add', path: '/etc/hosts' })).toBe(`Not added: /etc/hosts is outside the project (${CWD}).`)
  expect(await call({ action: 'add', path: '~/notes.md' })).toBe(`Not added: ~/notes.md is outside the project (${CWD}).`)
  expect(await call({ action: 'add', path: '.' })).toBe(`Not added: . is outside the project (${CWD}).`)
  expect(writes).toEqual([])
})

test('a missing path, a path not indexed or an unknown action answers a short line and writes nothing', async ($, on) => {
  const { call, writes } = await docsWorld($, on)

  expect(await call({ action: 'add', path: '  ' })).toBe("Give the document's path.")
  expect(await call({ action: 'remove' })).toBe("Give the document's path.")
  expect(await call({ action: 'remove', path: 'docs/none.md' })).toBe('docs/none.md is not in the index.')
  expect(await call({ action: 'drop', path: 'a.md' })).toBe('Unknown action drop: use add, remove or list.')
  expect(writes).toEqual([])
})

test('a malformed or missing index file reads as an empty index, and the next add rewrites it whole', async ($, on) => {
  const { call, index } = await docsWorld($, on, { [INDEX]: '{ not json' })

  expect(await call({ action: 'list' })).toBe('The docs index is empty.')
  await call({ action: 'add', path: 'docs/arch.md' })
  expect(index()).toEqual({ groups: ['Docs'], docs: [{ path: 'docs/arch.md', group: 'Docs' }] })
})

test('entries of the wrong shape in the index file are skipped', async ($, on) => {
  const seeded = { groups: ['Notes', 7], docs: [{ path: 'a.md', group: 'Notes' }, { path: 3 }, null, { path: '../x.md', group: 'Notes' }, { path: 'b.md' }] }
  const { call } = await docsWorld($, on, { [INDEX]: JSON.stringify(seeded) })

  expect(await call({ action: 'list' })).toBe('Notes\n1. a.md\nDocs\n2. b.md')
})

test('the index belongs to the project: one written before this session is listed', async ($, on) => {
  const index = { groups: ['ODD'], docs: [{ path: 'odd/tasks/docs-tab.md', group: 'ODD' }] }
  const { call } = await docsWorld($, on, { [INDEX]: JSON.stringify(index) })

  expect(await call({ action: 'list' })).toBe('ODD\n1. odd/tasks/docs-tab.md')
})

test('calls that come close together are applied one after another, losing no entry', async ($, on) => {
  const { call, index } = await docsWorld($, on)

  await Promise.all([
    call({ action: 'add', path: 'a.md', group: 'Notes' }),
    call({ action: 'add', path: 'b.md', group: 'Notes' }),
    call({ action: 'add', path: 'c.md', group: 'Design' }),
  ])
  expect(index().docs.map((doc: { path: string }) => doc.path).sort()).toEqual(['a.md', 'b.md', 'c.md'])
})

test('another tool call still passes through the panel as it came', async ($, on) => {
  on('tool.call', () => ({ result: { stdout: 'listed', stderr: '', interrupted: false } as never }))
  const { writes } = await docsWorld($, on)

  const ran = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(ran.result).toEqual({ stdout: 'listed', stderr: '', interrupted: false })
  expect(writes).toEqual([])
})
