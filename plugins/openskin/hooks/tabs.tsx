import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface } from 'claude-code'
import type { PanelTab } from '../types'

/**
 * The status panel's tabs: Panel (the cards), Git (the repository at a glance) and Summary (the
 * session summary). The tab shown is kept in `$.state`, so a press or `/panel <tab>` redraws the
 * panel. A tab's letter presses it while the panel holds the keys (ctrl+x tab, or a click), the
 * engine's rule for a Button's `hotkey`.
 */
export const TABS: readonly { id: PanelTab; label: string; hotkey: string }[] = [
  { id: 'panel', label: 'Panel', hotkey: 'p' },
  { id: 'git', label: 'Git', hotkey: 'g' },
  { id: 'summary', label: 'Summary', hotkey: 's' },
]

const shown = atom({ plugin: 'openskin', key: 'tab' } as const, 'panel' as PanelTab)

/** The tab `/panel` names (any case, spaces around ignored), null for none of them. */
export const tabNamed = (name: string): PanelTab | null => {
  const wanted = name.trim().toLowerCase()

  return TABS.find(tab => tab.id === wanted)?.id ?? null
}

/** The tab the panel shows. */
export async function shownTab($: EngineInterface): Promise<PanelTab> {
  return read($, shown)
}

/** Shows `tab`; the panel redraws. */
export async function showTab($: EngineInterface, tab: PanelTab): Promise<void> {
  await update($, shown, () => tab)
}

export type TabBarUi = Pick<Elements['terminal'], 'Box' | 'Button'>

/**
 * The tab bar: one plain Button per tab (`p: Panel`), the shown one at full strength, the rest dim.
 * `onShow` runs once a pressed tab is shown.
 */
export function drawTabBar({ Box, Button }: TabBarUi, $: EngineInterface, current: PanelTab, onShow: (tab: PanelTab) => Promise<void>) {
  return (
    <Box flexDirection="row" gap={2} paddingX={1}>
      {TABS.map(tab => (
        <Button
          key={`tab:${tab.id}`}
          hotkey={tab.hotkey}
          plain
          dimColor={tab.id !== current}
          onPress={async () => {
            await showTab($, tab.id)
            await onShow(tab.id)
          }}
        >
          {tab.label}
        </Button>
      ))}
    </Box>
  )
}
