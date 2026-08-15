# @dsh-ltctfer/dsh-web-search-brave

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的 **Brave Search API** 网络搜索提供方插件，挂载到官方 web 能力接缝（`ctx.web`）。一次搜索就是一次 HTTP 请求——不需要模型参与，比 DeepSeek 官方提供方（每次搜索消耗一次完整模型轮次）更轻、更快。

调用 Brave 官方搜索端点 `https://api.search.brave.com/res/v1/web/search`，把结构化 `web.results[]` 映射为接缝规范化的 `WebSearchResult`，模型看到的仍是稳定的 `web_search` 工具。

## 特性

- 纯检索端点：一次搜索 = 一次 HTTP 请求，无模型轮次开销；
- 结构化映射：来源严格来自 `web.results[]`，绝不从模型文本中抓取 URL；
- 完整错误语义：HTTP 失败、凭据缺失、调用方取消分别映射为 `WEB_PROVIDER_ERROR` / `WEB_PROVIDER_CREDENTIAL_MISSING` / `WEB_ABORTED`；
- 支持取消（`AbortSignal`）、按调用方 `maxResults` 自动收敛请求条数、按 URL 去重；
- 可选 `country` / `search_lang` / `freshness` 参数；
- **自定义 API key 三选一**：设置页直接填 `apiKey`（最简单）、导出环境变量（默认 `BRAVE_API_KEY`，可改名）、或写入 DSH 凭据文件 —— 把插件分享给别人时，对方只需填入自己的 Brave 订阅 token 即可；
- **内置 agent 引导**：系统提示词会宣告插件与 key 的配置方法，新用户遇到凭据缺失时，agent 能直接指导其配置。

## 安装

### 方式一：从 npm 安装（发布后）

```sh
dsh plugin --profile web add @dsh-ltctfer/dsh-web-search-brave
```

### 方式二：本地路径安装（开发调试）

```sh
dsh plugin --profile web add link:$(pwd)
```

## 配置

插件注册 `web-search-brave` 设置段，然后在 `web` 接缝中钉住提供方。以 profile 的 `cordis.patch.yml` 为例：

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

> profile 的 `cordis.patch.yml` 被 dsh 热监视，保存后无需重启即可生效。

### 设置卡片的原理

DSH 设置页「插件」标签的官方设置表单走 `settingsScope` 服务，但宿主 apiproxy 只对**硬编码白名单**里的 namespace 开放（`agent-loop` / `shell` / `web-search-deepseek` 等），第三方插件的 namespace 一律返回「设置段不可用」。因此本插件自建了一个 **loopback settings bridge**：

- 宿主侧注册 `GET/POST /api/dsh-web-search-brave/settings`（回环围栏：仅 127.0.0.1 + 同源标记放行），`GET` 返回脱敏后的 namespace 视图（schema / value / revision / writable），`POST` 把 path ops 交给官方 `settings.mutate` 落盘（校验、revision 锁、持久化与官方表单完全一致）；
- 客户端「brave 搜索」卡片直接读写该路由，不经过官方 `settingsScope`；保存后搜索提供方即时生效；
- 设置路由独立于 `enabled` 开关注册——即使提供方被关闭，设置页卡片仍可打开并重新启用。

### 密钥（三选一，任选其一即可）

插件按以下顺序解析 key，先命中的生效：

1. **设置页 `apiKey`（推荐，最简单）**：打开 DSH 设置页 →「插件」标签 →「brave 搜索」卡片，在 **API Key** 输入框粘贴你的 Brave 订阅 token 并保存（`role('secret')`，不显示明文、不出现在 `describe()` 输出中）；同一卡片还能调 `apiKeyEnv` / `count` / `country` / `searchLang` / `freshness` / `proxy` 等参数；
2. **环境变量**：启动 dsh 前导出 `BRAVE_API_KEY`（可经 `apiKeyEnv` 改名），如 `export BRAVE_API_KEY=<你的令牌>`；
3. **凭据文件**：在 `$DSH_HOME/.credentials.yaml` 中追加 `BRAVE_API_KEY: <你的令牌>`。

> 把插件分享给别人时，对方只需按**方式一**在设置页填入自己的 key，无需改任何文件或配置。

### 配置项

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `apiKey` | — | 字面量订阅令牌（secret），设置时优先于凭据引用 |
| `apiKeyEnv` | `BRAVE_API_KEY` | 凭据引用名，经凭据服务或启动环境解析 |
| `baseURL` | `https://api.search.brave.com/res/v1/web/search` | Brave 搜索 API 端点 |
| `count` | `10` | 每次搜索请求的结果条数（1–20，受调用方 `maxResults` 约束） |
| `country` | — | 两位国家/地区码（如 `cn`、`us`） |
| `searchLang` | — | 搜索语言（如 `zh-hans`、`en`） |
| `freshness` | — | 时效过滤（如 `pd`、`pw`、`pm`、`py` 或 ISO 日期区间） |
| `proxy` | 环境变量 | HTTP 代理 URL；默认取启动环境的 `HTTPS_PROXY` / `HTTP_PROXY`。Node 的 fetch 不读代理环境变量，且当 `api.search.brave.com` 的 DNS 被污染（解析到错误 IP）时，走代理可让域名在代理侧解析、绕过污染 |
| `announceToAgent` | `true` | 是否在系统提示词中宣告插件（agent 可据此指导用户配置自己的 key） |
| `enabled` | `true` | 总开关；关闭后不注册搜索提供方 |

## 验证

```sh
dsh --profile web --dump-config   # 确认 web-search-brave 条目已挂载
```

或在对话中直接让模型使用 `web_search` 工具。

## 许可

MIT。本插件的结构参考了官方 [@deepseek-ai/dsh-web-search-deepseek](https://github.com/deepseek-ai/deepseek-harness)（MIT），按 web 能力接缝的提供方规范实现。

## 相关链接

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [Brave Search API](https://brave.com/search/api/)
