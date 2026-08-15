import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { WebError } from "@deepseek-ai/dsh-web";
import { ProxyAgent } from "undici";
import { makeSettingsRoute } from "./routes.js";

export { SETTINGS_API } from "./routes.js";

/**
 * Brave Search API-backed web search provider for the harness web capability
 * seam (`ctx.web`). Calls the official Brave Search REST endpoint
 * (`GET https://api.search.brave.com/res/v1/web/search`) with an
 * `X-Subscription-Token` header and maps `web.results[]` into the seam's
 * normalized `WebSearchSource` shape. Unlike the DeepSeek provider this is a
 * pure retrieval endpoint — one search is one HTTP request, no model turn.
 *
 * The subscription token resolves per operation, in order:
 *   1. literal `apiKey` from the `web-search-brave` settings section
 *      (secret role; the settings page is the easiest place for a new user
 *      to paste their own Brave key);
 *   2. the environment variable named by `apiKeyEnv` (default
 *      `BRAVE_API_KEY`), read from the launch environment first and the raw
 *      process environment second;
 *   3. the DSH credentials service (e.g. the profile's `.credentials.yaml`).
 * @module @deepseek-ai/dsh-web-search-brave/provider
 */

/** Stable id this provider registers under. */
const BRAVE_PROVIDER_ID = "brave-official";
/** Default endpoint: Brave Search API web results. */
const BRAVE_DEFAULT_BASE_URL = "https://api.search.brave.com/res/v1/web/search";
/** Default result count requested from the API per search (API cap is 20). */
const BRAVE_DEFAULT_COUNT = 10;
/** Maximum `count` the Brave Search API accepts for web results. */
const BRAVE_MAX_COUNT = 20;
/** Attribution header sent on every request. */
const USER_AGENT = "deepseek-harness/0.1.0";

/**
 * Map a Brave Search API response to a normalized search result. Walks
 * `web.results[]`, joins `description` / first `extra_snippets` entry as the
 * snippet, and dedupes by `url` (the API can echo a URL across result sets).
 * The web service owns the final `maxResults` truncation, so `truncated` is
 * always `false` here.
 *
 * @param body - the parsed Brave Search API response body.
 * @returns the normalized result with deduped sources.
 * @throws {@link WebError} when the response carries no usable result list.
 */
function mapBraveResponse(body) {
	const results = body?.web?.results;
	if (!Array.isArray(results)) {
		throw new WebError("Brave returned no web.results array; the response body is not a Brave Search API web response", "WEB_PROVIDER_ERROR");
	}
	const seen = /* @__PURE__ */ new Set();
	const sources = [];
	for (const item of results) {
		if (item == null || typeof item.url !== "string" || item.url.length === 0 || seen.has(item.url)) continue;
		seen.add(item.url);
		const snippet = typeof item.description === "string" && item.description.length > 0
			? item.description
			: Array.isArray(item.extra_snippets) && typeof item.extra_snippets[0] === "string" && item.extra_snippets[0].length > 0
				? item.extra_snippets[0]
				: void 0;
		sources.push({
			url: item.url,
			...typeof item.title === "string" && item.title.length > 0 ? { title: item.title } : {},
			...snippet !== void 0 ? { snippet } : {},
			...typeof item.page_age === "string" && item.page_age.length > 0 ? { publishedAt: item.page_age } : {}
		});
	}
	return {
		sources,
		truncated: false
	};
}

