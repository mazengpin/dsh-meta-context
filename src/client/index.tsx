/**
 * Client half of dsh-meta-context.
 *
 * TWO registrations, and the count is the deliverable.
 *
 * The owner's complaint is that the left sidebar carries several entries doing
 * the same work. The members keep their own seats — D-0352 rule (3) forbids
 * unregistering them while the fusion is unproven — but the family gains ONE
 * entry that fronts all of them:
 *
 *  1. this plugin's dictionaries in the shared locale service;
 *  2. ONE `sidebar.panellist` row, id `dsh-meta-context`, order 12;
 *  3. ONE keyed `main` panel, key `dsh-meta-context`.
 *
 * THE IDS AND THE KIND ARE THE ACCEPTANCE CONDITION, NOT A DETAIL
 *
 * Both ids are this plugin's own and match no member's: `dsh-context` owns the
 * sidebar id `dsh-context` and the main key `dsh-context`
 * (`dsh-context/src/client/insightPage.ts:15-18,36,40`), so reusing either would
 * either throw at load or silently replace the member's row. Nothing here
 * registers a `conversation.view` entry and nothing here passes a `priority` of
 * `builtin`: an extension-band contributor that takes a builtin kind can hide the
 * workbench, and this plugin has no business owning a conversation band. The
 * verify harness asserts both facts against the BUILT bundle, so neither can
 * regress silently.
 *
 * The seats go through `ctx.slots.inject` because `main` and `sidebar.panellist`
 * are declared by other packages: injecting waits for the real declaration
 * instead of racing it, disappears when it collapses, and is reinstalled if it
 * returns. A bare `slots.register` into an undeclared slot would throw at load.
 *
 * @module dsh-meta-context/client
 */

import { createElement as h, type ReactElement } from 'react'
import { MetaContextPage } from './MetaContextPage.tsx'
import { LOCALE_NS, en, zh } from './locales.ts'
import { PANEL_ID, SIDEBAR_ID, SIDEBAR_ORDER } from '../shared/protocol.ts'
import type { ClientContext } from './types.ts'

/** Loader row name; the Client bundle registers itself under this same id. */
export const name = 'dsh-meta-context'

/** The two Client services this half reads. */
export const inject = ['slots', 'locale']

/** The list slot the sidebar row goes into. */
const SIDEBAR_SLOT = 'sidebar.panellist'

/** The keyed slot the page goes into. */
const PANEL_SLOT = 'main'

/**
 * The sidebar row glyph: a bracket wrapping three stacked bars, which reads as
 * "one surface over several members". Sized from the slot's own prop when the
 * shell supplies one, so the row matches its neighbours.
 */
function MetaContextIcon(props: { readonly size?: number }): ReactElement {
  const size = typeof props.size === 'number' ? props.size : 16
  return h(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      'aria-hidden': true,
    },
    h('path', { d: 'M5.5 2.5H4a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 4 13.5h1.5' }),
    h('path', { d: 'M10.5 2.5H12A1.5 1.5 0 0 1 13.5 4v8a1.5 1.5 0 0 1-1.5 1.5h-1.5' }),
    h('path', { d: 'M7 5.5h2M7 8h2M7 10.5h2' }),
  )
}

/**
 * Register the dictionaries, the sidebar row and the page.
 * @param ctx - the Client plugin context (slots, locale, effect, logger).
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const offZh = ctx.locale.register(LOCALE_NS, 'zh', zh)
    const offEn = ctx.locale.register(LOCALE_NS, 'en', en)
    return () => {
      offZh()
      offEn()
    }
  }, 'dsh-meta-context: dictionaries')

  const t = ctx.locale.bind(LOCALE_NS)

  ctx.slots.inject(PANEL_SLOT, () => ctx.slots.register(
    { name: PANEL_SLOT, key: PANEL_ID, locale: LOCALE_NS, registrant: 'dsh-meta-context' },
    MetaContextPage as unknown as (props: never) => unknown,
  ))

  ctx.slots.inject(SIDEBAR_SLOT, () => ctx.slots.register(
    {
      name: SIDEBAR_SLOT,
      id: SIDEBAR_ID,
      order: SIDEBAR_ORDER,
      label: () => t('nav'),
      locale: LOCALE_NS,
      registrant: 'dsh-meta-context',
    },
    // The owner share is the icon's size; the registry widens the component to
    // the generic slot props, which is why the props are narrowed here.
    (props: unknown) => h(MetaContextIcon, {
      size: typeof (props as { size?: unknown }).size === 'number' ? (props as { size: number }).size : undefined,
    }),
  ))
}
