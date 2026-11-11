import { expect, test } from 'claude-code/testing'
import { columnShares, splitRow, splitTables } from '../hooks/tables'

const TABLE = [
  'Here is how it ended up:',
  '',
  '| Request | Result |',
  '|---|:--:|',
  '| Two servers | Server0 (192.168.50.2) and `a\\|b` |',
  '| DNS, DHCP and mail | **Server0:** DHCP and DNS |',
  '',
  'Done.',
].join('\n')

test('a table splits out of the text, cells parsed with escaped pipes and code spans', async () => {
  const pieces = splitTables(TABLE)
  expect(pieces.map(p => p.kind)).toEqual(['text', 'table', 'text'])
  const table = pieces[1]!.kind === 'table' ? pieces[1]!.table : null
  expect(table?.header).toEqual(['Request', 'Result'])
  expect(table?.align).toEqual(['left', 'center'])
  expect(table?.rows[0]).toEqual(['Two servers', 'Server0 (192.168.50.2) and `a|b`'])
  expect(splitRow('| `x | y` | z |')).toEqual(['`x | y`', 'z'])
  expect(columnShares(table!).reduce((a, b) => a + b, 0)).toBe(100)
})

test('a table inside a code fence stays text', async () => {
  const text = '```md\n| a | b |\n|---|---|\n| 1 | 2 |\n```'
  expect(splitTables(text)).toEqual([{ kind: 'text', text }])
})

// The engine sizes a table to the terminal, not to the reply band's padded box, so the
// mod draws it itself: one Box per cell with a percentage width that fits the band.
test('a reply with a table draws it as percentage columns, not one engine Markdown', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'openskin',
      surface,
      component: 'AssistantMessage',
      requestId: 'msg-t',
      props: { text: TABLE, isFirstOfReply: true },
    })
    const markdowns = await ui.findAll({ type: 'Markdown' })
    expect(markdowns.some(m => m.text.includes('|---'))).toBe(false)
    expect((await ui.find({ type: 'Text', text: 'Request' }))?.props.bold).toBe(true)
    const boxes = await ui.findAll({ type: 'Box' })
    expect(boxes.filter(b => typeof b.props.width === 'string' && String(b.props.width).endsWith('%')).length).toBe(6)
    expect((await ui.find({ type: 'Markdown', text: /Done/ }))?.text).toBe('Done.')
  }
})
