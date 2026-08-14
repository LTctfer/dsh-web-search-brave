# @dsh-ltctfer/dsh-web-search-brave

A **Brave Search API**-backed web search provider plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH), mounted on the official web capability seam (`ctx.web`). One search is one HTTP request - no model turn - which is lighter and faster than the official DeepSeek provider (a full model round-trip per search).

It calls the official Brave Search endpoint `https://api.search.brave.com/res/v1/web/search` and maps the structured `web.results[]` into the seam's normalized `WebSearchResult`. The conversation model still sees the stable `web_search` tool.

## Features

- Pure retrieval endpoint: one search = one HTTP request, no model turn overhead;
- Structured mapping: sources come strictly from `web.results[]`, never scraped from model prose;
- Full error semantics: HTTP failures, missing credentials, and caller cancellation map to `WEB_PROVIDER_ERROR` / `WEB_PROVIDER_CREDENTIAL_MISSING` / `WEB_ABORTED`;
- Cancellation support (`AbortSignal`), result count shrinks to the caller's `maxResults`, dedup by URL;
- Optional `country` / `search_lang` / `freshness` parameters;
- The token never lives in the plugin: it resolves by reference through the DSH credentials service (default `BRAVE_API_KEY`), with environment variable and literal fallbacks.

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

The plugin registers a `web-search-brave` settings section; pin the provider in the `web` seam. Example for the profile's `cordis.patch.yml`:

```yaml
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

### API key

One of three ways (priority: literal `apiKey` > credential reference > launch environment):

1. Credentials file (recommended) - append to `$DSH_HOME/.credentials.yaml`:

   ```yaml
   BRAVE_API_KEY: <your Brave subscription token>
   ```

2. Environment variable: export `BRAVE_API_KEY` before launching dsh;
3. Literal: put `apiKey: <token>` directly in the plugin `config` (marked `role('secret')`, never shown in `describe()` output).

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

## Verify

```sh
dsh --profile web --dump-config   # confirm the web-search-brave entry is mounted
```

Or just ask the model to use the `web_search` tool in a conversation.

## License

MIT. The plugin structure follows the official [@deepseek-ai/dsh-web-search-deepseek](https://github.com/deepseek-ai/deepseek-harness) (MIT) and implements the web capability seam's provider contract.

## Links

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [Brave Search API](https://brave.com/search/api/)
