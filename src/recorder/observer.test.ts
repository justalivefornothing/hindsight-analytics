// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Mirror } from './mirror'
import { MutationCollector } from './observer'
import { serializeDocument } from './snapshot'
import type { MutationEvent } from './types'
import { ReplayMirror, rebuildDocument } from '../replayer/rebuild'
import { applyMutation } from '../replayer/apply'

const PAGE = `<!DOCTYPE html><html><head><title>Live</title></head><body><div id="app"><ul id="list"><li id="a">A</li><li id="b">B</li><li id="c">C</li></ul><p id="status" class="idle">waiting</p><div id="masked" data-mask=""><span id="secret">4111</span></div></div></body></html>`

function setup() {
  document.open()
  document.write(PAGE)
  document.close()
  const doc = document
  const mirror = new Mirror()
  const log: MutationEvent[] = []
  const collector = new MutationCollector(doc, mirror, (m) => log.push({ ...m, t: log.length }))
  const snapshot = serializeDocument(doc, mirror)
  collector.start()

  const target = document.implementation.createHTMLDocument('')
  const replayMirror = new ReplayMirror()
  rebuildDocument(snapshot, target, replayMirror, { sanitize: false })

  const sync = () => {
    collector.flush()
    for (const m of log.splice(0)) applyMutation(m, target, replayMirror, { sanitize: false })
  }
  // The masked span is (correctly) bullets on the replay side; normalise it
  // so the rest of the markup can be compared byte for byte.
  const norm = (html: string) => html.replace(/<span id="secret">[^<]*<\/span>/, '<span id="secret">#</span>')
  const same = () => {
    expect(norm(target.documentElement.outerHTML)).toBe(norm(doc.documentElement.outerHTML))
  }
  return { doc, target, collector, sync, same, log, mirror, replayMirror }
}

describe('mutation log applied to a rebuilt DOM', () => {
  it('replays childList adds/removes, attribute changes and characterData edits', () => {
    const { doc, sync, same, collector } = setup()
    same()

    // childList add (nested subtree in one tick)
    const li = doc.createElement('li')
    li.id = 'd'
    li.innerHTML = '<strong>D</strong> <em>new</em>'
    doc.getElementById('list')!.appendChild(li)
    sync()
    same()

    // childList remove
    doc.getElementById('b')!.remove()
    sync()
    same()

    // attribute set / change / remove
    const status = doc.getElementById('status')!
    status.setAttribute('class', 'busy')
    status.setAttribute('aria-live', 'polite')
    sync()
    same()
    status.removeAttribute('class')
    sync()
    same()

    // characterData
    const text = status.firstChild as Text
    text.data = 'done'
    sync()
    same()

    // textContent replacement (remove + add text node)
    status.textContent = 'finished'
    sync()
    same()

    collector.stop()
  })

  it('handles insertion between siblings, reorders and moves across parents', () => {
    const { doc, sync, same, collector } = setup()
    const list = doc.getElementById('list')!
    const a = doc.getElementById('a')!
    const c = doc.getElementById('c')!

    // insert before an existing sibling
    const x = doc.createElement('li')
    x.textContent = 'X'
    list.insertBefore(x, c)
    sync()
    same()

    // reorder existing node (React style: insertBefore of an attached node)
    list.insertBefore(c, a)
    sync()
    same()

    // move a node to a different parent
    doc.getElementById('status')!.appendChild(a)
    sync()
    same()

    // add several siblings in one tick, in mixed order
    const frag = doc.createDocumentFragment()
    for (const label of ['1', '2', '3']) {
      const li = doc.createElement('li')
      li.textContent = label
      frag.appendChild(li)
    }
    list.insertBefore(frag, list.firstChild)
    const tail = doc.createElement('li')
    tail.textContent = 'tail'
    list.appendChild(tail)
    sync()
    same()

    collector.stop()
  })

  it('ignores nodes that are added and removed within the same tick', () => {
    const { doc, sync, same, collector, log } = setup()
    const tmp = doc.createElement('div')
    tmp.textContent = 'transient'
    doc.body.appendChild(tmp)
    tmp.remove()
    collector.flush()
    expect(log).toHaveLength(0)
    sync()
    same()
    collector.stop()
  })

  it('masks characterData and added text inside [data-mask] elements', () => {
    const { doc, sync, target, collector } = setup()
    const secret = doc.getElementById('secret')!
    ;(secret.firstChild as Text).data = '4242 4242'
    sync()
    expect(target.getElementById('secret')!.textContent).toBe('•••• ••••')

    const extra = doc.createElement('span')
    extra.textContent = 'cvv 123'
    doc.getElementById('masked')!.appendChild(extra)
    sync()
    expect(target.getElementById('masked')!.lastElementChild!.textContent).toBe('••• •••')
    collector.stop()
  })

  it('delivers records asynchronously through the real observer callback', async () => {
    const { doc, target, collector, log, replayMirror } = setup()
    doc.getElementById('status')!.setAttribute('class', 'async')
    await new Promise((r) => setTimeout(r, 0))
    expect(log).toHaveLength(1)
    applyMutation(log[0], target, replayMirror, { sanitize: false })
    expect(target.getElementById('status')!.className).toBe('async')
    collector.stop()
  })
})
