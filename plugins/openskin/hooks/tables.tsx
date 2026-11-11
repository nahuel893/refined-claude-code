import type { Elements } from 'claude-code'
import type { Theme } from './theme'

/**
 * Markdown tables drawn by the mod instead of the engine.
 *
 * The engine sizes a table to the terminal's width, not to the box it sits in, so
 * inside the reply band (gutters and padding on both sides) every row ran past the
 * band's edge and wrapped. Here each column is a Box with a percentage width, so the
 * layout fits whatever room the band has and each cell wraps inside its own column.
 */

export type Align = 'left' | 'center' | 'right'
export type Table = { header: string[]; align: Align[]; rows: string[][] }
export type Piece = { kind: 'text'; text: string } | { kind: 'table'; table: Table }

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const DELIMITER_CELL = /^\s*:?-+:?\s*$/

/** A row's cells: outer pipes dropped, split on pipes that are neither escaped nor inside a code span. */
export const splitRow = (line: string): string[] => {
  let row = line.trim()
  if (row.startsWith('|')) row = row.slice(1)
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1)

  const cells: string[] = []
  let cell = ''
  let inCode = false
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]!
    if (ch === '\\' && row[i + 1] === '|') {
      cell += '|'
      i++
    } else if (ch === '`') {
      inCode = !inCode
      cell += ch
    } else if (ch === '|' && !inCode) {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += ch
    }
  }
  cells.push(cell.trim())
  return cells
}

const isDelimiterRow = (line: string) => {
  if (!line.includes('-')) return false
  const cells = splitRow(line)
  return cells.length > 0 && cells.every(cell => DELIMITER_CELL.test(cell))
}

const alignOf = (cell: string): Align => {
  const c = cell.trim()
  if (c.startsWith(':') && c.endsWith(':')) return 'center'
  if (c.endsWith(':')) return 'right'
  return 'left'
}

/** Splits markdown into text and tables; anything inside a code fence stays text. */
export const splitTables = (text: string): Piece[] => {
  const lines = text.split('\n')
  const pieces: Piece[] = []
  let buffer: string[] = []
  let fence: string | null = null

  const flush = () => {
    const chunk = buffer.join('\n').trim()
    if (chunk) pieces.push({ kind: 'text', text: chunk })
    buffer = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const open = FENCE.exec(line)

    if (fence) {
      buffer.push(line)
      if (open && open[1]![0] === fence[0] && open[1]!.length >= fence.length && !line.trim().slice(open[1]!.length).trim()) fence = null
      continue
    }
    if (open) {
      fence = open[1]!
      buffer.push(line)
      continue
    }

    const next = lines[i + 1]
    if (line.includes('|') && next !== undefined && isDelimiterRow(next)) {
      const header = splitRow(line)
      const align = splitRow(next).map(alignOf)
      if (align.length === header.length) {
        const rows: string[][] = []
        let j = i + 2
        while (j < lines.length && lines[j]!.trim() && lines[j]!.includes('|')) {
          const cells = splitRow(lines[j]!)
          rows.push(header.map((_, k) => cells[k] ?? ''))
          j++
        }
        flush()
        pieces.push({ kind: 'table', table: { header, align, rows } })
        i = j - 1
        continue
      }
    }
    buffer.push(line)
  }

  flush()
  return pieces
}

/** Inline markdown a header cell would show as marks, gone: the header is drawn bold as it is. */
const plain = (cell: string) => cell.replace(/\*\*|__|`/g, '')

/**
 * Each column's share of the width, in whole percent summing to 100: its widest
 * cell's length, held between 6 and 60 so a short column stays legible and a long
 * one cannot squeeze the rest.
 */
export const columnShares = (table: Table): number[] => {
  const weights = table.header.map((title, k) =>
    Math.min(60, Math.max(6, plain(title).length, ...table.rows.map(row => (row[k] ?? '').length))),
  )
  const total = weights.reduce((a, b) => a + b, 0)
  const shares = weights.map(w => Math.max(1, Math.floor((w / total) * 100)))
  shares[shares.length - 1]! += 100 - shares.reduce((a, b) => a + b, 0)
  return shares
}

type TableUi = Pick<Elements['terminal'], 'Box' | 'Text' | 'Markdown'>

const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' } as const

/** A table in a round frame: the header bold in the accent, body rows striped on the surface. */
export const drawTable = ({ Box, Text, Markdown }: TableUi, theme: Theme, table: Table, key?: string) => {
  const shares = columnShares(table)

  const cell = (k: number, content: unknown) => (
    <Box key={`c${k}`} width={`${shares[k]}%`} paddingX={1} flexDirection="row" justifyContent={JUSTIFY[table.align[k] ?? 'left']}>
      {content}
    </Box>
  )

  return (
    <Box key={key} flexDirection="column" borderStyle="round" borderColor={theme.toolBar}>
      <Box flexDirection="row">
        {table.header.map((title, k) =>
          cell(
            k,
            <Text bold color={theme.accent} wrap="wrap">
              {plain(title) || ' '}
            </Text>,
          ),
        )}
      </Box>
      {table.rows.map((row, r) => (
        <Box key={`r${r}`} flexDirection="row" backgroundColor={r % 2 === 0 ? theme.surface : undefined}>
          {row.map((value, k) => cell(k, value.trim() ? <Markdown text={value} /> : <Text> </Text>))}
        </Box>
      ))}
    </Box>
  )
}
