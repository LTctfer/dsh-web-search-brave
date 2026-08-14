/** dsh-web-search-brave — browser half types (hand-built bundle, no build step). */

/** Client plugin contract: needs the slots registry; settingsScope is resolved lazily. */
export declare const inject: string[]
export declare function apply(ctx: {
  get(name: string): unknown
  slots: {
    inject(name: string, thunk: () => Generator<unknown>): void
    register(options: unknown, component: unknown): unknown
  }
}): void
