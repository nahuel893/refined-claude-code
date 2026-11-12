import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'
import type { ProjectStatus } from '../types'

/**
 * What the Status card says about the session's project: its directory, and where that is a git
 * work tree, the branch and the uncommitted changes. Git runs on the status panel's timer, never a
 * timer of its own: when the status line input changes (a new turn, another directory) and
 * otherwise every GIT_EVERY ticks, so edits made outside the session show up too. The result is
 * kept in `$.state` and written only when it changed, so an idle panel is not redrawn.
 */
export const GIT_EVERY = 10

const project = atom({ plugin: 'openskin', key: 'project' } as const, null as ProjectStatus | null)

/** `$HOME` and what is under it as `~`. */
export const shortHome = (dir: string, home: string) =>
  dir === home ? '~' : dir.startsWith(`${home}/`) ? `~${dir.slice(home.length)}` : dir

/** The directory the status line input names (`workspace.current_dir`, then `cwd`), `fallback` without one. */
export const inputDir = (json: string, fallback: string): string => {
  try {
    const input = JSON.parse(json) as { workspace?: { current_dir?: unknown }; cwd?: unknown }
    const dir = input.workspace?.current_dir ?? input.cwd
    return typeof dir === 'string' && dir ? dir : fallback
  } catch {
    return fallback
  }
}

/**
 * `git status --porcelain=v2 --branch` as the branch (null outside a work tree) and the number of
 * files with changes: changed, renamed, unmerged and untracked entries alike.
 */
export const parseStatus = (stdout: string): { branch: string | null; files: number } => {
  let branch: string | null = null
  let files = 0
  for (const line of stdout.split('\n')) {
    if (line.startsWith('# branch.head ')) branch = line.slice('# branch.head '.length).trim()
    else if (/^[12u?] /.test(line)) files++
  }
  return { branch, files }
}

/** `git diff --numstat` as lines added and deleted; a binary file (`-`) counts none. */
export const parseNumstat = (stdout: string): { added: number; deleted: number } =>
  stdout.split('\n').reduce(
    (sum, line) => {
      const [added, deleted] = line.split('\t').map(Number)
      return {
        added: sum.added + (Number.isFinite(added) ? added! : 0),
        deleted: sum.deleted + (Number.isFinite(deleted) ? deleted! : 0),
      }
    },
    { added: 0, deleted: 0 },
  )

/**
 * (A function declaration: the engine follows `$` past an import only into one.)
 * Runs git in `dir` as every reader of the panel does: with no optional locks, so a read never
 * takes the index lock, and with a 5 s limit. A git that cannot run answers null.
 */
export async function runGit($: EngineInterface, dir: string, args: string[]) {
  return $.process.run(['git', '--no-optional-locks', '-C', dir, ...args], { timeoutMs: 5000 }).catch(() => null)
}

/**
 * A poll of `work` that never runs twice at once and drops none: one asked while `work` runs makes
 * it run once more when it is done, however many were asked.
 */
export const coalesce = (work: () => Promise<void>) => {
  let isBusy = false
  let isStale = false

  const poll = async (): Promise<void> => {
    if (isBusy) {
      isStale = true
      return
    }
    isBusy = true
    try {
      await work()
    } finally {
      isBusy = false
    }
    if (isStale) {
      isStale = false
      await poll()
    }
  }
  return poll
}

/**
 * Reads git in `dir`. Untracked files count as changed files, their lines not counted (numstat
 * against HEAD knows tracked files only). A repository with no commit yet has a branch and files
 * but no line counts; outside a work tree, or with no git at all, only the directory is known.
 */
async function readGit($: EngineInterface, dir: string): Promise<ProjectStatus> {
  const git = (args: string[]) => runGit($, dir, args)
  const [status, numstat] = await Promise.all([
    git(['status', '--porcelain=v2', '--branch', '--untracked-files=all']),
    git(['diff', '--numstat', 'HEAD']),
  ])
  const { branch, files } = status?.exitCode === 0 ? parseStatus(status.stdout) : { branch: null, files: 0 }
  const { added, deleted } = branch !== null && numstat?.exitCode === 0 ? parseNumstat(numstat.stdout) : { added: 0, deleted: 0 }

  return { dir, branch, files: branch === null ? 0 : files, added, deleted }
}

/**
 * At `session.start`: answers the poll that brings the project up to date, in `dir` when given
 * (the status line input named one), in the last directory otherwise. A poll that comes while git
 * runs is not dropped: git runs once more when the first is done.
 */
export function startProject($: EngineInterface, cwd: string) {
  let dir = cwd
  let seen = ''

  const run = coalesce(async () => {
    const status = await readGit($, dir)
    const text = JSON.stringify(status)
    if (text !== seen) {
      seen = text
      await update($, project, () => status)
    }
  })
  return (next?: string): Promise<void> => {
    if (next) dir = next
    return run()
  }
}

/** The project as the Status card draws it; null before git has first been read. */
export async function projectStatus($: EngineInterface): Promise<ProjectStatus | null> {
  return read($, project)
}
