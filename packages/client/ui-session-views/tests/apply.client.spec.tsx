// @vitest-environment jsdom
// apply wiring: the three views land in the `conversation.view` ring declared
// by ANOTHER package, keep the tab order the ring shipped with, and collapse
// with the plugin fiber. The registrations ride `slots.inject`, so this spec
// also pins the ordering contract: mounting the plugin before the slot is
// declared must still end with three entries.

import { describe, expect, it } from 'vitest'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'

/**
 * Mount the plugin over a test root that declares the ring ui-conversation
 * owns in production.
 * @param declareFirst - whether the ring exists before the plugin applies.
 * @returns the runtime, the plugin fiber, and the slot ledger.
 */
async function bench(declareFirst = true) {
  const runtime = await SlotTestRuntime.create()
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.provide('locale', locale)
  runtime.slots.installLocale(locale)
  const declare = async () => {
    await runtime.root.declare(
      { 'conversation.view': { kind: 'list', scope: 'session' } },
      (_p: { renderSlot?: unknown }) => null,
    )
  }
  if (declareFirst) await declare()
  const feature = await runtime.mount({ inject: [...inject], apply })
  if (!declareFirst) await declare()
  return { runtime, feature, slots: runtime.slots }
}

describe('apply wiring', () => {
  it('registers the three views in the order the ring shipped with', async () => {
    const b = await bench()
    const entries = b.slots.entries('conversation.view')
    expect(entries.map(entry => entry.options.id)).toEqual(['files', 'tasks', 'waterfall'])
    expect(entries.map(entry => entry.options.order)).toEqual([20, 30, 40])
    await b.runtime.dispose()
  })

  it('labels resolve through this package own dictionary, not ui-conversation own', async () => {
    const b = await bench()
    // The browser default is English in the test DOM; the tab labels come from
    // the `sessionViews` namespace this package registers, which is the whole
    // point of the split — ui-conversation no longer carries these strings.
    const labels = b.slots.entries('conversation.view').map(entry => resolveSlotLabel(entry.options.label))
    expect(labels).toEqual(['Files', 'Tasks', 'Waterfall'])
    await b.runtime.dispose()
  })

  it('waits for the ring declaration instead of assuming ui-conversation applied first', async () => {
    const b = await bench(false)
    expect(b.slots.entries('conversation.view').map(entry => entry.options.id))
      .toEqual(['files', 'tasks', 'waterfall'])
    await b.runtime.dispose()
  })

  it('plugin fiber disposal collects every registration', async () => {
    const b = await bench()
    await b.feature.dispose()
    expect(b.slots.entries('conversation.view')).toHaveLength(0)
    await b.runtime.dispose()
  })
})
