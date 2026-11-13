import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { THEME_DEFAULTS } from '../hooks/theme'
import { CWD, HOME, pane, press, startSession, texts, typed, world } from './world'

/** The project's docs index. */
const INDEX = `${HOME}/.cache/refined-claude-code/projects/-home-test-projects-app/docs.json`

const ARCH = `${CWD}/docs/architecture.md`
const PLAN = `${CWD}/odd/tasks/docs-tab.md`

/** An index of three documents in two groups, ODD used first. */
const THREE = JSON.stringify({
  groups: ['ODD', 'Architecture'],
  docs: [
    { path: 'odd/tasks/docs-tab.md', group: 'ODD' },
    { path: 'docs/architecture.md', group: 'Architecture' },
    { path: 'docs/gone.md', group: 'Architecture' },
  ],
})

/** The status panel's world with every write recorded and kept, and the docs tool answerable. */
const docsWorld = (on: On) => {
  const w = world(on)
  const writes: string[] = []
  on('fs.write', ($, e) => {
    writes.push(e.path)
    w.write(e.path, e.text)
    return { value: undefined }
  })
  on('tool.register', ($, e) => ({ value: { tool: `mcp__openskin__${e.name}` } }))
  return { ...w, writes }
}

/** Opens the panel as `/panel` does, so the pane is open and shown, then shows the Docs tab. */
const openDocs = async ($: Engine) => {
  await $.command.run(typed(''))
  await press($, 'tab:docs')
}

/** Whether `wanted` all show, in that order. A card's title is drawn after its rows, over its border. */
const inOrder = (all: string[], wanted: string[]) =>
  wanted.map(text => all.indexOf(text)).every((at, i, list) => at >= 0 && (i === 0 || at > list[i - 1]!))

/** How often the Docs tab read the index. */
const indexReads = (reads: string[]) => reads.filter(path => path === INDEX).length

test('the tab bar gets a fourth tab, Docs, after Summary, with the letter d', async ($, on) => {
  const { clock } = docsWorld(on)
  await startSession($, clock)

  const ui = await $.ui.mount(pane())
  const buttons = (await ui.findAll({ type: 'Button' })).filter(button => String(button.props.key).startsWith('tab:'))
  expect(buttons.map(button => button.props.key)).toEqual(['tab:panel', 'tab:git', 'tab:summary', 'tab:docs'])
  expect(buttons.map(button => button.props.label)).toEqual(['Panel', 'Git', 'Summary', 'Docs'])
  expect(buttons.map(button => button.props.hotkey)).toEqual(['p', 'g', 's', 'd'])
  await ui.unmount()
})

test('/panel docs opens the panel on the Docs tab with the keys, and names every letter', async ($, on) => {
  const { clock, opened } = docsWorld(on)
  await startSession($, clock)

  const { text } = await $.command.run(typed('docs'))
  expect(text).toBe('Status panel opened on Docs: p, g, s and d switch tabs while it has the keys.')
  await clock.advance(100)
  expect(opened).toEqual([{ id: 'openskin-status', title: 'Status', focus: true }])
  expect(await texts($)).toContain('No documents yet: Claude adds them with the docs tool.')
})

test('the unknown-tab message and the help text name docs', async ($, on) => {
  const { clock, commands } = docsWorld(on)
  await startSession($, clock)

  const { text } = await $.command.run(typed('logs'))
  expect(text).toBe('No tab "logs": /panel opens the panel, /panel panel, /panel git, /panel summary or /panel docs opens it on that tab.')
  expect(commands.find(command => command.name === 'panel')?.description).toBe('Open the status panel beside the transcript; /panel panel, git, summary or docs opens it on that tab')
})

