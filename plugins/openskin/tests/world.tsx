import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

/** Shared stand-ins for the status panel's tests: tabs, the Git tab and its refresh. */

export const HOME = '/home/test'
export const CWD = '/home/test/projects/app'
export const SUMMARY = `${HOME}/.cache/refined-claude-code/projects/-home-test-projects-app/session-1/summary.md`
export const BOARD = `${HOME}/.cache/refined-claude-code/projects/-home-test-projects-app/session-1/board.md`

/** The panel as a docked, unfocused pane `rows` tall. */
export const pane = (rows = 30, isFocused = false) =>
  ({
    plugin: 'openskin',
    component: 'Pane',
    requestId: 'openskin-status',
    surface: 'terminal',
    props: { title: 'Status', isFocused, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: rows }, view: {} },
  }) as const

/** `/panel` typed at the prompt with `args`. */
export const typed = (args: string) =>
  ({ command: 'panel', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } }) as const

/** A git answer: what a run whose argv (joined by spaces) matches `pattern` prints. */
export type GitAnswer = { pattern: RegExp; stdout: string; exitCode?: number }

/**
 * Everything beneath the mod: the clock, the session's home, id and directory, no status line
 * input, a file system in memory, a git that answers from `git` (the first matching pattern; no
 * match prints nothing), and the pane calls, recorded.
 */
export function world(on: On, git: GitAnswer[] = []) {
  const clock = mock.clock(on, { now: 0 })
  const files = new Map<string, { text: string; mtimeMs: number }>()
  const gitRuns: string[][] = []
  const opened: { id: string; focus?: true }[] = []
  const closed: string[] = []
  const open = new Set<string>()
  const state = { git }
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
  on('process.run', ($, e) => {
    const argv = [...e.argv]
    if (argv[0] !== 'git') return { value: { exitCode: 0, stdout: '', stderr: '' } as never }
    gitRuns.push(argv)
    const line = argv.join(' ')
    const answer = state.git.find(({ pattern }) => pattern.test(line))
    return { value: { exitCode: answer?.exitCode ?? 0, stdout: answer?.stdout ?? '', stderr: '' } as never }
  })
  on('ui.open', ($, e) => {
    opened.push({ ...e })
    open.add(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', ($, e) => {
    closed.push(e.id)
    open.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: [...open].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })) }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('store.get', () => ({ value: undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))

  return {
    clock,
    state,
    gitRuns,
    opened,
    closed,
    write: (path: string, text: string) => files.set(path, { text, mtimeMs: ++writes }),
    remove: (path: string) => files.delete(path),
  }
}

/** Starts the session and lets the first, unawaited runs settle on the next tick. */
export const startSession = async ($: Engine, clock: { advance: (ms: number) => Promise<void> }) => {
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await clock.advance(1500)
}

/** Every Text of the panel, outer rows and inner spans alike, drawn `rows` tall. */
export const texts = async ($: Engine, rows = 30) => {
  const ui = await $.ui.mount(pane(rows))
  const all = (await ui.findAll({ type: 'Text' })).map(text => text.text ?? '')
  await ui.unmount()
  return all
}

/** Presses a Button of the panel, as a click or its hotkey does. */
export const press = async ($: Engine, key: string) => {
  const ui = await $.ui.mount(pane())
  await ui.press({ key })
  await ui.unmount()
}
