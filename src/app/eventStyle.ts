import type { ChipTone } from './components/ui'

/**
 * Colour follows the entity: every event *kind* has a fixed slot so a filter
 * never repaints the survivors. Autocaptured kinds get the first slots, all
 * custom business events share slot 2 (the warm accent), and rage clicks use
 * the reserved "bad" status colour with an icon in the UI.
 */
export type EventKind = 'pageview' | 'click' | 'input' | 'rageclick' | 'custom'

export function eventKind(name: string): EventKind {
  switch (name) {
    case '$pageview':
      return 'pageview'
    case '$click':
      return 'click'
    case '$input':
      return 'input'
    case '$rageclick':
      return 'rageclick'
    default:
      return 'custom'
  }
}

export function eventColor(name: string): string {
  switch (eventKind(name)) {
    case 'pageview':
      return 'var(--series-1)'
    case 'click':
      return 'var(--series-3)'
    case 'input':
      return 'var(--series-4)'
    case 'rageclick':
      return 'var(--bad)'
    default:
      return 'var(--series-2)'
  }
}

export function eventTone(name: string): ChipTone {
  switch (eventKind(name)) {
    case 'pageview':
      return 'series-1'
    case 'click':
      return 'series-3'
    case 'input':
      return 'series-4'
    case 'rageclick':
      return 'bad'
    default:
      return 'series-2'
  }
}

export const EVENT_LEGEND: Array<{ kind: EventKind; label: string; color: string }> = [
  { kind: 'pageview', label: 'Pageview', color: 'var(--series-1)' },
  { kind: 'click', label: 'Click', color: 'var(--series-3)' },
  { kind: 'input', label: 'Input', color: 'var(--series-4)' },
  { kind: 'custom', label: 'Custom event', color: 'var(--series-2)' },
  { kind: 'rageclick', label: 'Rage click', color: 'var(--bad)' },
]

export function prettyEventName(name: string): string {
  if (name.startsWith('$')) return name
  return name.replace(/_/g, ' ')
}
