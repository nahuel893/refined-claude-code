import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { diffRows, parseBranchRefs, parseGitStatus, parseLineCounts, parseLog, parseNumstatFiles, parseWorktrees } from '../hooks/git'
import { THEME_DEFAULTS } from '../hooks/theme'
import { type GitAnswer, pane, press, startSession, texts, world } from './world'

const ROOT = '/home/test/projects/app'

const STATUS =
  '# branch.oid 0123456789abcdef\n# branch.head feat/tabs\n# branch.upstream origin/feat/tabs\n# branch.ab +2 -1\n' +
  '1 M. N... 100644 100644 100644 aaaa bbbb hooks/tabs.tsx\n' +
  '1 .M N... 100644 100644 100644 aaaa bbbb README.md\n' +
  '1 MM N... 100644 100644 100644 aaaa bbbb hooks/git.tsx\n' +
  '2 R. N... 100644 100644 100644 aaaa bbbb R100 hooks/new.tsx\thooks/old.tsx\n' +
  'u UU N... 100644 100644 100644 100644 aaaa bbbb cccc package.json\n' +
  '? notes.txt\n'
const UNSTAGED = '4\t1\tREADME.md\n2\t0\thooks/git.tsx\n3\t3\tpackage.json\n'
const STAGED = '10\t3\thooks/tabs.tsx\n30\t0\thooks/git.tsx\n12\t0\thooks/new.tsx\n-\t-\tlogo.png\n'
const REFS = 'feat/tabs\nmain\nfix/old\n'
const WORKTREES =
  `worktree ${ROOT}\nHEAD 0123\nbranch refs/heads/feat/tabs\n\n` +
  'worktree /home/test/projects/app-worktrees/review\nHEAD 4567\nbranch refs/heads/review\n\n' +
  'worktree /home/test/projects/app-worktrees/old\nHEAD 89ab\ndetached\n'
const LOG = 'a1b2c3d\tfeat(openskin): add tabs\nb2c3d4e\tfix: keep the board\nc3d4e5f\tdocs: panel\nd4e5f6a\tchore: sync\ne5f6a7b\ttest: cards\n'
const README_DIFF =
  'diff --git a/README.md b/README.md\nindex 1111..2222 100644\n--- a/README.md\n+++ b/README.md\n' +
  '@@ -1,3 +1,6 @@\n # App\n-Old line\n+New line\n+Another\n+And more\n+The last\n'

/** A repository with staged, unstaged, conflicted and untracked files, three branches and two other worktrees. */
const REPO: GitAnswer[] = [
  { pattern: / rev-parse --show-toplevel$/, stdout: `${ROOT}\n` },
  { pattern: / status --porcelain=v2 --branch --untracked-files=all$/, stdout: STATUS },
  { pattern: / diff --cached --numstat --no-renames$/, stdout: STAGED },
  { pattern: / diff --numstat --no-renames$/, stdout: UNSTAGED },
  { pattern: / for-each-ref /, stdout: REFS },
  { pattern: / worktree list --porcelain$/, stdout: WORKTREES },
  { pattern: / log -5 /, stdout: LOG },
  { pattern: / grep --untracked -I -c -e  -- :\(literal\)notes\.txt$/, stdout: 'notes.txt:7\n' },
  { pattern: / diff --no-color --no-ext-diff -- :\(literal\)README\.md$/, stdout: README_DIFF },
  {
    pattern: / diff --no-color --no-ext-diff --no-index -- \/dev\/null notes\.txt$/,
    stdout: 'diff --git a/notes.txt b/notes.txt\nnew file mode 100644\n--- /dev/null\n+++ b/notes.txt\n@@ -0,0 +1,2 @@\n+one\n+two\n',
    exitCode: 1,
  },
]

const CLEAN: GitAnswer[] = [
  { pattern: / rev-parse --show-toplevel$/, stdout: `${ROOT}\n` },
  { pattern: / status --porcelain=v2/, stdout: '# branch.oid 0123\n# branch.head main\n' },
  { pattern: / for-each-ref /, stdout: 'main\n' },
  { pattern: / worktree list --porcelain$/, stdout: `worktree ${ROOT}\nHEAD 0123\nbranch refs/heads/main\n` },
  { pattern: / log -5 /, stdout: 'a1b2c3d\tinit\n' },
]

/** The Git tab drawn `rows` tall: every Text, and the mounted drawing for closer looks. */
const gitTab = async ($: Engine, rows = 60) => {
  const ui = await $.ui.mount(pane(rows))
  return { ui, all: (await ui.findAll({ type: 'Text' })).map(text => text.text ?? '') }
}

/** Whether `wanted` all show, in that order. A card's title is drawn after its rows, over its border. */
const inOrder = (all: string[], wanted: string[]) =>
  wanted.map(text => all.indexOf(text)).every((at, i, list) => at >= 0 && (i === 0 || at > list[i - 1]!))

