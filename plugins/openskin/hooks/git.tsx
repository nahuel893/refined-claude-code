import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface } from 'claude-code'
import { coalesce, runGit, shortHome } from './project'
import type { Theme } from './theme'
import type { GitFile, GitGroup, GitPick, GitView } from '../types'

/**
 * The status panel's Git tab: the repository at a glance, read-only. Status lists the staged,
 * unstaged and untracked files with their line counts; Branches the current branch with its
 * distance to its upstream, the most recent other branches and the other work trees; Log the last
 * commits. A file pressed (a click, or Enter on it while the panel has the keys) shows its diff
 * under them, cut to the rows the pane has. Every git run reads: `runGit` passes
 * `--no-optional-locks`, and nothing here stages, commits, checks out or writes anything.
 */
const COMMITS = 5
const BRANCHES = 5
/** Untracked files whose lines are counted, at most, so one `git grep` stays short. */
const COUNTED = 50
/** Diff rows kept, at most; the pane shows fewer. */
const DIFF_ROWS = 1000

const view = atom({ plugin: 'openskin', key: 'gitView' } as const, null as GitView | null)
const picked = atom({ plugin: 'openskin', key: 'gitPick' } as const, null as GitPick | null)

type Entry = { code: string; path: string }
type Branch = NonNullable<GitView['branch']>

/**
 * `git status --porcelain=v2 --branch` as the branch with its upstream and distance to it, and the
 * files: staged (the index column), unstaged (the work tree column; a conflict is `U`) and untracked.
 */
export const parseGitStatus = (stdout: string) => {
  let name: string | null = null
  let upstream: string | null = null
  let ahead = 0
  let behind = 0
  const staged: Entry[] = []
  const unstaged: Entry[] = []
  const untracked: string[] = []
  for (const line of stdout.split('\n')) {
    const fields = line.split(' ')
    if (line.startsWith('# branch.head ')) name = line.slice('# branch.head '.length).trim()
    else if (line.startsWith('# branch.upstream ')) upstream = line.slice('# branch.upstream '.length).trim()
    else if (line.startsWith('# branch.ab ')) {
      // `+ahead -behind`
      const [plus, minus] = line.slice('# branch.ab '.length).trim().split(' ').map(n => Math.abs(Number(n)) || 0)
      ahead = plus ?? 0
      behind = minus ?? 0
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const xy = fields[1] ?? '..'
      const path = (line.startsWith('1 ') ? fields.slice(8) : fields.slice(9)).join(' ').split('\t')[0]!
      if (xy[0] !== '.') staged.push({ code: xy[0]!, path })
      if (xy[1] !== '.') unstaged.push({ code: xy[1]!, path })
    } else if (line.startsWith('u ')) {
      unstaged.push({ code: 'U', path: fields.slice(10).join(' ') })
    } else if (line.startsWith('? ')) {
      untracked.push(line.slice(2))
    }
  }
  const branch: Branch | null = name === null ? null : { name, upstream, ahead, behind }

  return { branch, staged, unstaged, untracked }
}

/** `git diff --numstat` per file; a binary file (`-`) has no counts. */
export const parseNumstatFiles = (stdout: string) => {
  const counts = new Map<string, { added: number | null; deleted: number | null }>()
  for (const line of stdout.split('\n')) {
    const [added, deleted, ...path] = line.split('\t')
    if (!path.length) continue
    const count = (n?: string) => (n !== undefined && /^\d+$/.test(n) ? Number(n) : null)
    counts.set(path.join('\t'), { added: count(added), deleted: count(deleted) })
  }
  return counts
}

/** `git grep -c` as each file's line count: `path:count`, the path possibly holding `:` itself. */
export const parseLineCounts = (stdout: string) => {
  const counts = new Map<string, number>()
  for (const line of stdout.split('\n')) {
    const at = line.lastIndexOf(':')
    if (at > 0) counts.set(line.slice(0, at), Number(line.slice(at + 1)) || 0)
  }
  return counts
}

