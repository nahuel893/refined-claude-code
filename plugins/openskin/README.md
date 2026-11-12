# openskin

An OpenCode-style look for the Claude Code terminal transcript, as a Claude Code mod.

- Your prompts sit in a full-width block with an accent bar down the left edge.
- Tool calls, their results and errors get blocks of their own, with a quieter bar.
- Claude's replies are drawn without a bullet, on a background band of their own.
- Shell commands in a reply are framed, so they stand apart from the prose. Each frame has a `[copy]` button on the right end of its top border: a click copies the whole command and the label reads `copied` for a moment (a failed copy shows a toast with the reason).
- Each turn closes with a footer: `▣ Claude · <model> · <duration>`.

- In fullscreen, a status panel of cards docks beside the transcript: the project's directory, git branch and uncommitted changes with your status line script's output, one row per part; how full the context window is; each turn's tokens; your subscription's 5-hour and weekly windows; then the session's board. Tabs switch it to a read-only Git view (status, branches, the last commits, a file's diff) or to the session's summary.
- `/skin` switches every color at once between ten presets (Tokyo Night, Catppuccin, Gruvbox, Nord, Rose Pine, Kanagawa, Everforest, One Dark and more), and Claude Code's own theme with them.

Every color is an option, and each part (the OpenCode look, the command frames, the status panel) can be switched off on its own.

Unofficial: not affiliated with OpenCode or Anthropic.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install openskin --marketplace nahuel893/refined-claude-code
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```bash
claude plugin install openskin --marketplace nahuel893/refined-claude-code
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `nahuel893/refined-claude-code`, then Add plugin.

## Options

Change them with `/plugin configure openskin@refined-claude-code`. A color is a hex such as `#f0a6ec`, a color name, or a Claude Code theme key such as `bashBorder`.

| Option | Default | What it does |
| --- | --- | --- |
| `opencodeStyle` | `true` | The OpenCode look: prompt, tool and error blocks, the reply band, the turn footer. |
| `commandFrames` | `true` | Frames the shell commands in Claude's replies and asks Claude to tag them as shell blocks. |
| `statusPanel` | `true` | The status panel beside the transcript in fullscreen; `/panel` opens it, `/panel git` on a tab. |
| `contextWarnAt` | `50` | The context fill, in percent, from which the panel's ◔ Context section turns yellow (time to `/compact`). |
| `contextDangerAt` | `75` | The context fill from which it turns the error color (compact now or start a new session). |
| `accent` | `#f0a6ec` | The bar beside your prompts and the square in the footer. |
| `surface` | `#24242c` | The background of the prompt, tool and error blocks. |
| `toolBar` | `#55555f` | The bar beside tool calls and their results. |
| `error` | `#ff6b5b` | The bar beside error rows. |
| `muted` | `#7f7f8a` | The footer's model and duration, and the text of error rows. |
| `command` | `bashBorder` | The frame and label of shell commands. |
| `background` | `#1c1c22` | The band behind Claude's replies; `none` draws no band. |
| `panelBackground` | `none` | The background of the whole status panel, to match your terminal (`#000000` on a black one); `none` paints nothing and keeps what Claude Code draws there. `/skin` presets leave it as it is. |

The `[copy]` button needs Claude Code's fullscreen layout, because only fullscreen reports mouse clicks. Turn it on with `/tui fullscreen`, or set `"tui": "fullscreen"` in `~/.claude/settings.json` to make it the default. On the main screen the engine reports that its layout is not fullscreen (`RenderViewport.isFullscreen`), and openskin draws no button there; a surface that does not say gets the button.

With `opencodeStyle` off and `commandFrames` on, Claude Code keeps its own transcript and only the commands are framed. With both off, the mod draws nothing.

## Themes

`/skin` lists the presets; `/skin <name>` applies one. A preset sets every color option above and switches Claude Code's own theme to dark or light to match. It changes the same settings `/plugin configure` does, so the mod reloads with the new colors, and `/skin default` brings back the defaults.

