import type { Elements, EngineInterface, On, RenderChildren } from 'claude-code'
import { drawCommand, ENGINE_GUTTER, type CopyContext, type Segment } from './commands'
import type { Tracker } from './scrollbar'
import { drawTable, splitTables } from './tables'
import { paint, type Theme } from './theme'

/** The origins of a user row that are the person's own prompt: typed, sent from a phone, or a host app's. */
const OWN_PROMPT_ORIGINS = new Set(['composer', 'bridge', 'sdk'])

/**
 * A model id as a person reads it: `claude-opus-5-5` is `Opus 5.5`, a dated or
 * provider-prefixed id loses the date and prefix. An id of another shape is kept as given.
 */
export const formatModel = (id: string): string => {
  const raw = id.trim()
  if (!raw || /\s/.test(raw)) return raw

  const tokens = raw
    .replace(/\[[^\]]*\]$/, '')
    .replace(/^.*?claude-/i, '')
    .split('-')
    .filter(token => !/^\d{8}$/.test(token) && !/^v\d+(:\d+)?$/.test(token))
  const families = tokens.filter(token => /^[a-z]+$/i.test(token))
  const versions = tokens.filter(token => /^\d+$/.test(token))

  if (families.length !== 1 || families.length + versions.length !== tokens.length) return raw

  const family = families[0]!
  return [family[0]!.toUpperCase() + family.slice(1).toLowerCase(), versions.join('.')].filter(Boolean).join(' ')
}

/** A turn's length: `6.7s` under ten seconds, `45s` under a minute, then `1m 12s`, then `1h 2m`. */
export const formatDuration = (ms: number): string => {
  const tenths = Math.round(ms / 100)
  if (tenths < 100) return `${(tenths / 10).toFixed(1)}s`

  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export type Ui = Pick<Elements['terminal'], 'Box' | 'Text' | 'Markdown' | 'Code' | 'Button'>

/**
 * `above`: clear rows over the block, outside it. Every piece (block, reply, footer) keeps
 * its gap above itself and none below, so any two neighbours sit exactly one row apart.
 * `top`, `bottom`: rows of air inside the block, on its surface.
 */
export type Air = { above: number; top: number; bottom: number }

/** Columns kept clear on both sides of the window, so nothing touches its edges. */
const GUTTER = 2

/** Where a block's text starts (gutter, bar, content padding); replies and the footer start there too. */
const TEXT_INDENT = GUTTER + 1 + 2

/**
 * A full-width block: a one-column bar in `bar` down the left edge (it stretches to
 * the block's height) and the content on the theme's surface, `air` rows above and below.
 */
export const drawBlock = ({ Box }: Pick<Ui, 'Box'>, theme: Theme, bar: string, air: Air, content: RenderChildren) => (
  <Box flexDirection="row" alignItems="stretch" marginX={GUTTER} marginTop={air.above}>
    <Box width={1} flexShrink={0} backgroundColor={bar} />
    <Box
      flexDirection="column"
      flexGrow={1}
      flexShrink={1}
      backgroundColor={theme.surface}
      paddingX={2}
      paddingTop={air.top}
      paddingBottom={air.bottom}
    >
      {content}
    </Box>
  </Box>
)

const ROOMY: Air = { above: 1, top: 1, bottom: 1 }

/**
 * A reply on a band of the theme's `background`: no bullet, no bar, the blocks' side
 * gutters, its text starting at TEXT_INDENT as a block's does, its shell commands framed.
 * A row clear above it (see Air) keeps it off a block; a row of air inside, top and
 * bottom, keeps the text off the band's edges.
 */
export function drawReply(
  ui: Ui,
  $: Pick<EngineInterface, 'ui' | 'clock'>,
  theme: Theme,
  segments: Segment[],
  copy?: CopyContext,
) {
  return (
    <ui.Box
      flexDirection="column"
      marginX={GUTTER}
      marginTop={1}
      backgroundColor={paint(theme.background)}
      paddingLeft={TEXT_INDENT - GUTTER}
      paddingRight={2}
      paddingY={1}
      gap={1}
    >
      {segments.flatMap((segment, i) =>
        segment.kind === 'prose'
          ? splitTables(segment.text).map((piece, j) =>
              piece.kind === 'text' ? (
                <ui.Markdown key={`prose:${i}:${j}`} text={piece.text} />
              ) : (
                drawTable(ui, theme, piece.table, `table:${i}:${j}`)
              ),
            )
          : [drawCommand(ui, $, theme, segment, `command:${i}`, copy)],
      )}
    </ui.Box>
  )
}

/**
 * A summary keeps the engine's drawing (`drawn`, asked for without the bullet), shifted
 * so its text starts where the replies' text does.
 */
export const drawSummary = ({ Box }: Pick<Ui, 'Box'>, drawn: RenderChildren) => (
  <Box paddingLeft={TEXT_INDENT - ENGINE_GUTTER}>{drawn}</Box>
)

/**
 * The OpenCode look for every row but Claude's replies, which `register` draws itself
 * because one hook has to own them (see there).
 */
export const registerOpencode = (on: On, theme: Theme, tracker: Tracker) => {
  // The person's prompt is drawn whole in every view, so an expanded row loses nothing.
  // Notifications and other parties' messages keep the engine's drawing.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    tracker.see(e)
    if (!OWN_PROMPT_ORIGINS.has(e.props.origin.kind) || !e.props.text.trim()) return next(e)

    const ui = $.ui.resolve(e)
    const { Text } = ui
    return drawBlock(ui, theme, theme.accent, ROOMY, <Text>{e.props.text}</Text>)
  })

  // A standalone call is two adjacent rows, the call and its result: air above the
  // first and below the second makes them read as one block.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    tracker.see(e)
    return drawBlock($.ui.resolve(e), theme, theme.toolBar, { above: 1, top: 1, bottom: 0 }, await next(e))
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) =>
    drawBlock($.ui.resolve(e), theme, theme.toolBar, { above: 0, top: 0, bottom: 1 }, await next(e)),
  )

  // An unfolded group draws each call as a ToolUse row, which gets its own block.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    tracker.see(e)
    return e.props.isExpanded ? next(e) : drawBlock($.ui.resolve(e), theme, theme.toolBar, ROOMY, await next(e))
  })

  // The transcript's system error line: a slash command that threw.
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    tracker.see(e)
    if (!e.props.isErrored) return next(e)

    const ui = $.ui.resolve(e)
    const { Text } = ui
    return drawBlock(ui, theme, theme.error, ROOMY, <Text color={theme.muted}>{e.props.text}</Text>)
  })

  // The line closing a turn becomes `▣ Claude · <model> · <duration>`; while it
  // waits on background agents it keeps the engine's waiting text.
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (e.props.waitingFor) return next(e)

    let model = ''
    try {
      model = formatModel(await $.session.model())
    } catch {
      // No model to name: the footer leaves it out.
    }

    const details = [model, formatDuration(e.props.durationMs)].filter(Boolean).join(' · ')
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box paddingLeft={TEXT_INDENT} marginTop={1}>
        <Text>
          <Text color={theme.accent}>▣</Text> <Text bold>Claude</Text>
          <Text color={theme.muted}>{` · ${details}`}</Text>
        </Text>
      </Box>
    )
  })
}
