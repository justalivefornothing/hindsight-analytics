// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Player } from './player'
import { createRecorder } from '../recorder/recorder'
import type { RecordedEvent } from '../recorder/types'

const tick = () => new Promise((r) => setTimeout(r, 0))

/**
 * Record a tiny scripted session with a fake clock, then drive the player
 * with injected timers and check that seeking rebuilds the correct state.
 */
async function recordSession(): Promise<RecordedEvent[]> {
  document.open()
  document.write(`<!DOCTYPE html><html><body><ul id="list"></ul><p id="label">0</p><input id="q"></body></html>`)
  document.close()
  let clock = 0
  const events: RecordedEvent[] = []
  const recorder = createRecorder({
    win: window,
    sessionId: 's',
    userId: 'u',
    now: () => clock,
    onEvents: (batch) => events.push(...batch),
    onAnalytics: () => {},
    snapshotIntervalMs: 0,
    mouseMoveIntervalMs: 0,
  })
  recorder.start()
  const list = document.getElementById('list')!
  const label = document.getElementById('label')!
  for (let i = 1; i <= 5; i++) {
    clock = i * 1000
    const li = document.createElement('li')
    li.textContent = `item ${i}`
    list.appendChild(li)
    label.textContent = String(i)
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: i * 10, clientY: 5, bubbles: true }))
    if (i === 3) {
      const input = document.getElementById('q') as HTMLInputElement
      input.value = 'abc'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      document.body.dispatchEvent(new MouseEvent('click', { clientX: 30, clientY: 5, bubbles: true }))
    }
    await tick() // let the MutationObserver deliver with the current clock
  }
  clock = 6000
  recorder.stop()
  return events
}

describe('Player', () => {
  it('rebuilds at a seek time and fast-forwards the mutation stream', async () => {
    const events = await recordSession()
    const mutationTimes = events.filter((e) => e.type === 'mutation').map((e) => e.t)
    expect(mutationTimes).toEqual([1000, 2000, 3000, 4000, 5000])

    const target = document.implementation.createHTMLDocument('')
    const frames: number[] = []
    const player = new Player({
      getDocument: () => target,
      events,
      now: () => 0,
      raf: () => 0,
      caf: () => {},
      onFrame: (f) => frames.push(f.t),
    })
    expect(player.duration).toBe(5000)

    player.seek(3000)
    expect(target.querySelectorAll('li')).toHaveLength(3)
    expect(target.getElementById('label')!.textContent).toBe('3')
    expect((target.getElementById('q') as HTMLInputElement).value).toBe('abc')

    // Forward seek applies incrementally.
    player.seek(5000)
    expect(target.querySelectorAll('li')).toHaveLength(5)

    // Backward seek triggers a rebuild from the snapshot.
    player.seek(1000)
    expect(target.querySelectorAll('li')).toHaveLength(1)
    expect(target.getElementById('label')!.textContent).toBe('1')
    expect((target.getElementById('q') as HTMLInputElement).value).toBe('')
    expect(frames.at(-1)).toBe(1000)

    // Sanitised replay document stays inert.
    expect(target.querySelector('style[data-hs-replayer]')).not.toBeNull()
  })

  it('advances on a virtual clock scaled by speed and reports the cursor', async () => {
    const events = await recordSession()
    const target = document.implementation.createHTMLDocument('')
    let clock = 0
    let scheduled: ((t: number) => void) | null = null
    const clicks: Array<[number, number]> = []
    let lastCursor = { x: -1, y: -1 }
    const player = new Player({
      getDocument: () => target,
      events,
      speed: 2,
      skipInactivity: false,
      now: () => clock,
      raf: (cb) => {
        scheduled = cb
        return 1
      },
      caf: () => {
        scheduled = null
      },
      onClick: (x, y) => clicks.push([x, y]),
      onFrame: (f) => {
        lastCursor = { x: f.cursor.x, y: f.cursor.y }
      },
    })
    player.play()
    expect(player.isPlaying).toBe(true)
    // 1000ms of wall time at 2x = 2000ms of session time
    clock = 1000
    scheduled!(clock)
    expect(player.time).toBe(2000)
    expect(target.querySelectorAll('li')).toHaveLength(2)
    expect(lastCursor).toEqual({ x: 20, y: 5 })
    clock = 1600
    scheduled!(clock)
    expect(player.time).toBe(3200)
    expect(clicks).toEqual([[30, 5]])
    player.pause()
    expect(player.isPlaying).toBe(false)
    expect(scheduled).toBeNull()
  })
})
