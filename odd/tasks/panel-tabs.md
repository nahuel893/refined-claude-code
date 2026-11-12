# Panel tabs (openskin)

Objective: the openskin status panel gets tabs (Panel, Git, Summary) with keyboard shortcuts; the Git tab is a read-only, lazygit-like view refreshed in near real time.
Branch: `feat/panel-tabs`. Delivery: `exception-ok` (repo policy merges the branch into `main` locally; no PRs). Test runner: `claude plugin test plugins/openskin`, plus `claude plugin validate plugins/openskin`.

## Specs

- **S1 Tabs.** "quiero que nuestro panel lateral, pueda tener pestañas". The docked status panel shows a tab bar with three tabs: **Panel** (today's cards), **Git**, **Summary**. Assumption: Panel is the default tab and holds every current card except Summary.
- **S2 Summary tab.** "una pestaña para el summary". The Summary tab shows the whole session `summary.md` (today it is a card). Assumption: the Summary card leaves the Panel tab and lives only in the Summary tab; with no summary file, the tab says so in one dimmed line.
- **S3 Keyboard.** "atajo de teclados para moverse". Engine limit (types: a Button `hotkey` works only while the plugin's pane holds focus): the tab bar is clickable Buttons; each tab has a letter hotkey (`p` Panel, `g` Git, `s` Summary) that works once the panel holds focus (ctrl+x tab, or a click); `/panel <tab>` (`panel`, `git`, `summary`) opens the panel on that tab and asks for focus. Assumption: the engine `action` prop is not used (its names are undocumented).
- **S4 Git tab content.** "similar a lazy git, pero que muestre la infor importante", "cambios en archivos, y ramas activas", "tambien quisiera ver el git log, eso seria para el tema de ultimos commites. luego el git status tambien estaria genial para saber si falta commitear algo", "Git log y git status, ramas activas y ultimos commits". Sections:
  - Status: staged, unstaged and untracked files, each with its `+/-` line counts; a clean tree says so.
  - Branches: the current branch first with ahead/behind its upstream, then the most recent local branches, then the worktrees.
  - Log: the last 5 commits, short hash and subject on one line each.
  - A file picked with the keyboard (focused pane) or a click shows its diff, cut to the rows the pane has.
- **S5 Refresh.** "se debe actualizar cada poco tiempo para que este en tiempo real". The Git tab re-reads git every 2-3 s while the Git tab is shown, and right after a tool call completes; no git polling for the Git tab while another tab is shown.
- **S6 Read-only.** Agreed playback: the Git tab never stages, commits, checks out or otherwise changes the repository.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1, S2, S3 | delegated (context backstop) | done | this commit (`feat(openskin): add tabs to the status panel`) |
| T2 | S4, S6 | delegated (context backstop) | pending | |
| T3 | S5 | delegated (context backstop) | pending | |
| T4 | S1-S5 docs (README, CLAUDE.md) | delegated (context backstop) | pending | |

- T1: tab atom + tab bar, Panel tab (existing cards), Summary tab, hotkeys, `/panel <tab>`.
- T2: git data (status porcelain v2 with `branch.ab`, numstat, `for-each-ref` branches, `worktree list --porcelain`, `log -5`) and the Git tab render with file selection and diff.
- T3: Git tab polling while shown + `tool.call` refresh, reusing the busy/stale coalescing in `hooks/project.tsx`.
- T4: openskin README and CLAUDE.md panel description.

## Log

- L1 (2026-11-12, user): "escuchame quiero que nuestro panel lateral, pueda tener pestañas: una pestaña para el summary, una pestaña para git diff (el que ya tiene claude) y atajo de teclados para moverse. Luego summary traera su propia pestaña."
- L2 (user): "la parte de git, podemos hacer algo distinto similar a lazy git, pero que muestre la infor importante?"
- L3 (user): "exactamente, cambios en archivos, y ramas activas. que mas podria ser?"
- L4 (user): "si, me cierra, tambien quisiera ver el git log, eso seria para el tema de ultimos commites. luego el git status tambien estaria genial para saber si falta commitear algo. se debe actualizar cada poco tiempo para que este en tiempo real"
- L5 (user): "No. Git log y git status, ramas activas y ultimos commits"
- L6 (user, approving the Git tab playback: per-file `+/-`, ahead/behind, worktrees, file diff on selection, 5 commits, 2-3 s refresh while shown plus after a tool call): "perfecto metele"
- L7 (exploration): panel lives in `plugins/openskin/hooks/statusline.tsx` (pane `openskin-status`, render :319-403, 1.5 s `$.clock.every` at :255); notes in `hooks/notes.tsx`; git via `$.process.run(['git','--no-optional-locks','-C',dir,...])` in `hooks/project.tsx:64`; no `Tabs` element and no global key API; `hotkey` needs pane focus; no `tool.complete` event, use a `tool.call` hook wrapping `next(e)`. Engine types are not laid in `.claude-plugin/types/` yet, so `tsc` cannot run. Baseline: openskin 126 tests.
- L8: route is one delegated writer for T1-T4 in order, by the long-session context backstop. Forecast ~600-800 authored lines with tests; delivery `exception-ok` because the repo merges branches locally. Next: T1.
- L9 (T1): tab bar (Panel, Git, Summary; hotkeys p, g, s), Summary card moved to the Summary tab, `/panel <tab>` opens with focus after 100 ms. Tests: 9 new in `tests/tabs.test.tsx`, 2 notes tests adapted; `claude plugin test plugins/openskin`: 135 pass, 0 fail; `claude plugin validate plugins/openskin`: passed with the 2 baseline warnings (author, icon). Git tab draws a placeholder until T2.
