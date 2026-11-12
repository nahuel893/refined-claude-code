import { expect, test } from 'claude-code/testing'
import { BOARD, pane, press, startSession, SUMMARY, texts, typed, world } from './world'

const SUMMARY_TEXT = 'The goal was a parser for the config files.\n\nIt is written and tested; the docs come next.\n'

test('the panel opens on a tab bar of three plain Buttons, Panel shown, each with its letter', async ($, on) => {
  const { clock } = world(on)
  await startSession($, clock)

  const ui = await $.ui.mount(pane())
  const buttons = (await ui.findAll({ type: 'Button' })).filter(button => String(button.props.key).startsWith('tab:'))
  expect(buttons.map(button => button.props.key)).toEqual(['tab:panel', 'tab:git', 'tab:summary'])
  expect(buttons.map(button => button.props.label)).toEqual(['Panel', 'Git', 'Summary'])
  expect(buttons.map(button => button.props.hotkey)).toEqual(['p', 'g', 's'])
  expect(buttons.every(button => button.props.plain === true)).toBe(true)
  // The shown tab at full strength, the others dim.
  expect(buttons.map(button => button.props.dimColor === true)).toEqual([false, true, true])
  await ui.unmount()
})

test('the tab bar starts with a square, empty while the panel lacks the keys and filled once it holds them', async ($, on) => {
  const { clock } = world(on)
  await startSession($, clock)

  const idle = await $.ui.mount(pane(30, false))
  const idleTexts = (await idle.findAll({ type: 'Text' })).map(text => text.text ?? '')
  expect(idleTexts).toContain('□')
  expect(idleTexts).not.toContain('■')
  await idle.unmount()

  const focused = await $.ui.mount(pane(30, true))
  const focusedTexts = (await focused.findAll({ type: 'Text' })).map(text => text.text ?? '')
  expect(focusedTexts).toContain('■')
  expect(focusedTexts).not.toContain('□')
  await focused.unmount()
})

test('the Panel tab keeps the Status card and the board, and no longer holds the summary', async ($, on) => {
  const { clock, write } = world(on)
  write(BOARD, '○ Add tests\n')
  write(SUMMARY, SUMMARY_TEXT)
  await startSession($, clock)

  const all = await texts($)
  expect(all).toContain('✿ Status')
  expect(all).toContain('≡ Board · 0 of 1')
  expect(all).toContain('Add tests')
  expect(all).not.toContain('¶ Summary')
  expect(all.some(text => text.startsWith('The goal was a parser'))).toBe(false)
})

test('the Summary tab shows the whole summary, every paragraph wrapped, and nothing of the Panel tab', async ($, on) => {
  const { clock, write } = world(on)
  write(BOARD, '○ Add tests\n')
  write(SUMMARY, SUMMARY_TEXT)
  await startSession($, clock)

  await press($, 'tab:summary')
  const ui = await $.ui.mount(pane())
  const all = (await ui.findAll({ type: 'Text' })).map(text => text.text ?? '')
  expect(all).toContain('¶ Summary')
  // The outer Text of each row wraps; its span inside holds the text alone.
  const first = (await ui.findAll({ type: 'Text', text: /^The goal was a parser for the config files\.$/ }))[0]
  const second = (await ui.findAll({ type: 'Text', text: /^It is written and tested; the docs come next\.$/ }))[0]
  expect(first?.props.wrap).toBe('wrap')
  expect(second?.props.wrap).toBe('wrap')
  expect(all).not.toContain('✿ Status')
  expect(all).not.toContain('Add tests')
  const buttons = (await ui.findAll({ type: 'Button' })).filter(button => String(button.props.key).startsWith('tab:'))
  expect(buttons.map(button => button.props.dimColor === true)).toEqual([true, true, false])
  await ui.unmount()
})

test('with no summary file the Summary tab says so in one dim line', async ($, on) => {
  const { clock } = world(on)
  await startSession($, clock)

  await press($, 'tab:summary')
  const ui = await $.ui.mount(pane())
  const line = await ui.find({ type: 'Text', text: /^No summary yet/ })
  expect(line?.text).toBe('No summary yet: /summ writes one.')
  expect(line?.props.dimColor).toBe(true)
  expect((await ui.findAll({ type: 'Text' })).map(text => text.text)).not.toContain('¶ Summary')
  await ui.unmount()
})

test('pressing a tab shows it, and Panel brings the cards back', async ($, on) => {
  const { clock } = world(on)
  await startSession($, clock)

  await press($, 'tab:git')
  expect(await texts($)).not.toContain('✿ Status')
  await press($, 'tab:panel')
  expect(await texts($)).toContain('✿ Status')
})

test('/panel with no tab opens the panel as before: at once, without asking for the keys, on the tab shown', async ($, on) => {
  const { clock, opened, closed } = world(on)
  await startSession($, clock)

  const { text } = await $.command.run(typed(''))
  expect(text).toBe('Status panel opened.')
  expect(opened).toEqual([{ id: 'openskin-status', title: 'Status' }])
  await clock.advance(100)
  expect(opened).toHaveLength(1)
  expect(closed).toEqual([])
  expect(await texts($)).toContain('✿ Status')
})

test('/panel <tab> shows that tab and opens the panel with the keys once the command has returned', async ($, on) => {
  const { clock, opened } = world(on)
  await startSession($, clock)

  const { text } = await $.command.run(typed(' Summary '))
  expect(text).toBe('Status panel opened on Summary: p, g and s switch tabs while it has the keys.')
  // Focus asked inside the command is refused (the composer is busy): the open comes after.
  expect(opened).toEqual([])
  await clock.advance(100)
  expect(opened).toEqual([{ id: 'openskin-status', title: 'Status', focus: true }])
  expect(await texts($)).toContain('No summary yet: /summ writes one.')
})

test('/panel <tab> while the panel is open closes it first, so the new opening gets the keys', async ($, on) => {
  const { clock, opened, closed } = world(on)
  await startSession($, clock)
  await $.command.run(typed(''))

  await $.command.run(typed('git'))
  await clock.advance(100)
  expect(closed).toEqual(['openskin-status'])
  expect(opened.at(-1)).toEqual({ id: 'openskin-status', title: 'Status', focus: true })
  expect(await texts($)).not.toContain('✿ Status')
})

test('/panel with an unknown tab names the tabs and opens nothing', async ($, on) => {
  const { clock, opened } = world(on)
  await startSession($, clock)

  const { text } = await $.command.run(typed('logs'))
  expect(text).toBe('No tab "logs": /panel opens the panel, /panel panel, /panel git or /panel summary opens it on that tab.')
  await clock.advance(100)
  expect(opened).toEqual([])
  expect(await texts($)).toContain('✿ Status')
})