/** The Brave Search API-backed search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
var BraveSearchProvider = class {
	resolveOptions;
	cachedProxy;
	cachedDispatcher;
	id = BRAVE_PROVIDER_ID;
	/**
	 * @param resolveOptions - the options for the NEXT operation, snapshotted
	 * once at each operation's entry so one search never mixes two sections.
	 * A thunk rather than a value because the plugin's settings section can
	 * change between searches without re-registering the provider.
	 */
	constructor(resolveOptions) {
		this.resolveOptions = resolveOptions;
	}
	available() {
		const options = this.resolveOptions();
		return ((options.apiKey?.length ?? 0) > 0 || options.resolveApiKey !== void 0)
			&& URL.canParse(options.baseURL)
			&& isPositiveInteger(options.count);
	}
	async search(request, signal) {
		const options = this.resolveOptions();
		const apiKey = await this.apiKey(options, signal);
		throwIfSearchAborted(signal);
		// Apply the caller's bound at the request layer as a cost/latency
		// optimization; the seam enforces it regardless.
		const count = Math.min(options.count, isPositiveInteger(request.maxResults) ? request.maxResults : options.count);
		const params = new URLSearchParams();
		params.set("q", request.query);
		params.set("count", String(Math.min(count, BRAVE_MAX_COUNT)));
		if (options.country != null && options.country.length > 0) params.set("country", options.country);
		if (options.searchLang != null && options.searchLang.length > 0) params.set("search_lang", options.searchLang);
		if (options.freshness != null && options.freshness.length > 0) params.set("freshness", options.freshness);
		const endpoint = `${options.baseURL}?${params.toString()}`;
		options.recordRequest?.({ endpoint });
		throwIfSearchAborted(signal);
		const dispatcher = this.dispatcher(options);
		let response;
		try {
			response = await fetch(endpoint, {
				method: "GET",
				redirect: "error",
				headers: {
					"x-subscription-token": apiKey,
					"accept": "application/json",
					"user-agent": USER_AGENT
				},
				...signal !== void 0 ? { signal } : {},
				...dispatcher !== void 0 ? { dispatcher } : {}
			});
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			throw new WebError(`Brave search request failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (!response.ok) {
			let message = `Brave Search API error (HTTP ${response.status})`;
			try {
				const parsed = await response.json();
				if (typeof parsed?.error === "string" && parsed.error.length > 0) message = parsed.error;
				else if (typeof parsed?.error?.message === "string" && parsed.error.message.length > 0) message = parsed.error.message;
			} catch (error) {
				if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			}
			throw new WebError(message, "WEB_PROVIDER_ERROR");
		}
		try {
			return mapBraveResponse(await response.json());
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			if (error instanceof WebError) throw error;
			throw new WebError(`Brave returned an unprocessable response body: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
	}
	/**
	 * Resolve one operation's credential without retaining it on the provider.
	 * @param options - the caller's snapshot.
	 * @param signal - abort signal for the surrounding search.
	 * @returns the resolved key.
	 */
	async apiKey(options, signal) {
		throwIfSearchAborted(signal);
		if (options.apiKey !== void 0 && options.apiKey.length > 0) return options.apiKey;
		let resolved;
		try {
			resolved = await abortable(options.resolveApiKey?.() ?? Promise.resolve(void 0), signal);
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			throw new WebError(`Brave search credential resolution failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
		if (resolved !== void 0 && resolved.length > 0) return resolved;
		throw new WebError(`Brave search has no API key for "${options.apiKeyEnv ?? "BRAVE_API_KEY"}": set "apiKey" in the web-search-brave settings section, export ${options.apiKeyEnv ?? "BRAVE_API_KEY"} in the launching environment, or store it through the credentials service (${options.apiKeyEnv ?? "BRAVE_API_KEY"} in .credentials.yaml)`, "WEB_PROVIDER_CREDENTIAL_MISSING");
	}
	/**
	* Return a cached undici ProxyAgent for the current proxy URL, or undefined
	* when no proxy is configured. The agent is reused across searches for
	* connection pooling; a changed proxy URL replaces the previous agent. DNS
	* for the target then resolves through the proxy, which sidesteps polluted
	* resolvers that would otherwise fail the connection.
	* @param options - the caller's snapshot.
	* @returns the dispatcher, or undefined for a direct connection.
	*/
	dispatcher(options) {
		const proxy = options.proxy;
		if (proxy === void 0 || proxy.length === 0) return void 0;
		if (this.cachedProxy === proxy) return this.cachedDispatcher;
		if (this.cachedDispatcher !== void 0) {
			this.cachedDispatcher.close?.().catch(() => {});
		}
		this.cachedProxy = proxy;
		this.cachedDispatcher = new ProxyAgent(proxy);
		return this.cachedDispatcher;
	}
};

/**
 * Race a same-process asynchronous preflight against caller cancellation. The
 * attached settlement handlers keep observing an uncooperative operation after
 * abort so a later rejection cannot become unhandled.
 */
function abortable(operation, signal) {
	if (signal === void 0) return operation;
	if (signal.aborted) return Promise.reject(searchAborted(signal));
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			reject(searchAborted(signal));
		};
		signal.addEventListener("abort", onAbort, { once: true });
		operation.then((value) => {
			signal.removeEventListener("abort", onAbort);
			resolve(value);
		}, (error) => {
			signal.removeEventListener("abort", onAbort);
			reject(new Error(String(error).replace(/^Error: /u, ""), { cause: error }));
		});
	});
}

/** Throw the provider's stable cancellation error when the caller already aborted. */
function throwIfSearchAborted(signal) {
	if (signal?.aborted === true) throw searchAborted(signal);
}

/** Build the provider's stable cancellation error while retaining the caller's reason. */
function searchAborted(signal, fallback) {
	return new WebError("Brave search aborted", "WEB_ABORTED", { cause: signal?.aborted === true ? signal.reason : fallback });
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error) {
	return error instanceof DOMException && error.name === "AbortError";
}

/** True for positive integers (result counts and request bounds). */
function isPositiveInteger(value) {
	return Number.isInteger(value) && value > 0;
}

/**
 * Register a Brave Search API-backed provider in `ctx.web`. The provider reads
 * its subscription token from a literal `apiKey` in the `web-search-brave`
 * settings section, from the environment variable named by `apiKeyEnv`
 * (default `BRAVE_API_KEY`), or from the credentials service — whichever is
 * configured first. A system-prompt announcement (optional, default on) tells
 * the agent the provider exists and how to help a user configure their own
 * key.
 * @module @deepseek-ai/dsh-web-search-brave
 */

/** Cordis plugin name used by loader diagnostics. */
const name = "web-search-brave";
/** The web seam this provider registers into, plus the webserver for the settings bridge. */
const inject = ["web", "webServer"];
const DEFAULT_API_KEY_ENV = "BRAVE_API_KEY";
/** Order of the announcement section within the tool-guidance band. */
const ANNOUNCEMENT_ORDER = 150;

const Config = z.object({
	apiKey: z.string().role("secret"),
	apiKeyEnv: z.string().role("credential-ref").default(DEFAULT_API_KEY_ENV),
	baseURL: z.string().default(BRAVE_DEFAULT_BASE_URL),
	count: z.number().step(1).min(1).max(BRAVE_MAX_COUNT).default(BRAVE_DEFAULT_COUNT),
	country: z.string(),
	searchLang: z.string(),
	freshness: z.string(),
	proxy: z.string(),
	announceToAgent: z.boolean().default(true),
	enabled: z.boolean().default(true)
});

/**
 * Model-facing announcement: the provider is installed, how its key resolves,
 * and how to guide a user who hits a missing-credential error.
 */
const BRAVE_GUIDANCE =
	"本机已安装 dsh-web-search-brave 插件（Brave Search API 网络搜索提供方）：web_search 工具由 Brave 官方 API 驱动（一次搜索 = 一次 HTTP 请求，无模型轮次）。" +
	`API key 按「插件设置 apiKey → 环境变量 ${DEFAULT_API_KEY_ENV}（可经 apiKeyEnv 改名）→ DSH 凭据服务」的顺序解析；` +
	"若搜索报 WEB_PROVIDER_CREDENTIAL_MISSING，指导用户三选一配置自己的 Brave 订阅 token：设置页的 web-search-brave 段填 apiKey、导出环境变量、或写入 .credentials.yaml。" +
	"可选参数 country / searchLang / freshness / count 见插件设置。"

/** Settings namespace carrying this provider's token reference and request options. */
const WEB_SEARCH_BRAVE_SETTINGS_NAMESPACE = settingsNamespace("web-search-brave");

/**
 * Project one resolved section into the options the provider serves its next
 * search with. Environment fallbacks stay here rather than in the provider:
 * every value it reads is already fully defaulted. The key resolves in order:
 * literal `apiKey`, then the `apiKeyEnv` environment variable (launch
 * environment, then the raw process environment), then the DSH credentials
 * service — so a new user can plug in their own key from any one of the three
 * surfaces. The proxy falls back to the launch environment's `HTTPS_PROXY` /
 * `HTTP_PROXY` (Node's fetch does not read proxy variables itself, and a
 * polluted resolver can otherwise make the direct connection fail).
 * @param ctx - plugin context supplying the credential and environment planes.
 * @param config - the currently authoritative section.
 * @returns options for one search.
 */
function resolveOptions(ctx, config) {
	const apiKeyEnv = credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV);
	const literalApiKey = config.apiKey !== void 0 && config.apiKey.length > 0 ? config.apiKey : void 0;
	const environment = launchEnvironmentOf(ctx);
	return {
		...literalApiKey === void 0 ? {} : { apiKey: literalApiKey },
		resolveApiKey: async () => {
			const ambient = environment.get(apiKeyEnv);
			if (ambient !== void 0 && ambient.value.length > 0) return ambient.value;
			const raw = process.env[apiKeyEnv];
			if (typeof raw === "string" && raw.length > 0) return raw;
			const credentials = ctx.get("credentials");
			if (credentials !== void 0) return (await credentials.resolve(apiKeyEnv))?.value;
			return void 0;
		},
		apiKeyEnv,
		baseURL: config.baseURL ?? BRAVE_DEFAULT_BASE_URL,
		count: config.count ?? BRAVE_DEFAULT_COUNT,
		country: config.country,
		searchLang: config.searchLang,
		freshness: config.freshness,
		proxy: config.proxy ?? environment.get("HTTPS_PROXY")?.value ?? environment.get("HTTP_PROXY")?.value,
		recordRequest: (request) => {
			ctx.get("agents")?.currentInitiator()?.session.append("web/brave-search-request", request);
		}
	};
}

/**
 * Register the Brave search provider (and the optional agent announcement)
 * with the live settings section, honoring `enabled` / `announceToAgent`.
 * Re-registration on section change tears the old surfaces down first, so
 * duplicate-name registrations never throw.
 */
function apply(ctx, config) {
	let current = () => config;
	let disposeProvider;
	let disposeAnnouncement;
	const sync = () => {
		if (disposeProvider !== void 0) {
			disposeProvider();
			disposeProvider = void 0;
		}
		if (disposeAnnouncement !== void 0) {
			disposeAnnouncement();
			disposeAnnouncement = void 0;
		}
		const value = current() ?? {};
		if (value.enabled === false) return;
		disposeProvider = ctx.web.registerSearchProvider(new BraveSearchProvider(() => resolveOptions(ctx, current())));
		const systemPrompt = ctx.get("systemPrompt");
		if (systemPrompt !== void 0 && value.announceToAgent !== false) {
			disposeAnnouncement = systemPrompt.section({
				name: "plugin:dsh-web-search-brave",
				order: ANNOUNCEMENT_ORDER,
				text: BRAVE_GUIDANCE
			});
		}
	};
	installSettingsSection(ctx, WEB_SEARCH_BRAVE_SETTINGS_NAMESPACE, Config, config ?? {}, {
		setSource: (source) => {
			current = source;
			sync();
		},
		onChange: sync
	});
	// Settings bridge route: independent of the enabled switch so the settings
	// page card can always reach its configuration surface (even to re-enable
	// the provider). The host apiproxy only exposes a hard-coded allowlist of
	// namespaces to the official settingsScope service, so this plugin serves
	// its own describe/mutate contract over the loopback fence.
	ctx.effect(() => {
		const dispose = ctx.webServer.register(makeSettingsRoute(ctx, WEB_SEARCH_BRAVE_SETTINGS_NAMESPACE));
		return () => {
			dispose();
		};
	}, "dsh-web-search-brave: settings route");
	// Initial registration from the composition entry (covers deployments with
	// no settings service, whose installSettingsSection never fires its hooks).
	sync();
}

export { ANNOUNCEMENT_ORDER, BRAVE_DEFAULT_BASE_URL, BRAVE_DEFAULT_COUNT, BRAVE_GUIDANCE, BRAVE_MAX_COUNT, BRAVE_PROVIDER_ID, BraveSearchProvider, Config, WEB_SEARCH_BRAVE_SETTINGS_NAMESPACE, apply, inject, name };
