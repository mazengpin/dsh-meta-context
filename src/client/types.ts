/**
 * The Client surfaces this half reads, declared structurally.
 *
 * The browser bundle runs inside the shell's frozen module table, so the slot
 * and locale services arrive through the factory's `require` and are typed here
 * rather than imported from the harness's client packages — the same structural
 * discipline the Host half uses, and the reason the client build's purity gate
 * has nothing to reject.
 *
 * @module dsh-meta-context/client/types
 */

/** A slot registration's metadata. `id` keys a list slot; `key` keys a keyed one. */
export interface SlotMeta {
  /** The slot name, matching the kind passed to `inject`. */
  readonly name: string
  /** This entry's own id inside a LIST slot. Never a shipped or member id. */
  readonly id?: string
  /** This entry's own key inside a KEYED slot. */
  readonly key?: string
  /** Position among the slot's entries, ascending. */
  readonly order?: number
  /** A thunk, so the shell re-reads it when the locale changes. */
  readonly label?: () => string
  /** The locale namespace this entry's label resolves against. */
  readonly locale?: string
  /** The registrant, for the shell's own attribution. */
  readonly registrant?: string
  /** Props injected into the component. */
  readonly inject?: (sessionId?: string) => Record<string, unknown>
}

/** The slot service. */
export interface SlotsFace {
  /**
   * Register into a slot this plugin's fiber owns.
   * @param meta - the entry metadata.
   * @param component - the render function.
   * @returns the registration's disposer.
   */
  readonly register: (meta: SlotMeta, component: (props: never) => unknown) => () => void
  /**
   * Register only while another package's declaration exists.
   * @param kind - the slot name to wait for.
   * @param factory - the registration body, run when the declaration appears.
   * @returns the disposer.
   */
  readonly inject: (kind: string, factory: () => () => void) => () => void
}

/** The locale service. */
export interface LocaleFace {
  /**
   * Register one dictionary.
   * @param ns - the namespace.
   * @param lang - the language tag.
   * @param dict - the key/value pairs.
   * @returns the disposer.
   */
  readonly register: (ns: string, lang: string, dict: Record<string, string>) => () => void
  /**
   * Bind a translate function to one namespace.
   * @param ns - the namespace.
   * @returns the translate function.
   */
  readonly bind: (ns: string) => (key: string) => string
}

/** The Client plugin context, narrowed to what this half reads. */
export interface ClientContext {
  /** The slot service, injected. */
  readonly slots: SlotsFace
  /** The locale service, injected. */
  readonly locale: LocaleFace
  /** The logger. */
  readonly logger: { readonly warn: (message: string) => void }
  /**
   * Run an effect whose disposer rides this plugin's fiber.
   * @param execute - the effect body; returns its disposer.
   * @param label - the effect label.
   * @returns the effect's disposer.
   */
  readonly effect: (execute: () => () => void, label?: string) => () => void
}
