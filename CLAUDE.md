# refined-claude-code

Claude Code mods (function-hooks plugins) published as one marketplace. Public repository, MIT.

## Layout

- `.claude-plugin/marketplace.json`: marketplace `refined-claude-code`, one entry per mod with its version. Bump the version here and in the mod's own `plugin.json` together.
- `plugins/<mod>/`: one mod per folder. Each has `.claude-plugin/plugin.json`, `hooks/hooks.json` (exactly one module, usually `./register.tsx`), `hooks/*.tsx`, `tests/*.test.tsx`, `types/index.d.ts` when it keeps `$.state`, and a `README.md`.
- `docs/notes/engine-gotchas.md`: what the mod engine does that is not obvious. Read it before touching render or loading code.
- `odd/tasks/<feature>.md`: one ODD feature document per feature (objective, scope, checklist with task IDs, evidence, commits). `odd/handoff-*.md`: session handoffs with the state of work in flight.
- `assets/`: README banner (`banner-v2.png` rendered from `banner.svg`, Cascadia Code on the Rose Pine palette) and screenshot.

## Mods

- **openskin**: the OpenCode look for the transcript (barred prompts and tool calls, reply band, framed shell commands with a clickable `[copy]` button in fullscreen, footer), every color an option. It also owns:
  - the status panel docked beside the transcript in fullscreen. A tab bar (`hooks/tabs.tsx`; a focus square, `■` while the pane has focus and `□` otherwise, then plain Buttons, hotkeys `p` `g` `s` while the pane has focus) switches three tabs:
    - Panel: cards with the title on the border: Status (project, branch, changes), Context (a ten-cell bar in theme colors), Tokens, Usage, Board.
    - Git (`hooks/git.tsx`): read-only Status (staged, unstaged, untracked with `+/-`), Branches (current with ahead/behind, recent branches, worktrees), Log (5 commits), and a picked file's diff cut to the pane's rows. It polls git every 2.5 s and after each `tool.call`, only while shown, through `runGit` and `coalesce` from `hooks/project.tsx`.
    - Summary: the session summary card.
    Unicode icons, never emoji: `◔ ⇅ ◷ ≡ ¶ ± ⎇ ◆ Δ`.
  - `/panel`, which opens the panel below 144 columns; `/panel <tab>` opens it on that tab with focus, 100 ms after the command answers.
  - `/skin`, which offers 11 theme presets and writes the colors through `$.config.set`.
  - `panelBackground`, which paints inside the engine's grey pane frame.
  - a transcript scrollbar: a one-character clickable column on the panel's left edge (track, thumb marking the viewport, a click jumps to the message at that height; the bottom cell returns to the latest). It reads each transcript row's `onScreen` in the row hooks and scrolls with `$.ui.scroll` from the Button's press.
- **command-register**: `/cc` opens a focused pane (docked beside the transcript in fullscreen, inline above the prompt otherwise) with the shell commands Claude gave, message by message: `‹` `›` (or `h` `l`) switch message, a digit or Enter copies a command, typing filters; `/cc <n>` copies command n of the latest message. Mouse clicks need `"tui": "fullscreen"`. The register is also written to `~/.cache/refined-claude-code/projects/<cwd slug>/<session id>/commands.json` on every change and restored from it at session start, so a background or a restart of the same session keeps it.
- **board**: `/board` asks a model (Haiku by default, configurable) to rewrite this session's done `✓` / pending `○` / waiting `◇` list into `~/.cache/refined-claude-code/projects/<cwd slug>/<session id>/board.md`. A new session starts from an empty board. Claude keeps the same file through the `mcp__board__board` tool (`add`, `done <n>`, `wait <n>`), with a one-line hint at session start, a reminder after `reminderTurns` quiet turns (default 5), and the numbered list once after an outside change. `/board` and the tool share an in-memory lock: tool calls wait at most about 7 s (the hook budget is 10 s), and a stale `done`/`wait` after a rewrite is refused with the new list.
- **summarize**: `/summ` asks a model (Haiku by default, configurable) for a session summary in `~/.cache/refined-claude-code/projects/<cwd slug>/<session id>/summary.md`.

The cwd slug is the working directory with every `/` replaced by `-`. Each mod computes these paths itself; they share no code. The old `board/<slug>.md` and `summaries/<session id>.md` files are not read, moved or deleted.

board and summarize are independent of openskin. The panel only reads the current session's files and redraws when they change.

## The status line contract (openskin panel)

The panel reuses the user's status line script, which lives outside this repo:

- The script saves each session's JSON input to `~/.cache/openskin/sessions/<session_id>.json`.
- Once docked, openskin touches `~/.cache/openskin/docked/<session_id>`. Then the script prints only one line under the prompt: model | vim mode | cost | time | effort | style.
- The panel runs the script with `OPENSKIN_PANEL=1` to get the rest: repo, worktree, agent, fast mode, version. It drops 5h/7d and the context bar, which have their own cards.
- The reference script and the desktop theme switcher (`theme-switch.sh`: kitty, sway, and openskin colors in one command, with a fuzzel picker) are in the maintainer's dotfiles, not here.

## Working here

- Install the repo as a folder marketplace. After that, edits plus `/reload-plugins` apply with no reinstall.
- Check every mod you touch:
  - `claude plugin validate plugins/<mod>`
  - `claude plugin test plugins/<mod>`
  - `tsc -p plugins/<mod>`, once the engine has laid the types in `.claude-plugin/types/` (gitignored).
- Test-first for behavior changes. Observe RED, then GREEN. Regression tests sit next to the code they guard.
- Last known test counts: openskin 154, command-register 44, board 28, summarize 9.
- Artifacts (code, comments, docs, commit messages) are in English.

## Commits and publishing

- Conventional Commits, imperative, under 72 characters. One concern per commit: never mix a feature, a style tweak and docs in one commit. No AI attribution or Co-Authored-By trailers.
- Work on a branch, then merge to `main`. Push only when the maintainer says so.
- The repository is public. Before every push, scan the diff for private data: absolute home paths, user names, hostnames, emails, tokens, internal URLs. Run the scan as a separate step that must pass, never chained with `;` before `git push`. A home path reached GitHub once that way.
- Example paths in docs use a generic home, like `/home/user`.