| Preset | Theme | `accent` | `surface` | `toolBar` | `error` | `muted` | `command` | `background` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `default` | dark | `#f0a6ec` | `#24242c` | `#55555f` | `#ff6b5b` | `#7f7f8a` | `bashBorder` | `#1c1c22` |
| `tokyonight` | dark | `#bb9af7` | `#1f2335` | `#414868` | `#f7768e` | `#737aa2` | `#7dcfff` | `#16161e` |
| `catppuccin-mocha` | dark | `#cba6f7` | `#313244` | `#585b70` | `#f38ba8` | `#9399b2` | `#94e2d5` | `#181825` |
| `catppuccin-latte` | light | `#8839ef` | `#ccd0da` | `#acb0be` | `#d20f39` | `#5c5f77` | `#179299` | `#e6e9ef` |
| `gruvbox-dark` | dark | `#fabd2f` | `#3c3836` | `#665c54` | `#fb4934` | `#a89984` | `#8ec07c` | `#1d2021` |
| `nord` | dark | `#88c0d0` | `#3b4252` | `#4c566a` | `#bf616a` | `#81a1c1` | `#a3be8c` | `#2e3440` |
| `rose-pine` | dark | `#c4a7e7` | `#26233a` | `#403d52` | `#eb6f92` | `#908caa` | `#9ccfd8` | `#191724` |
| `rose-pine-dawn` | light | `#907aa9` | `#f2e9e1` | `#cecacd` | `#b4637a` | `#797593` | `#56949f` | `#faf4ed` |
| `kanagawa-wave` | dark | `#d27e99` | `#2a2a37` | `#54546d` | `#e46876` | `#938aa9` | `#7fb4ca` | `#16161d` |
| `everforest` | dark | `#a7c080` | `#343f44` | `#475258` | `#e67e80` | `#9da9a0` | `#83c092` | `#232a2e` |
| `one-dark` | dark | `#61afef` | `#2c313c` | `#3e4451` | `#e06c75` | `#828997` | `#56b6c2` | `#21252b` |

A setting that something else controls, such as a theme fixed by managed settings, is left as it is, and `/skin` names it in its reply.

![/skin listing the presets](../../assets/features/skin.jpg)

### Gallery

Each preset in a real session, with the terminal background and `panelBackground` set as the table below says.

| | |
| --- | --- |
| `default`<br>![default preset](../../assets/themes/default.jpg) | `tokyonight`<br>![tokyonight preset](../../assets/themes/tokyonight.jpg) |
| `catppuccin-mocha`<br>![catppuccin-mocha preset](../../assets/themes/catppuccin-mocha.jpg) | `catppuccin-latte`<br>![catppuccin-latte preset](../../assets/themes/catppuccin-latte.jpg) |
| `gruvbox-dark`<br>![gruvbox-dark preset](../../assets/themes/gruvbox-dark.jpg) | `nord`<br>![nord preset](../../assets/themes/nord.jpg) |
| `rose-pine`<br>![rose-pine preset](../../assets/themes/rose-pine.jpg) | `rose-pine-dawn`<br>![rose-pine-dawn preset](../../assets/themes/rose-pine-dawn.jpg) |
| `kanagawa-wave`<br>![kanagawa-wave preset](../../assets/themes/kanagawa-wave.jpg) | `everforest`<br>![everforest preset](../../assets/themes/everforest.jpg) |
| `one-dark`<br>![one-dark preset](../../assets/themes/one-dark.jpg) | |

### Match your terminal background

openskin draws on top of your terminal's own background, and a mod cannot change that color. After `/skin <name>`, set your terminal's background to the preset's base color, or the reply bands, blocks and panel sit on a color that does not belong to the theme. Set `panelBackground` to the same color so the status panel matches too.

