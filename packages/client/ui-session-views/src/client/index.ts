/**
 * Files, Tasks and Waterfall, browser half.
 *
 * The three views are pure readers over the session snapshot, so they own no
 * service and no store: each is one entry in ui-conversation's
 * `'conversation.view'` list slot, which is additive by contract — the ring
 * already carries `chat` from ui-conversation and `trajectory` from
 * ui-trajectory, and registering here adds seats rather than replacing one.
 *
 * `slots.inject` is what orders this against the declaring plugin:
 * `dsh.client.inject` edges are loading metadata, not apply sequencing, so the
 * registrations wait on the slot declaration reaching the ledger instead of
 * assuming ui-conversation applied first. Registering into an undeclared slot
 * throws.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the 'conversation.view' SlotMap row (declared by the slot's
// owning package) must be in the program for the register calls to type. A
// value import would be rejected by the client bundle purity gate.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { en, NS, zh } from './locales.ts'
import { TasksView } from './TasksView.tsx'
import { WaterfallView } from './WaterfallView.tsx'
import { WorkspaceView } from './WorkspaceView.tsx'

export { TasksView, type TasksViewProps } from './TasksView.tsx'
export { WaterfallView, type WaterfallViewProps } from './WaterfallView.tsx'
export { WorkspaceView } from './WorkspaceView.tsx'
export { NS, type SessionViewsKey } from './locales.ts'

/** Required services: the conversation view slot and the copy registry. No host data. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the dictionaries, then the three view tabs.
 * Both rides are effects, so unloading the plugin removes the copy and the
 * tabs together instead of leaving dead ids in the ring.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-session-views: dictionaries')
  // Registration-time text (the view tab labels) reads through the bound
  // translate as a thunk, so the tabs follow the active locale without
  // re-registration; the components read the standard `t` seat that
  // `locale: NS` composes onto their props.
  const t = ctx.locale.bind(NS)

  // Orders 20/30/40 keep the ring as it shipped: chat 0, trajectory 10, then
  // these three. They are spaced so a later plugin can land between them.
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'files',
    order: 20,
    locale: NS,
    label: () => t('view.files'),
  }, WorkspaceView))

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'tasks',
    order: 30,
    locale: NS,
    label: () => t('view.tasks'),
  }, TasksView))

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'waterfall',
    order: 40,
    locale: NS,
    label: () => t('view.waterfall'),
  }, WaterfallView))
}