/** `git for-each-ref --format=%(refname:short)` as branch names, most recent first. */
export const parseBranchRefs = (stdout: string) =>
  stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

/** `git worktree list --porcelain` as each work tree's path and branch (null when detached). */
export const parseWorktrees = (stdout: string) =>
  stdout
    .split(/\n\s*\n/)
    .map(block => {
      const lines = block.split('\n')
      const path = lines.find(line => line.startsWith('worktree '))?.slice('worktree '.length)
      const ref = lines.find(line => line.startsWith('branch '))?.slice('branch '.length)
      return path ? { path, branch: ref ? ref.replace(/^refs\/heads\//, '') : null } : null
    })
    .filter(tree => tree !== null)

/** `git log --format=%h%x09%s` as each commit's short hash and subject. */
export const parseLog = (stdout: string) =>
  stdout
    .split('\n')
    .filter(line => line.includes('\t'))
    .map(line => ({ hash: line.slice(0, line.indexOf('\t')), subject: line.slice(line.indexOf('\t') + 1) }))

/** A diff's header lines, which the diff card's title already says. */
const HEADER = /^(diff --git |index |--- |\+\+\+ |new file mode|deleted file mode|old mode|new mode|similarity |dissimilarity |rename |copy )/

/** A diff's rows from its first hunk on; with no hunk (a binary file), what follows the header. */
export const diffRows = (stdout: string) => {
  const lines = stdout.replace(/\r/g, '').split('\n')
  while (lines.length && !lines[lines.length - 1]) lines.pop()
  const hunk = lines.findIndex(line => line.startsWith('@@'))
  const rows = hunk === -1 ? lines.filter(line => !HEADER.test(line)) : lines.slice(hunk)

  return rows.slice(0, DIFF_ROWS)
}

/** The git that prints a picked file's diff: the index's, the work tree's, or an untracked file whole. */
const diffArgs = ({ group, path }: GitPick) =>
  group === 'untracked'
    ? ['diff', '--no-color', '--no-ext-diff', '--no-index', '--', '/dev/null', path]
    : ['diff', ...(group === 'staged' ? ['--cached'] : []), '--no-color', '--no-ext-diff', '--', `:(literal)${path}`]

/** Paths as they are, not quoted, in what git prints. */
const PLAIN_PATHS = ['-c', 'core.quotePath=false']

/**
 * (A function declaration: the engine follows `$` past an import only into one.)
 * Reads the Git tab's view of the work tree holding `dir`, and the diff of `pick` while it is
 * still among the files.
 */
async function readGitView($: EngineInterface, dir: string, pick: GitPick | null): Promise<GitView> {
  const empty: GitView = { dir, root: null, branch: null, files: [], branches: [], worktrees: [], log: [], diff: null }
  const top = await runGit($, dir, ['rev-parse', '--show-toplevel'])
  const root = top?.exitCode === 0 ? top.stdout.trim() : ''
  if (!root) return empty

  const git = (args: string[]) => runGit($, root, args)
  const ok = (run: Awaited<ReturnType<typeof git>>) => (run?.exitCode === 0 ? run.stdout : '')
  const [status, unstagedCounts, stagedCounts, refs, trees, log] = (
    await Promise.all([
      git([...PLAIN_PATHS, 'status', '--porcelain=v2', '--branch', '--untracked-files=all']),
      git([...PLAIN_PATHS, 'diff', '--numstat', '--no-renames']),
      git([...PLAIN_PATHS, 'diff', '--cached', '--numstat', '--no-renames']),
      git(['for-each-ref', '--sort=-committerdate', `--count=${BRANCHES + 1}`, '--format=%(refname:short)', 'refs/heads/']),
      git(['worktree', 'list', '--porcelain']),
      git(['log', `-${COMMITS}`, '--format=%h%x09%s']),
    ])
  ).map(ok)

  const parsed = parseGitStatus(status!)
  const staged = parseNumstatFiles(stagedCounts!)
  const unstaged = parseNumstatFiles(unstagedCounts!)
  const counted = parsed.untracked.slice(0, COUNTED)
  const lineCounts =
    counted.length === 0
      ? null
      : await git([...PLAIN_PATHS, 'grep', '--untracked', '-I', '-c', '-e', '', '--', ...counted.map(path => `:(literal)${path}`)])
  // grep answers 1 when no file has a line: every count is 0 then.
  const untrackedLines = lineCounts && lineCounts.exitCode <= 1 ? parseLineCounts(lineCounts.stdout) : null

  const tracked = (group: GitGroup, entries: Entry[], counts: ReturnType<typeof parseNumstatFiles>): GitFile[] =>
    entries.map(({ code, path }) => ({ group, code, path, ...(counts.get(path) ?? { added: null, deleted: null }) }))
  const files = [
    ...tracked('staged', parsed.staged, staged),
    ...tracked('unstaged', parsed.unstaged, unstaged),
    ...parsed.untracked.map((path, i): GitFile => ({
      group: 'untracked',
      code: '?',
      path,
      added: untrackedLines && i < COUNTED ? (untrackedLines.get(path) ?? 0) : null,
      deleted: null,
    })),
  ]

  const name = parsed.branch?.name
  let diff: GitView['diff'] = null
  if (pick && files.some(file => file.group === pick.group && file.path === pick.path)) {
    const run = await git(diffArgs(pick))
    // `--no-index` answers 1 when the files differ, which an untracked file always does.
    diff = { ...pick, rows: run && run.exitCode <= 1 ? diffRows(run.stdout) : [] }
  }

  return {
    dir,
    root,
    branch: parsed.branch,
    files,
    branches: parseBranchRefs(refs!)
      .filter(branch => branch !== name)
      .slice(0, BRANCHES),
    worktrees: parseWorktrees(trees!).filter(tree => tree.path !== root),
    log: parseLog(log!),
    diff,
  }
}

/**
 * At `session.start`: the Git tab's poll, coalesced as the Status card's is, and `moveTo`, which
 * points it at the directory the status line input names without running git. The view is written
 * only when it changed; a pick whose file is gone (committed, reverted) is dropped.
 */
export function startGitView($: EngineInterface, cwd: string) {
  let dir = cwd
  let seen = ''

  const poll = coalesce(async () => {
    const pick = await read($, picked)
    const next = await readGitView($, dir, pick)
    if (pick && !next.diff) await update($, picked, () => null)
    const text = JSON.stringify(next)
    if (text !== seen) {
      seen = text
      await update($, view, () => next)
    }
  })
  return {
    poll,
    moveTo: (next: string) => {
      dir = next
    },
  }
}

/** Picks `file` for its diff, or drops the pick when it is the one picked. */
export async function pickFile($: EngineInterface, file: GitPick): Promise<void> {
  await update($, picked, current => (current?.group === file.group && current.path === file.path ? null : { group: file.group, path: file.path }))
}

/** The Git tab's view and pick as the panel draws them; the view null before git was first read. */
export async function gitTabState($: EngineInterface) {
  const [current, pick] = await Promise.all([read($, view), read($, picked)])

  return { view: current, pick }
}

export type GitTabUi = Pick<Elements['terminal'], 'Box' | 'Button' | 'Text'>

/** A card of the panel: its title on the border, its rows inside. */
export type Card = (title: string, body: JSX.Element[]) => JSX.Element

const GROUPS: { group: GitGroup; label: string }[] = [
  { group: 'staged', label: 'Staged' },
  { group: 'unstaged', label: 'Unstaged' },
  { group: 'untracked', label: 'Untracked' },
]

/**
 * The Git tab: the Status, Branches and Log cards, then the picked file's diff in the rows left of
 * `rows` (the pane's body, less the tab bar's one), with at least two. `onPick` reads git again.
 */
export function drawGitTab(
  { Button, Text }: GitTabUi,
  $: EngineInterface,
  theme: Theme,
  state: { view: GitView | null; pick: GitPick | null },
  rows: number,
  home: string,
  card: Card,
  onPick: () => Promise<void>,
): JSX.Element[] {
  const { view: current, pick } = state
  if (!current) return [<Text dimColor>Reading git…</Text>]
  if (current.root === null) return [<Text dimColor>{`Not a git repository: ${shortHome(current.dir, home)}`}</Text>]

  const muted = (text: string) => <Text color={theme.muted}>{text}</Text>
  const counts = (file: GitFile) => [
    ...(file.added === null ? [] : [' ', <Text color="green">{`+${file.added}`}</Text>]),
    ...(file.deleted === null ? [] : [' ', <Text color={theme.error}>{`-${file.deleted}`}</Text>]),
  ]
  const codeColor = { staged: 'green', unstaged: theme.error, untracked: theme.muted }

  const status: JSX.Element[] = []
  for (const { group, label } of GROUPS) {
    const files = current.files.filter(file => file.group === group)
    if (files.length === 0) continue
    status.push(muted(label))
    for (const file of files) {
      const isPicked = pick?.group === file.group && pick.path === file.path
      status.push(
        <Button
          key={`file:${file.group}:${file.path}`}
          plain
          onPress={async () => {
            await pickFile($, file)
            await onPick()
          }}
        >
          <Text wrap="truncate-end">
            <Text color={codeColor[group]}>{file.code}</Text> <Text {...(isPicked ? { bold: true, color: theme.accent } : {})}>{file.path}</Text>
            {counts(file)}
          </Text>
        </Button>,
      )
    }
  }
  if (status.length === 0) status.push(<Text dimColor>Working tree clean</Text>)

  const branches: JSX.Element[] = []
  const branch = current.branch
  if (branch) {
    branches.push(
      <Text wrap="truncate-end">
        {'● '}
        <Text bold>{branch.name}</Text>{' '}
        {branch.upstream === null ? (
          <Text dimColor>no upstream</Text>
        ) : (
          [<Text color="green">{`↑${branch.ahead}`}</Text>, ' ', <Text color={theme.error}>{`↓${branch.behind}`}</Text>, ' ', muted(branch.upstream)]
        )}
      </Text>,
    )
  }
  for (const name of current.branches) branches.push(<Text color={theme.muted} wrap="truncate-end">{`  ${name}`}</Text>)
  if (current.worktrees.length > 0) {
    branches.push(muted('Worktrees'))
    for (const tree of current.worktrees) {
      branches.push(
        <Text wrap="truncate-end">
          {shortHome(tree.path, home)} {muted(tree.branch ?? '(detached)')}
        </Text>,
      )
    }
  }

  const log =
    current.log.length === 0
      ? [<Text dimColor>No commits yet</Text>]
      : current.log.map(commit => (
          <Text wrap="truncate-end">
            <Text color={theme.accent}>{commit.hash}</Text> {commit.subject}
          </Text>
        ))

  const cards = [card('± Status', status), card('⎇ Branches', branches), card('◆ Log', log)]
  if (!pick) return cards

  // Each card is its rows and its border's two.
  const used = [status, branches, log].reduce((sum, body) => sum + body.length + 2, 0)
  const room = Math.max(2, rows - used - 2)
  const diff = current.diff
  let body: JSX.Element[]
  if (!diff || diff.group !== pick.group || diff.path !== pick.path) body = [<Text dimColor>Reading the diff…</Text>]
  else if (diff.rows.length === 0) body = [<Text dimColor>No changes to show</Text>]
  else {
    const shown = diff.rows.length <= room ? diff.rows : diff.rows.slice(0, room - 1)
    const rowColor = (row: string) =>
      row.startsWith('+') ? { color: 'green' } : row.startsWith('-') ? { color: theme.error } : row.startsWith('@@') ? { color: theme.accent } : {}
    body = shown.map(row => (
      <Text wrap="truncate-end" {...rowColor(row)}>
        {row}
      </Text>
    ))
    if (shown.length < diff.rows.length) body.push(<Text dimColor>{`… ${diff.rows.length - shown.length} more lines`}</Text>)
  }
  return [...cards, card(`Δ ${pick.path}`, body)]
}