| Preset | Terminal background |
| --- | --- |
| `default` | `#000000` or any near-black |
| `tokyonight` | `#1a1b26` |
| `catppuccin-mocha` | `#1e1e2e` |
| `catppuccin-latte` | `#eff1f5` |
| `gruvbox-dark` | `#282828` |
| `nord` | `#2e3440` |
| `rose-pine` | `#191724` |
| `rose-pine-dawn` | `#faf4ed` |
| `kanagawa-wave` | `#1f1f28` |
| `everforest` | `#2d353b` |
| `one-dark` | `#282c34` |

Most terminals ship these themes, so picking the same theme there is usually enough. In kitty, for example, `kitty +kitten themes` applies one, or `background #1a1b26` in `kitty.conf` sets the color by hand. A desktop theme script can switch the terminal, `panelBackground` and the openskin colors in one step; see the paragraph below.

Edits made outside Claude Code, such as a desktop theme script rewriting `~/.claude/settings.json`, reach open sessions by themselves within a few seconds. A session that has stopped following the file (one started before the file was replaced, say by a symlink into a dotfiles repository) gets a `/reload-plugins` from openskin when its colors or theme fall behind. `/skin` writes nothing while the session is behind the file, so it never undoes such an edit: it reloads first and asks you to run it again.

## Status panel

In the fullscreen layout the panel opens by itself beside the transcript (`/panel` opens it anywhere). Its top row is a tab bar: **Panel** (the cards below, shown first), **Git** and **Summary**. Every part of it is a card: a rounded border in the `toolBar` color with the card's title drawn in its top edge, the cards stacked with no blank row between them, labels in the `muted` color and values bold.

![/panel opening the status panel in a window under 144 columns](../../assets/features/panel.jpg)

- **✿ Status**: always first. The project's directory (your home written as `~`); inside a git work tree, `Branch` and, while there are uncommitted changes, `Changes`: how many files are changed or untracked, then the lines added (green) and deleted (the `error` color) in tracked files since the last commit (untracked files count as files, their lines are not counted). Under them, the rows of `~/.claude/statusline.sh`, each ` | ` separated part on its own row, leaving out the `5h:` and `7d:` parts and the context bar, which the ◷ Usage and ◔ Context cards replace. Git runs again when Claude Code gives the status line new input (after a turn, or in another directory) and otherwise every 15 seconds, so edits made outside the session show up too.

Then, on the Panel tab, each card once it has something to show:

- **◔ Context**: how full the context window is, as the status line's ten-cell bar (`██████░░░░ 58% (116000/200000)`, the tokens when known): filled cells in the `accent` color, yellow from `contextWarnAt` and the `error` color from `contextDangerAt`, empty cells `muted`. Before the session's first response it is counted once as `/context` does and shown with a `~`.
- **⇅ Tokens**: the last turn's input (`↑`), output (`↓`) and cache tokens, then the session's running total.
- **◷ Usage**: the subscription's 5-hour and weekly windows, a bar yellow from 75% and red from 90%, and the time until each resets. Every open session shares the latest reading. Off a subscription there is nothing to show.
- **≡ Board · 2 of 5**: the session's board from the [board](../board) mod, one row per item, its title counting the done ones. A done item (`✓`) is struck through and dim, a pending one (`○`) plain, and one waiting on your decision (`◇`) has its mark in the accent color. Long items wrap.

The board needs the [board](../board) mod and the Summary tab the [summarize](../summarize) mod. Both write into the session's folder under its project, `~/.cache/refined-claude-code/projects/<project slug>/<session id>/`: `/board` writes `board.md` and `/summ` writes `summary.md`. The panel reads only the current session's files, never another session's. The panel checks both files every 1.5 seconds and redraws a section when its file changes. With no file, or an empty one, the card is left out.

### Tabs

Click a tab to show it. Once the panel has the keys (ctrl+x tab, or a click in it) its letter shows it too: `p` Panel, `g` Git, `s` Summary. A square before the tabs tells whether it has them: `■` while it does, `□` while the prompt does. Claude Code hands a pane's letters to it only while it holds the keys, so they do nothing from the prompt. `/panel git` (or `panel`, `summary`) opens the panel on that tab and asks for the keys, so the letters work at once; `/panel` alone opens it as before, on the tab last shown.

