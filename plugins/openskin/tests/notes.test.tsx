import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { boardRow, notePaths } from '../hooks/notes'
import { THEME_DEFAULTS } from '../hooks/theme'

const HOME = '/home/test'
const PROJECT = `${HOME}/.cache/refined-claude-code/projects/-home-test-projects-app`
const BOARD = `${PROJECT}/session-1/board.md`
const SUMMARY = `${PROJECT}/session-1/summary.md`

const PANE = {
  plugin: 'openskin',
  component: 'Pane',
  requestId: 'openskin-status',
  surface: 'terminal',
  props: { title: 'Status', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

/**
 * Everything beneath the mod: the clock, the session's home, id and directory, no status line and
 * no meters, and a file system in memory whose files a test writes (a new mtime each time) or removes.
 */
function world(on: On) {
  const clock = mock.clock(on, { now: 0 })
  const files = new Map<string, { text: string; mtimeMs: number }>()
  let writes = 0
  on('env.get', () => ({ value: HOME }))
  on('session.id', () => ({ value: 'session-1' }))
  on('fs.stat', ($, e) => {
    const file = files.get(e.path)
    return file ? { value: { mtimeMs: file.mtimeMs } as never } : { deny: `ENOENT: ${e.path}` }
  })
  on('fs.read', ($, e) => {
    const file = files.get(e.path)
    return file ? { value: file.text } : { deny: `ENOENT: ${e.path}` }
  })
  on('command.register', () => ({ value: { command: 'panel' } }))
  on('store.get', () => ({ value: undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))

  return {
    clock,
    write: (path: string, text: string) => files.set(path, { text, mtimeMs: ++writes }),
    remove: (path: string) => files.delete(path),
  }
}

const startSession = ($: Engine) => $.session.start({ cwd: '/home/test/projects/app', surface: 'terminal', isInteractive: true })

/** Every Text of the panel, outer rows and inner spans alike. */
const texts = async ($: Engine) => {
  const ui = await $.ui.mount(PANE)
  const all = (await ui.findAll({ type: 'Text' })).map(text => text.text)
  await ui.unmount()
  return all
}

test("both files are in the session's folder, under the project's slug", async () => {
  expect(notePaths(HOME, '/home/test/projects/app', 'session-1')).toEqual({ board: BOARD, summary: SUMMARY })
})

test('a board line: done struck through and dim, pending plain, waiting marked in the accent', async () => {
  expect(boardRow('✓ Parser written', THEME_DEFAULTS)).toEqual([
    { text: '✓', dimColor: true },
    { text: ' ' },
    { text: 'Parser written', strikethrough: true, dimColor: true },
  ])
  expect(boardRow('○ Add tests', THEME_DEFAULTS)).toEqual([{ text: '○' }, { text: ' ' }, { text: 'Add tests' }])
  expect(boardRow('◇ Pick a name', THEME_DEFAULTS)).toEqual([
    { text: '◇', color: THEME_DEFAULTS.accent },
    { text: ' ' },
    { text: 'Pick a name' },
  ])
})

test('the Panel tab draws the board, one row per line, and the Summary tab the summary wrapped', async ($, on) => {
  const { write } = world(on)
  write(BOARD, '✓ Parser written\n○ Add tests\n\n◇ Pick a name\n')
  write(SUMMARY, 'The goal was a parser for the config files, and it is written and tested.\n')
  await startSession($)

  const ui = await $.ui.mount(PANE)
  const all = (await ui.findAll({ type: 'Text' })).map(text => text.text)
  expect(all.filter(text => ['≡ Board · 1 of 3', '¶ Summary'].includes(text ?? ''))).toEqual(['≡ Board · 1 of 3'])
  expect((await ui.findAll({ type: 'Text', text: /^(Parser written|Add tests|Pick a name)$/ })).map(text => text.text)).toEqual([
    'Parser written',
    'Add tests',
    'Pick a name',
  ])
  expect((await ui.findAll({ type: 'Text', text: /^Parser written$/ })).at(-1)?.props).toMatchObject({ strikethrough: true, dimColor: true })
  expect((await ui.findAll({ type: 'Text', text: /^◇$/ })).at(-1)?.props.color).toBe(THEME_DEFAULTS.accent)
  await ui.press({ key: 'tab:summary' })
  expect((await ui.findAll({ type: 'Text' })).map(text => text.text)).toContain('¶ Summary')
  const summary = (await ui.findAll({ type: 'Text', text: /^The goal was a parser/ }))[0]
  expect(summary?.props.wrap).toBe('wrap')
  await ui.unmount()
})

test("another session's files and the old per-project and per-session files are not drawn", async ($, on) => {
  const { write } = world(on)
  write(`${PROJECT}/session-0/board.md`, '○ Another session\n')
  write(`${PROJECT}/session-0/summary.md`, 'Another session summary.\n')
  write(`${HOME}/.cache/refined-claude-code/board/-home-test-projects-app.md`, '○ The old project board\n')
  write(`${HOME}/.cache/refined-claude-code/summaries/session-1.md`, 'The old session summary.\n')
  await startSession($)

  const all = await texts($)
  expect(all.some(text => text?.startsWith('≡ Board'))).toBe(false)
  expect(all).not.toContain('¶ Summary')
})

test('an absent or empty file draws no section', async ($, on) => {
  const { write } = world(on)
  write(SUMMARY, '  \n')
  await startSession($)

  const all = await texts($)
  expect(all.some(text => text?.startsWith('≡ Board'))).toBe(false)
  expect(all).not.toContain('¶ Summary')
})

test('a file that changes is drawn again, and one removed takes its section away', async ($, on) => {
  const { clock, write, remove } = world(on)
  write(BOARD, '○ Add tests\n')
  await startSession($)
  expect(await texts($)).toContain('Add tests')

  write(BOARD, '✓ Add tests\n○ Ship it\n')
  write(SUMMARY, 'Tests are in.\n')
  await clock.advance(1500)
  const after = await texts($)
  expect(after).toContain('Ship it')
  expect(after).toContain('≡ Board · 1 of 2')

  remove(BOARD)
  await clock.advance(1500)
  const gone = await texts($)
  expect(gone.some(text => text?.startsWith('≡ Board'))).toBe(false)

  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'tab:summary' })
  expect((await ui.findAll({ type: 'Text' })).map(text => text.text)).toContain('Tests are in.')
  await ui.unmount()
  remove(SUMMARY)
  await clock.advance(1500)
  expect(await texts($)).not.toContain('¶ Summary')
})