test('/panel git still opens on the Git tab', async ($, on) => {
  const { clock, gitRuns } = docsWorld(on)
  await startSession($, clock)

  const { text } = await $.command.run(typed('git'))
  expect(text).toBe('Status panel opened on Git: p, g, s and d switch tabs while it has the keys.')
  await clock.advance(100)
  expect(gitRuns.some(argv => argv.includes('rev-parse'))).toBe(true)
  expect(await texts($)).not.toContain('No documents yet: Claude adds them with the docs tool.')
})

test('an empty index shows one dim line', async ($, on) => {
  const { clock } = docsWorld(on)
  await startSession($, clock)
  await openDocs($)

  const ui = await $.ui.mount(pane())
  const line = await ui.find({ type: 'Text', text: /^No documents yet/ })
  expect(line?.text).toBe('No documents yet: Claude adds them with the docs tool.')
  expect(line?.props.dimColor).toBe(true)
  expect((await ui.findAll({ type: 'Text' })).map(each => each.text)).not.toContain('✿ Status')
  await ui.unmount()
})

test('the index is drawn as a list grouped like the Git status, a missing file dim and marked missing', async ($, on) => {
  const { clock, write } = docsWorld(on)
  write(INDEX, THREE)
  write(PLAN, '# Docs tab\n')
  write(ARCH, '# Architecture\n')
  await startSession($, clock)
  await openDocs($)

  const ui = await $.ui.mount(pane())
  const all = (await ui.findAll({ type: 'Text' })).map(text => text.text ?? '')
  expect(inOrder(all, ['ODD', 'odd/tasks/docs-tab.md', 'Architecture', 'docs/architecture.md', 'docs/gone.md missing', '§ Docs'])).toBe(true)
  expect((await ui.findAll({ type: 'Text', text: /^ODD$/ }))[0]?.props.color).toBe(THEME_DEFAULTS.muted)
  const missing = (await ui.findAll({ type: 'Text', text: /^docs\/gone\.md missing$/ }))[0]
  expect(missing?.props.dimColor).toBe(true)
  const present = (await ui.findAll({ type: 'Text', text: /^docs\/architecture\.md$/ }))[0]
  expect(present?.props.dimColor).not.toBe(true)
  const rows = (await ui.findAll({ type: 'Button' })).map(button => String(button.props.key)).filter(key => key.startsWith('doc:'))
  expect(rows).toEqual(['doc:odd/tasks/docs-tab.md', 'doc:docs/architecture.md', 'doc:docs/gone.md'])
  await ui.unmount()
})

test('a document pressed shows its contents under the list, cut to the pane; pressed again it closes', async ($, on) => {
  const { clock, write } = docsWorld(on)
  write(INDEX, JSON.stringify({ groups: ['Architecture'], docs: [{ path: 'docs/architecture.md', group: 'Architecture' }] }))
  write(ARCH, '# Architecture\n\nOne\nTwo\nThree\nFour\nFive\nSix\nSeven\nEight\n')
  await startSession($, clock)
  await openDocs($)

  const tall = await $.ui.mount(pane(40))
  await tall.press({ key: 'doc:docs/architecture.md' })
  await clock.advance(0)
  await tall.unmount()
  const all = await texts($, 40)
  expect(inOrder(all, ['§ Docs', '# Architecture', 'One', 'Eight', '▸ docs/architecture.md'])).toBe(true)
  const ui = await $.ui.mount(pane(40))
  expect((await ui.findAll({ type: 'Text', text: /^docs\/architecture\.md$/ })).at(-1)?.props.color).toBe(THEME_DEFAULTS.accent)
  await ui.unmount()

  // 10 rows: the tab bar 1, the list 2 + 2 and the document's border 2 leave 3 rows inside its
  // card: its first two rows, then how many more there are.
  const short = await texts($, 10)
  expect(short).toContain('# Architecture')
  expect(short).not.toContain('One')
  expect(short).toContain('… 8 more lines')

  await press($, 'doc:docs/architecture.md')
  expect(await texts($)).not.toContain('▸ docs/architecture.md')
})