- **Summary**: the whole session summary from the [summarize](../summarize) mod (`/summ`), in a **¶ Summary** card wrapped to the panel's width, never cut. With no summary yet the tab says so in one dim line.
- **Git**: the repository at a glance, read-only. It never stages, commits, checks out or changes anything; every git it runs only reads, without taking git's optional locks.
  - **± Status**: the files under `Staged`, `Unstaged` (a conflict is `U`) and `Untracked`, each with its status letter and its lines added (green) and deleted (the `error` color); an untracked file counts its lines as added. A clean tree says `Working tree clean`.
  - **⎇ Branches**: the current branch first, `↑` commits ahead of and `↓` behind its upstream (or `no upstream`), then the five most recent other local branches, then the repository's other worktrees with their branches.
  - **◆ Log**: the last five commits, short hash and subject on one line each.
  - **Δ <file>**: click a file (or Tab to it and Enter while the panel has the keys) and its diff shows under the cards from its first hunk, cut to the rows the pane has, with how many lines are left out; click it again to close it.

  The Git tab reads git every 2.5 seconds while it is shown, and right after each tool call completes; while another tab is shown it reads none.

### Transcript scrollbar

A one-character column runs down the panel's left edge, between the transcript and the cards. The `muted` track holds a thumb in the `accent` color that marks which part of the conversation the transcript shows. Click any cell and the transcript jumps to the message at that height: the top cell is the first message, the bottom cell takes you back to the latest. It is for scrolling up fast with the mouse; the wheel and PageUp/PageDown work as before, and dragging the thumb is not possible (a pane gets clicks, not drags).

The bar learns where the viewport is from the rows the transcript draws, so it knows only the messages drawn in this session, in the order they were drawn, and sizes each by the rows it has seen on screen. A message too far back to still be drawn cannot be scrolled to: you get a toast, and scrolling closer first makes it reachable. A panel taller than its pane scrolls the bar with it.

### Feeding the panel from your status line script

The panel reads the input Claude Code last gave your script, so the script has to keep it. Add this near the top of `~/.claude/statusline.sh`, after it reads stdin into `$input`:

```bash
SESSION_ID=$(jq -r '.session_id // empty' <<<"$input")
if [ -n "$SESSION_ID" ]; then
  OPENSKIN=~/.cache/openskin
  mkdir -p "$OPENSKIN/sessions" &&
    printf '%s' "$input" >"$OPENSKIN/sessions/$SESSION_ID.json.tmp" &&
    mv -f "$OPENSKIN/sessions/$SESSION_ID.json.tmp" "$OPENSKIN/sessions/$SESSION_ID.json"
  # Docked, the panel shows the status line: leave Claude Code's own one empty.
  [ -z "$OPENSKIN_PANEL" ] && [ -e "$OPENSKIN/docked/$SESSION_ID" ] && exit 0
fi
```

Once the panel docks it creates `~/.cache/openskin/docked/<session id>`, and the last line keeps the status line under the prompt empty for that session; the panel runs the script with `OPENSKIN_PANEL=1` to get the lines it draws. Drop that line to keep both. To make fullscreen the default for every session, set `"tui": "fullscreen"` in `~/.claude/settings.json`.

## Limits

A mod can only restyle what Claude Code lets it draw. The prompt input box has no hook, so its look follows `/theme`. Rows the engine draws itself (the spinner, system notices) keep their own look.

## Development

```bash
claude plugin test .
claude plugin validate .
```

## Credits

The panel's Context, Tokens and Usage sections are ported from three mods of [better-claude](https://github.com/midudev/better-claude) by Miguel Ángel Durán (midudev), MIT License: [context-meter](https://github.com/midudev/better-claude/tree/main/plugins/context-meter), [token-meter](https://github.com/midudev/better-claude/tree/main/plugins/token-meter) and [sub-meter](https://github.com/midudev/better-claude/tree/main/plugins/sub-meter). Their license and which files hold their code are in [NOTICE](NOTICE).

## License

MIT
