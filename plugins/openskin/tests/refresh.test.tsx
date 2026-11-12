import { expect, test } from 'claude-code/testing'
import { type GitAnswer, press, startSession, texts, typed, world } from './world'

const ROOT = '/home/test/projects/app'

/** A repository whose status a test changes: `dirty` adds an unstaged README.md. */
const repo = (dirty: boolean): GitAnswer[] => [
  { pattern: / rev-parse --show-toplevel$/, stdout: `${ROOT}\n` },
  {
    pattern: / status --porcelain=v2/,
    stdout: '# branch.oid 0123\n# branch.head main\n' + (dirty ? '1 .M N... 100644 100644 100644 aaaa bbbb README.md\n' : ''),
  },
  { pattern: / diff --numstat --no-renames$/, stdout: dirty ? '1\t0\tREADME.md\n' : '' },
  { pattern: / log -5 /, stdout: 'a1b2c3d\tinit\n' },
]

/** The Git tab's own reads: only it asks git for the top of the work tree. */
const tabReads = (gitRuns: string[][]) => gitRuns.filter(argv => argv.includes('rev-parse')).length

/** Opens the panel as `/panel` does, so the pane is open and shown. */
const openPanel = async ($: Parameters<Parameters<typeof test>[1]>[0]) => {
  await $.command.run(typed(''))
}

test('while the Git tab is shown, git is read again every 2.5 s, and a change shows up', async ($, on) => {
  const { clock, state, gitRuns } = world(on, repo(false))
  await startSession($, clock)
  await openPanel($)
  await press($, 'tab:git')
  const first = tabReads(gitRuns)
  expect(first).toBe(1)
  expect(await texts($)).toContain('Working tree clean')

  state.git = repo(true)
  await clock.advance(2500)
  expect(tabReads(gitRuns)).toBe(first + 1)
  const after = await texts($)
  expect(after).toContain('M README.md +1 -0')
  expect(after).not.toContain('Working tree clean')

  await clock.advance(2500 * 2)
  expect(tabReads(gitRuns)).toBe(first + 3)
})

test('while another tab is shown, the Git tab reads no git, and stops once left', async ($, on) => {
  const { clock, gitRuns } = world(on, repo(false))
  await startSession($, clock)
  await openPanel($)
  await clock.advance(2500 * 4)
  expect(tabReads(gitRuns)).toBe(0)

  await press($, 'tab:git')
  await clock.advance(2500)
  const shown = tabReads(gitRuns)
  expect(shown).toBe(2)

  await press($, 'tab:summary')
  await clock.advance(2500 * 4)
  expect(tabReads(gitRuns)).toBe(shown)
})

test('right after a tool call completes, the Git tab reads git again, and the result passes through as it came', async ($, on) => {
  const { clock, state, gitRuns } = world(on, repo(false))
  on('tool.call', () => ({ result: { stdout: 'edited', stderr: '', interrupted: false } as never }))
  await startSession($, clock)
  await openPanel($)
  await press($, 'tab:git')
  const before = tabReads(gitRuns)

  state.git = repo(true)
  const ran = await $.tool.call({ tool: 'Bash', command: 'sed -i s/a/b/ README.md' })
  expect(ran.result).toEqual({ stdout: 'edited', stderr: '', interrupted: false })
  await clock.advance(0)
  expect(tabReads(gitRuns)).toBe(before + 1)
  expect(await texts($)).toContain('M README.md +1 -0')
})

test('a tool call while another tab is shown reads no git for the Git tab', async ($, on) => {
  const { clock, gitRuns } = world(on, repo(false))
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } as never }))
  await startSession($, clock)

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await clock.advance(0)
  expect(tabReads(gitRuns)).toBe(0)
})

test('the Status card keeps its own pace while the Git tab polls: the status line input, then every tenth tick', async ($, on) => {
  const { clock, gitRuns } = world(on, repo(false))
  await startSession($, clock)
  // The Status card's git: `status` with no `-c` before it; the Git tab's passes `-c core.quotePath=false`.
  const cardReads = () => gitRuns.filter(argv => argv.includes('status') && !argv.includes('-c')).length
  const first = cardReads()

  await press($, 'tab:git')
  await clock.advance(1500 * 8)
  expect(cardReads()).toBe(first)
  await clock.advance(1500 * 2)
  expect(cardReads()).toBe(first + 1)
})

test('with the Git tab picked but no pane open, the Git tab reads no git', async ($, on) => {
  const { clock, gitRuns, opened, closed } = world(on, repo(false))
  await startSession($, clock)
  await press($, 'tab:git')
  expect(opened.filter(o => !closed.includes(o.id))).toEqual([])
  const before = tabReads(gitRuns)
  await clock.advance(2500 * 4)
  expect(tabReads(gitRuns)).toBe(before)
})

test('once the pane is closed, neither the timer nor a tool call reads git for the Git tab', async ($, on) => {
  const { clock, gitRuns, closed, closePane } = world(on, repo(false))
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false } as never }))
  await startSession($, clock)
  await openPanel($)
  await press($, 'tab:git')
  await clock.advance(2500)
  const shown = tabReads(gitRuns)
  expect(shown).toBe(2)

  closePane('openskin-status')
  expect(closed).toEqual(['openskin-status'])
  await clock.advance(2500 * 4)
  await $.tool.call({ tool: 'Bash', command: 'git status' })
  await clock.advance(0)
  expect(tabReads(gitRuns)).toBe(shown)
})
