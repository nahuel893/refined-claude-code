/*
 * Tokens, Fill and Limit are ported from better-claude:
 * https://github.com/midudev/better-claude/blob/main/plugins/token-meter/types/index.d.ts
 * https://github.com/midudev/better-claude/blob/main/plugins/context-meter/types/index.d.ts
 * https://github.com/midudev/better-claude/blob/main/plugins/sub-meter/types/index.d.ts
 * Copyright (c) 2026 Miguel Ángel Durán (midudev), MIT License (see ../NOTICE).
 */

/** The status line script's latest output, one entry per line, ANSI codes kept. */
export type StatusLines = string[]

/** The board mod's file for this project, one `✓ `, `○ ` or `◇ ` line per item. */
export type BoardLines = string[]

/**
 * The session's project as the Status card shows it: its directory, and inside a git work tree the
 * branch and the uncommitted changes (files changed or untracked; lines added and deleted in
 * tracked files). `branch` null outside a work tree, the counts 0 then.
 */
export type ProjectStatus = { dir: string; branch: string | null; files: number; added: number; deleted: number }

/** Token counts of one turn, or summed over the session. */
export type Tokens = { input: number; output: number; cached: number }

/**
 * The context window's fill, 0 to 100: the engine's figure from the last response, or, while it has
 * none (a fresh, resumed, compacted or rewound session), /context's count of it (`isEstimate`), with
 * the tokens in use over the window measured against when known. null when there is neither.
 */
export type Fill = { value: number; isEstimate: boolean; tokens?: number; window?: number } | null

/** One rate-limit window of the subscription, as the last API response reported it. */
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

/** The status panel's tab shown: the cards, the Git view or the session summary. */
export type PanelTab = 'panel' | 'git' | 'summary'

/** Where a file of the Git tab stands: staged in the index, changed in the work tree, or untracked. */
export type GitGroup = 'staged' | 'unstaged' | 'untracked'

/**
 * A file of the Git tab: its status letter in its group (`M`, `A`, `D`, `R`, `U` for a conflict,
 * `?` untracked), its path from the repository's top, and its lines added and deleted (null for a
 * binary file, or one git gave no count for).
 */
export type GitFile = { group: GitGroup; code: string; path: string; added: number | null; deleted: number | null }

/** A file of the Git tab picked for its diff. */
export type GitPick = { group: GitGroup; path: string }

/**
 * What the Git tab draws, read with git: `root` null outside a work tree, everything else empty
 * then. `branch` is the current one (`(detached)` off any), `branches` the most recent other local
 * ones, `worktrees` the other work trees of the repository, `log` the last commits, and `diff` the
 * picked file's rows from its first hunk, when one is picked.
 */
export type GitView = {
  dir: string
  root: string | null
  branch: { name: string; upstream: string | null; ahead: number; behind: number } | null
  files: GitFile[]
  branches: string[]
  worktrees: { path: string; branch: string | null }[]
  log: { hash: string; subject: string }[]
  diff: (GitPick & { rows: string[] }) | null
}

/** A document of the project's docs index: its path from the project's directory, and its group. */
export type DocEntry = { path: string; group: string }

/**
 * The project's docs index, as `docs.json` holds it: the groups in the order they were first used,
 * and the documents in the order they were added.
 */
export type DocsIndex = { groups: string[]; docs: DocEntry[] }

declare module 'claude-code' {
  interface PluginState {
    openskin: {
      statusLines: StatusLines
      tokenTurn: Tokens | null
      tokenSession: Tokens
      contextFill: Fill
      usageLimits: Limit[]
      usageTick: number
      scrollbarTick: number
      board: BoardLines
      summary: string
      project: ProjectStatus | null
      tab: PanelTab
      gitView: GitView | null
      gitPick: GitPick | null
    }
  }
}