test('porcelain v2 status as the branch with its upstream, and staged, unstaged and untracked files', async () => {
  expect(parseGitStatus(STATUS)).toEqual({
    branch: { name: 'feat/tabs', upstream: 'origin/feat/tabs', ahead: 2, behind: 1 },
    staged: [
      { code: 'M', path: 'hooks/tabs.tsx' },
      { code: 'M', path: 'hooks/git.tsx' },
      { code: 'R', path: 'hooks/new.tsx' },
    ],
    unstaged: [
      { code: 'M', path: 'README.md' },
      { code: 'M', path: 'hooks/git.tsx' },
      { code: 'U', path: 'package.json' },
    ],
    untracked: ['notes.txt'],
  })
  expect(parseGitStatus('# branch.oid (initial)\n# branch.head main\n').branch).toEqual({ name: 'main', upstream: null, ahead: 0, behind: 0 })
})

test('numstat, grep counts, refs, worktrees and the log parse into what the tab draws', async () => {
  expect(parseNumstatFiles(STAGED).get('hooks/tabs.tsx')).toEqual({ added: 10, deleted: 3 })
  expect(parseNumstatFiles(STAGED).get('logo.png')).toEqual({ added: null, deleted: null })
  expect(parseLineCounts('notes.txt:7\nsub dir/a b.txt:2\n')).toEqual(new Map([['notes.txt', 7], ['sub dir/a b.txt', 2]]))
  expect(parseBranchRefs(REFS)).toEqual(['feat/tabs', 'main', 'fix/old'])
  expect(parseWorktrees(WORKTREES)).toEqual([
    { path: ROOT, branch: 'feat/tabs' },
    { path: '/home/test/projects/app-worktrees/review', branch: 'review' },
    { path: '/home/test/projects/app-worktrees/old', branch: null },
  ])
  expect(parseLog(LOG)[0]).toEqual({ hash: 'a1b2c3d', subject: 'feat(openskin): add tabs' })
  expect(parseLog(LOG)).toHaveLength(5)
})

test("a diff's rows start at its first hunk", async () => {
  expect(diffRows(README_DIFF)).toEqual(['@@ -1,3 +1,6 @@', ' # App', '-Old line', '+New line', '+Another', '+And more', '+The last'])
  expect(diffRows('Binary files a/logo.png and b/logo.png differ\n')).toEqual(['Binary files a/logo.png and b/logo.png differ'])
})

test('the Git tab: Status with each file and its line counts, then Branches, then the Log', async ($, on) => {
  const { clock } = world(on, REPO)
  await startSession($, clock)
  await press($, 'tab:git')

  const { ui, all } = await gitTab($)
  expect(inOrder(all, ['Staged', 'Unstaged', 'Untracked', '± Status', '⎇ Branches', '◆ Log'])).toBe(true)
  // Each file is a Button: its group's code, its path, then its counts.
  const files = (await ui.findAll({ type: 'Button' })).filter(button => String(button.props.key).startsWith('file:'))
  expect(files.map(button => button.props.key)).toEqual([
    'file:staged:hooks/tabs.tsx',
    'file:staged:hooks/git.tsx',
    'file:staged:hooks/new.tsx',
    'file:unstaged:README.md',
    'file:unstaged:hooks/git.tsx',
    'file:unstaged:package.json',
    'file:untracked:notes.txt',
  ])
  expect(files.map(button => button.text)).toEqual([
    'M hooks/tabs.tsx +10 -3',
    'M hooks/git.tsx +30 -0',
    'R hooks/new.tsx +12 -0',
    'M README.md +4 -1',
    'M hooks/git.tsx +2 -0',
    'U package.json +3 -3',
    '? notes.txt +7',
  ])
  expect((await ui.findAll({ type: 'Text', text: /^\+10$/ })).at(-1)?.props.color).toBe('green')
  expect((await ui.findAll({ type: 'Text', text: /^-3$/ })).at(-1)?.props.color).toBe(THEME_DEFAULTS.error)
  await ui.unmount()
})

test('Branches: the current one first with ahead and behind its upstream, then recent branches, then the worktrees', async ($, on) => {
  const { clock } = world(on, REPO)
  await startSession($, clock)
  await press($, 'tab:git')

  const { ui, all } = await gitTab($)
  const current = (await ui.findAll({ type: 'Text', text: /^● feat\/tabs/ }))[0]
  expect(current?.text).toBe('● feat/tabs ↑2 ↓1 origin/feat/tabs')
  expect(inOrder(all, ['● feat/tabs ↑2 ↓1 origin/feat/tabs', '  main', '  fix/old', 'Worktrees', '~/projects/app-worktrees/review review', '~/projects/app-worktrees/old (detached)'])).toBe(true)
  // The current branch is not listed twice, nor the current worktree.
  expect(all.filter(text => text === '  feat/tabs')).toEqual([])
  expect(all.some(text => text.startsWith('~/projects/app '))).toBe(false)
  await ui.unmount()
})