test('a missing document pressed says it is missing', async ($, on) => {
  const { clock, write } = docsWorld(on)
  write(INDEX, THREE)
  await startSession($, clock)
  await openDocs($)

  await press($, 'doc:docs/gone.md')
  await clock.advance(0)
  const ui = await $.ui.mount(pane(40))
  const line = await ui.find({ type: 'Text', text: /^Missing:/ })
  expect(line?.text).toBe('Missing: docs/gone.md is not there.')
  expect(line?.props.dimColor).toBe(true)
  await ui.unmount()
})

test('while the Docs tab is shown, the list and the open document follow outside changes', async ($, on) => {
  const { clock, write } = docsWorld(on)
  write(INDEX, JSON.stringify({ groups: ['Notes'], docs: [{ path: 'docs/architecture.md', group: 'Notes' }] }))
  write(ARCH, 'First draft\n')
  await startSession($, clock)
  await openDocs($)
  await press($, 'doc:docs/architecture.md')
  await clock.advance(0)
  expect(await texts($, 40)).toContain('First draft')

  write(ARCH, 'Second draft\n')
  write(INDEX, JSON.stringify({ groups: ['Notes'], docs: [{ path: 'docs/architecture.md', group: 'Notes' }, { path: 'NOTES.md', group: 'Notes' }] }))
  await clock.advance(2500)
  const after = await texts($, 40)
  expect(after).toContain('Second draft')
  expect(after).not.toContain('First draft')
  expect(after).toContain('NOTES.md missing')
})

test('a document dropped from the index closes its view', async ($, on) => {
  const { clock, write } = docsWorld(on)
  write(INDEX, JSON.stringify({ groups: ['Notes'], docs: [{ path: 'docs/architecture.md', group: 'Notes' }] }))
  write(ARCH, 'Body\n')
  await startSession($, clock)
  await openDocs($)
  await press($, 'doc:docs/architecture.md')
  await clock.advance(0)

  write(INDEX, JSON.stringify({ groups: [], docs: [] }))
  await clock.advance(2500)
  const after = await texts($, 40)
  expect(after).not.toContain('▸ docs/architecture.md')
  expect(after).toContain('No documents yet: Claude adds them with the docs tool.')
})

test('a docs tool call while the Docs tab is shown redraws the list at once', async ($, on) => {
  const { clock } = docsWorld(on)
  await startSession($, clock)
  await openDocs($)

  await $.tool.call({ tool: 'mcp__openskin__docs', action: 'add', path: 'docs/architecture.md', group: 'Architecture' })
  await clock.advance(0)
  expect(await texts($)).toContain('docs/architecture.md missing')
})

test('while another tab is shown, or the pane is closed, the Docs tab reads nothing', async ($, on) => {
  const { clock, reads, write, closePane } = docsWorld(on)
  write(INDEX, THREE)
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } as never }))
  await startSession($, clock)
  await $.command.run(typed(''))
  await clock.advance(2500 * 4)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(indexReads(reads)).toBe(0)

  await press($, 'tab:docs')
  await clock.advance(2500)
  const shown = indexReads(reads)
  expect(shown).toBe(2)

  await press($, 'tab:panel')
  await clock.advance(2500 * 4)
  expect(indexReads(reads)).toBe(shown)

  await press($, 'tab:docs')
  const again = indexReads(reads)
  closePane('openskin-status')
  await clock.advance(2500 * 4)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await clock.advance(0)
  expect(indexReads(reads)).toBe(again)
})

test('the Docs tab writes nothing: no document and no index', async ($, on) => {
  const { clock, write, writes } = docsWorld(on)
  write(INDEX, THREE)
  write(PLAN, '# Docs tab\n')
  write(ARCH, '# Architecture\n')
  await startSession($, clock)
  await openDocs($)
  await press($, 'doc:odd/tasks/docs-tab.md')
  await press($, 'doc:docs/architecture.md')
  await press($, 'doc:docs/gone.md')
  await clock.advance(2500 * 2)

  expect(writes).toEqual([])
})
