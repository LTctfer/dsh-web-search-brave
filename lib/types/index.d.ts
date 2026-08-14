/**
 * Brave Search API-backed web search provider for the harness web capability
 * seam (`ctx.web`). Calls the official Brave Search REST endpoint with an
 * `X-Subscription-Token` header and maps `web.results[]` into the seam's
 * normalized `WebSearchSource` shape. One search is one HTTP request — no
 * model turn.
 * @module @deepseek-ai/dsh-web-search-brave
 */
import type { Context } from '@deepseek-ai/cordis';
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web';
import z from '@deepseek-ai/schemastery';
export declare const name = "web-search-brave";
export declare const inject: string[];
/** Stable id this provider registers under. */
export declare const BRAVE_PROVIDER_ID = "brave-official";
export declare const BRAVE_DEFAULT_BASE_URL = "https://api.search.brave.com/res/v1/web/search";
export declare const BRAVE_DEFAULT_COUNT = 10;
export declare const BRAVE_MAX_COUNT = 20;
/** Order of the announcement section within the tool-guidance band. */
export declare const ANNOUNCEMENT_ORDER = 150;
/** Model-facing announcement: provider presence, key resolution, and user guidance. */
export declare const BRAVE_GUIDANCE: string;
/** Settings namespace carrying this provider's token reference and request options. */
export declare const WEB_SEARCH_BRAVE_SETTINGS_NAMESPACE: import('@deepseek-ai/dsh-settings').SettingsNamespace<typeof Config>;
/**
 * Config for the Brave search provider. All fields are optional; `apiKeyEnv`
 * defaults to `BRAVE_API_KEY`. The key resolves in order: literal `apiKey`
 * (settings section), the `apiKeyEnv` environment variable (launch
 * environment, then process environment), then the credentials service.
 * `proxy` falls back to `HTTPS_PROXY` / `HTTP_PROXY` from the launch
 * environment.
 */
export declare const Config: z<{
    apiKey?: string;
    apiKeyEnv?: string;
    baseURL?: string;
    count?: number;
    country?: string;
    searchLang?: string;
    freshness?: string;
    proxy?: string;
    announceToAgent?: boolean;
    enabled?: boolean;
}>;
/**
 * The Brave Search API-backed provider. Implements {@link WebSearchProvider};
 * `search()` honors the caller's abort signal and maps HTTP failures to
 * {@link WebError}.
 */
export declare class BraveSearchProvider implements WebSearchProvider {
    readonly id: string;
    private resolveOptions;
    constructor(resolveOptions: () => BraveSearchOptions);
    available(): boolean;
    search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
    private apiKey;
}
/** Internal per-operation options; not part of the public config surface. */
export interface BraveSearchOptions {
    readonly apiKey?: string;
    readonly resolveApiKey?: () => Promise<string | undefined>;
    readonly apiKeyEnv?: string;
    readonly baseURL: string;
    readonly count: number;
    readonly country?: string;
    readonly searchLang?: string;
    readonly freshness?: string;
    readonly proxy?: string;
    readonly recordRequest?: (request: {
        readonly endpoint: string;
    }) => void;
}
export declare function apply(ctx: Context, config: z.infer<typeof Config>): void;