test('Log: the last five commits, short hash and subject on one line each', async ($, on) => {
  const { clock } = world(on, REPO)
  await startSession($, clock)
  await press($, 'tab:git')

  const { ui, all } = await gitTab($)
  const commits = all.filter(text => /^[0-9a-f]{7} /.test(text))
  expect(commits).toEqual(['a1b2c3d feat(openskin): add tabs', 'b2c3d4e fix: keep the board', 'c3d4e5f docs: panel', 'd4e5f6a chore: sync', 'e5f6a7b test: cards'])
  expect((await ui.findAll({ type: 'Text', text: /^a1b2c3d$/ })).at(-1)?.props.color).toBe(THEME_DEFAULTS.accent)
  await ui.unmount()
})

test('a clean tree says so, and a branch with no upstream says that', async ($, on) => {
  const { clock } = world(on, CLEAN)
  await startSession($, clock)
  await press($, 'tab:git')

  const { ui, all } = await gitTab($)
  expect(all).toContain('Working tree clean')
  expect(all).not.toContain('Staged')
  expect((await ui.findAll({ type: 'Text', text: /^● main/ }))[0]?.text).toBe('● main no upstream')
  expect(all).not.toContain('Worktrees')
  await ui.unmount()
})

test('outside a work tree the Git tab says so and runs nothing else', async ($, on) => {
  const { clock, gitRuns } = world(on, [{ pattern: / rev-parse /, stdout: '', exitCode: 128 }])
  await startSession($, clock)
  await press($, 'tab:git')

  expect(await texts($)).toContain('Not a git repository: ~/projects/app')
  expect(gitRuns.some(argv => argv.includes('rev-parse'))).toBe(true)
  expect(gitRuns.some(argv => ['for-each-ref', 'worktree', 'log', 'grep'].some(word => argv.includes(word)))).toBe(false)
})

test('a file pressed shows its diff, cut to the rows the pane has; pressed again it closes', async ($, on) => {
  const { clock } = world(on, REPO)
  await startSession($, clock)
  await press($, 'tab:git')

  const tall = await $.ui.mount(pane(60))
  await tall.press({ key: 'file:unstaged:README.md' })
  const shown = (await tall.findAll({ type: 'Text' })).map(text => text.text ?? '')
  expect(inOrder(shown, ['◆ Log', '@@ -1,3 +1,6 @@', ' # App', '-Old line', '+New line', '+The last', 'Δ README.md'])).toBe(true)
  expect((await tall.findAll({ type: 'Text', text: /^\+New line$/ })).at(-1)?.props.color).toBe('green')
  expect((await tall.findAll({ type: 'Text', text: /^-Old line$/ })).at(-1)?.props.color).toBe(THEME_DEFAULTS.error)
  await tall.unmount()

  // 32 rows: the tab bar 1, Status 2 + 10, Branches 2 + 6, Log 2 + 5 and the diff's border 2 leave
  // 2 rows inside the diff's card: its first row, then how many more there are.
  const short = await texts($, 32)
  expect(short).toContain('Δ README.md')
  expect(short).toContain('@@ -1,3 +1,6 @@')
  expect(short).not.toContain('-Old line')
  expect(short).toContain('… 6 more lines')

  await press($, 'file:unstaged:README.md')
  expect(await texts($)).not.toContain('Δ README.md')
})

test('an untracked file shows its whole text as added', async ($, on) => {
  const { clock } = world(on, REPO)
  await startSession($, clock)
  await press($, 'tab:git')
  await press($, 'file:untracked:notes.txt')

  const all = await texts($, 60)
  expect(inOrder(all, ['@@ -0,0 +1,2 @@', '+one', '+two', 'Δ notes.txt'])).toBe(true)
})

test('the Git tab is read-only: every git it runs reads, with no optional locks', async ($, on) => {
  const { clock, gitRuns } = world(on, REPO)
  await startSession($, clock)
  await press($, 'tab:git')
  await press($, 'file:unstaged:README.md')
  await press($, 'file:staged:hooks/tabs.tsx')
  await press($, 'file:untracked:notes.txt')

  const READS = new Set(['rev-parse', 'status', 'diff', 'for-each-ref', 'worktree', 'log', 'grep'])
  for (const argv of gitRuns) {
    expect(argv.slice(0, 2)).toEqual(['git', '--no-optional-locks'])
    const command = argv.slice(4).find(arg => !arg.startsWith('-') && !arg.includes('='))
    expect(READS.has(command ?? '')).toBe(true)
    if (command === 'worktree') expect(argv).toContain('list')
  }
  for (const word of ['add', 'commit', 'checkout', 'switch', 'reset', 'stash', 'restore', 'push', 'fetch', 'pull', 'merge', 'rm']) {
    expect(gitRuns.some(argv => argv.slice(4).includes(word))).toBe(false)
  }
})
