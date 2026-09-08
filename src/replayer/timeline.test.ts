import { describe, expect, it } from 'vitest'
import {
  findInactivity,
  firstIndexAfter,
  formatClock,
  inactiveTotal,
  lastSnapshotIndex,
  skipInactive,
  snapshotIndices,
  sortEvents,
  totalDuration,
} from './timeline'
import type { RecordedEvent, SDocument } from '../recorder/types'

const doc: SDocument = { t: 0, id: 1, ch: [] }

function snapshot(t: number): RecordedEvent {
  return { type: 'snapshot', t, node: doc, sx: 0, sy: 0 }
}
function move(t: number): RecordedEvent {
  return { type: 'move', t, x: 0, y: 0 }
}

describe('timeline helpers', () => {
  const events: RecordedEvent[] = [
    { type: 'meta', t: 0, href: 'x', w: 1, h: 1 },
    snapshot(0),
    move(100),
    move(200),
    move(9000), // gap 200 -> 9000 is inactive
    snapshot(9500),
    move(9600),
    move(30_000), // gap 9600 -> 30000 is inactive
  ]

  it('sorts stably by time', () => {
    const shuffled = [events[3], events[1], events[0], events[2]]
    expect(sortEvents(shuffled).map((e) => e.t)).toEqual([0, 0, 100, 200])
    expect(sortEvents(shuffled)[0].type).toBe('snapshot')
  })

  it('computes duration and inactivity segments', () => {
    expect(totalDuration(events)).toBe(30_000)
    const segments = findInactivity(events, 4000)
    expect(segments).toEqual([
      { start: 200, end: 9000 },
      { start: 9600, end: 30_000 },
    ])
    expect(inactiveTotal(segments)).toBe(8800 + 20_400)
    expect(skipInactive(5000, segments)).toBe(9000 - 250)
    expect(skipInactive(150, segments)).toBe(150)
  })

  it('binary-searches the last snapshot at or before a time', () => {
    const snaps = snapshotIndices(events)
    expect(snaps).toEqual([1, 5])
    expect(lastSnapshotIndex(events, snaps, 0)).toBe(1)
    expect(lastSnapshotIndex(events, snaps, 5000)).toBe(1)
    expect(lastSnapshotIndex(events, snaps, 9500)).toBe(5)
    expect(lastSnapshotIndex(events, snaps, 40_000)).toBe(5)
    expect(lastSnapshotIndex(events, snaps, -1)).toBe(-1)
  })

  it('finds the first index strictly after a time', () => {
    expect(firstIndexAfter(events, -1)).toBe(0)
    expect(firstIndexAfter(events, 0)).toBe(2)
    expect(firstIndexAfter(events, 200)).toBe(4)
    expect(firstIndexAfter(events, 30_000)).toBe(events.length)
  })

  it('formats clock times', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(61_500)).toBe('1:01')
    expect(formatClock(600_000)).toBe('10:00')
  })
})
