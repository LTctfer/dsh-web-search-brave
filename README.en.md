# @dsh-ltctfer/dsh-web-search-brave

A **Brave Search API**-backed web search provider plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH), mounted on the official web capability seam (`ctx.web`). One search is one HTTP request - no model turn - which is lighter and faster than the official DeepSeek provider (a full model round-trip per search).

It calls the official Brave Search endpoint `https://api.search.brave.com/res/v1/web/search` and maps the structured `web.results[]` into the seam's normalized `WebSearchResult`. The conversation model still sees the stable `web_search` tool.

## Features

- Pure retrieval endpoint: one search = one HTTP request, no model turn overhead;
- Structured mapping: sources come strictly from `web.results[]`, never scraped from model prose;
- Full error semantics: HTTP failures, missing credentials, and caller cancellation map to `WEB_PROVIDER_ERROR` / `WEB_PROVIDER_CREDENTIAL_MISSING` / `WEB_ABORTED`;
- Cancellation support (`AbortSignal`), result count shrinks to the caller's `maxResults`, dedup by URL;
- Optional `country` / `search_lang` / `freshness` parameters;
- **Custom API key, three ways**: paste `apiKey` in the settings page (easiest), export an environment variable (default `BRAVE_API_KEY`, renameable), or write it into the DSH credentials file - when you share the plugin, the other person just fills in their own Brave subscription token;
- **Built-in agent guidance**: the system prompt announces the plugin and how the key resolves, so when a new user hits a missing-credential error, the agent can walk them through it.

## Install

### From npm (after publishing)

```sh
dsh plugin --profile web add @dsh-ltctfer/dsh-web-search-brave
```

### Local path (development)

```sh
dsh plugin --profile web add link:$(pwd)
```

## Configuration

The plugin registers a `web-search-brave` settings section; you must **override the provider** in the `web` seam. This step is mandatory: the base bundle (`dsh-base`) pins `web.searchProvider` to `deepseek-official`, so without a `DEEPSEEK_API_KEY` every `web_search` call fails outright. Example for the profile's `cordis.patch.yml`:

```yaml
# web_search provider: the base bundle pins `deepseek-official` (needs
# DEEPSEEK_API_KEY). Override it to the Brave-backed provider (this plugin),
# whose key lives in the `web-search-brave` settings section.
- id: web
  config:
    searchProvider: brave-official

- insert:
    - id: web-search-brave
      name: '@dsh-ltctfer/dsh-web-search-brave'
      config:
        apiKeyEnv: BRAVE_API_KEY
        count: 10
```

> The profile's `cordis.patch.yml` is hot-watched by dsh - changes apply without a restart.

### API key (pick any one)

The plugin resolves the key in order; the first hit wins:

1. **Settings-page `apiKey` (recommended, simplest)**: open the DSH settings page, go to the "Plugins" tab, find the "Web Search (Brave)" card, paste your Brave subscription token into the **API Key** field and save (`role('secret')`, never shown in plain text or `describe()` output); the same card also tunes `apiKeyEnv` / `count` / `country` / `searchLang` / `freshness` / `proxy`;
2. **Environment variable**: export `BRAVE_API_KEY` before launching dsh (renameable via `apiKeyEnv`), e.g. `export BRAVE_API_KEY=<your token>`;
3. **Credentials file**: append `BRAVE_API_KEY: <your token>` to `$DSH_HOME/.credentials.yaml`.

> When sharing the plugin, the other person only needs way 1 - fill in their own key on the settings page, no files or config to touch.

### Settings

| Field | Default | Description |
| --- | --- | --- |
| `apiKey` | - | Literal subscription token (secret); takes precedence when set |
| `apiKeyEnv` | `BRAVE_API_KEY` | Credential reference resolved via the credentials service or launch environment |
| `baseURL` | `https://api.search.brave.com/res/v1/web/search` | Brave Search API endpoint |
| `count` | `10` | Requested result count per search (1-20, capped by the caller's `maxResults`) |
| `country` | - | Two-letter country code (e.g. `cn`, `us`) |
| `searchLang` | - | Search language (e.g. `zh-hans`, `en`) |
| `freshness` | - | Freshness filter (e.g. `pd`, `pw`, `pm`, `py`, or ISO date ranges) |
| `proxy` | env vars | HTTP proxy URL; defaults to the launch environment's `HTTPS_PROXY` / `HTTP_PROXY`. Node's fetch does not read proxy variables, and when `api.search.brave.com` DNS is polluted (resolving to a wrong IP), routing through a proxy resolves the domain proxy-side and bypasses the pollution |
| `announceToAgent` | `true` | Announce the plugin in the system prompt (the agent can then guide a user to configure their own key) |
| `enabled` | `true` | Master switch; when off, the search provider is not registered |

## Verify

```sh
dsh --profile web --dump-config   # confirm the web-search-brave entry is mounted
```

Or just ask the model to use the `web_search` tool in a conversation.

## Thanks

Thanks to the [linux.do](https://linux.do/) community — a great place for DSH plugin development and discussion.

## License

MIT. The plugin structure follows the official [@deepseek-ai/dsh-web-search-deepseek](https://github.com/deepseek-ai/deepseek-harness) (MIT) and implements the web capability seam's provider contract.

## Links

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [Brave Search API](https://brave.com/search/api/)
