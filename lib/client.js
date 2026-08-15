/**
 * dsh-web-search-brave — browser half. Hand-built client bundle in the
 * `window.__ModuleLoader__.load({ id, factory })` format the web shell loads
 * at /plugins/<id>/client.js (no build step required).
 *
 * Surfaces:
 *   - a settings card registered into the `settings.plugin.item` slot (the
 *     "插件" tab of the settings page). The card reads and writes the
 *     plugin's own loopback settings bridge route (`/api/dsh-web-search-
 *     brave/settings`): the host apiproxy only exposes a hard-coded allowlist
 *     of namespaces to the official settingsScope service, so a third-party
 *     namespace must serve its own configuration surface. From the card a
 *     user can paste their own Brave API key (apiKey) and tune apiKeyEnv /
 *     count / country / searchLang / freshness / proxy / baseURL /
 *     announceToAgent / enabled without touching any file.
 *
 * Failure policy: any mounting problem is logged, never thrown — the web
 * shell fails the whole boot when a plugin apply throws, and an external
 * plugin must not take the GUI down. The card degrades to nothing when the
 * slots registry is unavailable, and to an error state when the settings
 * bridge cannot be reached.
 */
window.__ModuleLoader__.load({
  id: '@dsh-ltctfer/dsh-web-search-brave',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const React = require('react');

    // ---------------------------------------------------------- constants
    /** Plugin-owned settings bridge route (spelled identically in lib/routes.js). */
    const SETTINGS_API = '/api/dsh-web-search-brave/settings';
    /** Slot id under which the card registers. */
    const CARD_ID = 'web-search-brave';
    /** Order among settings cards (after the host's three built-ins). */
    const CARD_ORDER = 100;
    /** Stable style tag id so the CSS injects exactly once. */
    const CSS_TAG_ID = '@dsh-ltctfer/dsh-web-search-brave/settings.css';

    // ---------------------------------------------------------------- css
    const css = '.bswCard{background:var(--dsw-alias-bg-layer-2,#1a1d23);border:1px solid var(--dsw-alias-border-l1,#2a2e37);border-radius:10px;flex-direction:column;gap:12px;padding:14px 16px;display:flex}'
      // Collapsible chrome mirrors the dsh-web-ui family cards: the card head
      // is a full-width button; the body renders only while open.
      + '.bswHeader{width:100%;color:var(--dsw-alias-label-primary,#e5e7eb);cursor:pointer;border:0;background:transparent;text-align:left;font:inherit;align-items:center;gap:8px;padding:0;display:flex}'
      + '.bswHeader:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#3b82f6);outline-offset:2px;border-radius:6px}'
      + '.bswHeadText{flex-direction:column;gap:2px;flex:1;min-width:0;display:flex}'
      + '.bswTitle{color:var(--dsw-alias-label-primary,#e5e7eb);margin:0;font-size:15px;font-weight:600}'
      + '.bswDesc{color:var(--dsw-alias-label-tertiary,#6b7280);margin:0;font-size:12px;line-height:1.5}'
      + '.bswChevron{transition:transform .12s ease;color:var(--dsw-alias-label-tertiary,#6b7280)}'
      + '.bswChevronOpen{transform:rotate(180deg)}'
      + '.bswField{flex-direction:column;gap:4px;display:flex}'
      + '.bswLabel{color:var(--dsw-alias-label-secondary,#9ca3af);font-size:12px;font-weight:600}'
      + '.bswInput{color:var(--dsw-alias-label-primary,#e5e7eb);background:var(--dsw-alias-bg-base,#111318);border:1px solid var(--dsw-alias-border-l2,#3a3f4a);border-radius:6px;width:100%;box-sizing:border-box;padding:6px 9px;font-size:12.5px;font-family:inherit}'
      + '.bswInput:focus{outline:2px solid var(--dsw-alias-state-business-primary,#3b82f6);outline-offset:1px}'
      + '.bswInput:disabled{opacity:.55;cursor:not-allowed}'
      + '.bswInput[type=checkbox]{width:auto}'
      + '.bswHint{color:var(--dsw-alias-label-tertiary,#6b7280);font-size:11px;line-height:1.45}'
      + '.bswBool{flex-direction:row;align-items:center;gap:8px;display:flex}'
      + '.bswBool .bswLabel{flex:1;min-width:0}'
      + '.bswFooter{flex-direction:row;align-items:center;gap:10px;margin-top:2px;display:flex}'
      + '.bswBtn{color:var(--dsw-alias-label-primary,#e5e7eb);border:1px solid var(--dsw-alias-border-l2,#3a3f4a);cursor:pointer;background:transparent;border-radius:7px;padding:6px 14px;font-size:12.5px}'
      + '.bswBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}'
      + '.bswBtn:disabled{opacity:.5;cursor:default}'
      + '.bswPrimary{color:#fff;background:var(--dsw-alias-state-business-primary,#3b82f6);border-color:transparent}'
      + '.bswPrimary:hover:not(:disabled){background:var(--dsw-alias-state-business-primary,#3b82f6);filter:brightness(1.1)}'
      + '.bswNotice{font-size:12px}'
      + '.bswNotice[data-kind=ok]{color:var(--dsw-alias-state-success-primary,#22c55e)}'
      + '.bswNotice[data-kind=err]{color:var(--dsw-alias-state-error-primary,#ef4444)}'
      + '.bswState{color:var(--dsw-alias-label-tertiary,#6b7280);text-align:center;padding:14px 8px;font-size:12.5px}';
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG_ID) + ']') === null) {
      const tag = document.createElement('style');
      tag.dataset.plugin = '@dsh-ltctfer/dsh-web-search-brave';
      tag.dataset.pluginCss = CSS_TAG_ID;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    // -------------------------------------------------------------- fields
    /** Free-text / numeric section fields, in display order. */
    const TEXT_FIELDS = [
      { key: 'apiKey', label: 'API Key', secret: true, hint: '填入你自己的 Brave 订阅 token（保存后立即生效）。留空则不修改现有 key。' },
      { key: 'apiKeyEnv', label: 'apiKeyEnv', hint: '环境变量名（默认 BRAVE_API_KEY，可改名）。' },
      { key: 'baseURL', label: 'baseURL', hint: 'API 端点，一般无需修改。' },
      { key: 'count', label: 'count', numeric: true, hint: '每次搜索请求的结果条数（1–20）。' },
      { key: 'country', label: 'country', hint: '两位国家/地区码，如 cn、us。' },
      { key: 'searchLang', label: 'searchLang', hint: '搜索语言，如 zh-hans、en。' },
      { key: 'freshness', label: 'freshness', hint: '时效过滤：pd / pw / pm / py 或 ISO 日期区间。' },
      { key: 'proxy', label: 'proxy', hint: 'HTTP 代理 URL；留空则取启动环境的 HTTPS_PROXY / HTTP_PROXY。' },
    ];
    /** Boolean section fields. */
    const BOOL_FIELDS = [
      { key: 'announceToAgent', label: 'announceToAgent', hint: '在系统提示词中宣告插件（agent 可指导新用户配 key）。' },
      { key: 'enabled', label: 'enabled', hint: '总开关；关闭后不注册搜索提供方。' },
    ];

    // -------------------------------------------------------------- card
    /**
     * Minimal scope surface over the plugin's own loopback settings bridge
     * route. The host apiproxy only exposes a hard-coded allowlist of
     * namespaces to the official settingsScope service, so a third-party
     * namespace would otherwise report "unavailable" forever; this scope
     * reads and writes the same describe/mutate contract directly.
     */
    function createBridgeScope(apiUrl) {
      const listeners = new Set();
      let snapshot = { status: 'loading', value: undefined, writable: false, revision: undefined };
      const emit = () => { for (const listener of listeners) listener(); };
      const applyBody = (body) => {
        snapshot = {
          status: 'ready',
          value: body.value?.value ?? {},
          revision: body.value?.revision,
          writable: body.value?.writable === true,
        };
        emit();
      };
      const read = async () => {
        let body = null;
        try {
          const response = await fetch(apiUrl, { cache: 'no-store' });
          body = await response.json();
        } catch (error) {
          // network failure — unavailable below
        }
        if (body === null || body.success !== true) {
          snapshot = { ...snapshot, status: 'unavailable' };
          emit();
          return;
        }
        applyBody(body);
      };
      const write = async (ops) => {
        let response;
        try {
          response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ops, expectedRevision: snapshot.revision }),
          });
        } catch (error) {
          throw new Error('设置保存失败：无法连接插件设置服务');
        }
        let body = null;
        try { body = await response.json(); } catch (error) { /* non-JSON body */ }
        if (body === null || body.success !== true) {
          throw new Error(body !== null && typeof body.error === 'string' ? body.error : 'HTTP ' + response.status);
        }
        applyBody(body);
      };
      return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener);
          return () => { listeners.delete(listener); };
        },
        load: read,
        async set(key, value) { await write([{ op: 'set', path: [key], value }]); },
        async unset(key) { await write([{ op: 'unset', path: [key] }]); },
      };
    }

    /**
     * The settings card. Reads the namespace through the bound bridge scope
     * (redacted view: the apiKey value is never shown), stages edits
     * locally, and commits them as revision-fenced field writes on save.
     * Collapsed by default: the head is a disclosure button (mirrors the
     * dsh-web-ui family cards); the body renders only while open.
     * @param props - slot-injected props; `scope` is the bound bridge scope.
     *   `openDefault` (test hook) picks the initial disclosure state.
     */
    function BraveSettingsCard(props) {
      const scope = props.scope;
      const [snap, setSnap] = React.useState(() => scope.getSnapshot());
      React.useEffect(() => scope.subscribe(() => setSnap(scope.getSnapshot())), [scope]);
      const [open, setOpen] = React.useState(props.openDefault === true);
      const [drafts, setDrafts] = React.useState({});
      const [saving, setSaving] = React.useState(false);
      const [notice, setNotice] = React.useState(null);

      const value = snap.value ?? {};
      const ready = snap.status === 'ready';
      const writable = ready && snap.writable === true;
      const setDraft = (key, text) => setDrafts((prev) => ({ ...prev, [key]: text }));
      const dirty = Object.keys(drafts).length > 0;

      const save = async () => {
        setSaving(true);
        setNotice(null);
        try {
          for (const [key, text] of Object.entries(drafts)) {
            const trimmed = typeof text === 'string' ? text.trim() : String(text);
            const spec = TEXT_FIELDS.find((field) => field.key === key);
            if (key === 'apiKey') {
              // Write-only: empty means "leave the existing key untouched".
              if (trimmed.length > 0) await scope.set(key, trimmed);
            } else if (spec !== undefined && spec.numeric) {
              if (trimmed === '') await scope.unset(key);
              else await scope.set(key, Number(trimmed));
            } else if (trimmed === '') {
              await scope.unset(key);
            } else {
              await scope.set(key, trimmed);
            }
          }
          setDrafts({});
          setNotice({ kind: 'ok', text: '已保存，搜索提供方即时生效。' });
        } catch (error) {
          setNotice({ kind: 'err', text: '保存失败：' + (error instanceof Error ? error.message : String(error)) });
        } finally {
          setSaving(false);
        }
      };

      const discard = () => {
        setDrafts({});
        setNotice(null);
      };

      // Disclosure head: the whole card header is one button, exactly like
      // the dsh-web-ui family plugin cards (title + description + chevron).
      const head = React.createElement('button', {
        type: 'button',
        className: 'bswHeader',
        'aria-expanded': open,
        'aria-label': (open ? '收起' : '展开') + '设置：brave 搜索',
        onClick: () => setOpen(!open),
      },
        React.createElement('span', { className: 'bswHeadText' },
          React.createElement('span', { className: 'bswTitle' }, 'brave 搜索'),
          React.createElement('span', { className: 'bswDesc' },
            '配置你自己的 Brave API key 与搜索参数。key 解析顺序：此处 apiKey → 环境变量（apiKeyEnv）→ 凭据文件。')),
        React.createElement('span', { className: open ? 'bswChevron bswChevronOpen' : 'bswChevron' }, '▾'));

      let body;
      if (open) {
        if (!ready) {
          body = React.createElement('div', { className: 'bswState' },
            snap.status === 'loading' ? '加载中…' : '设置服务不可用（无法连接插件设置服务）。');
        } else {
          body = [
          TEXT_FIELDS.map((spec) => React.createElement('div', { className: 'bswField', key: spec.key },
            React.createElement('label', { className: 'bswLabel', htmlFor: 'bsw-' + spec.key }, spec.label),
            React.createElement('input', {
              id: 'bsw-' + spec.key,
              className: 'bswInput',
              type: spec.secret ? 'password' : (spec.numeric ? 'number' : 'text'),
              autoComplete: spec.secret ? 'new-password' : 'off',
              placeholder: spec.secret ? '（已配置时此处为空，留空则不修改）' : '',
              disabled: !writable || saving,
              value: drafts[spec.key] !== undefined ? drafts[spec.key] : (spec.secret ? '' : String(value[spec.key] ?? '')),
              onChange: (event) => setDraft(spec.key, event.target.value),
            }),
            React.createElement('span', { className: 'bswHint' }, spec.hint))),
          BOOL_FIELDS.map((spec) => React.createElement('label', { className: 'bswField bswBool', key: spec.key },
            React.createElement('span', { className: 'bswLabel' }, spec.label),
            React.createElement('input', {
              className: 'bswInput',
              type: 'checkbox',
              disabled: !writable || saving,
              checked: drafts[spec.key] !== undefined ? drafts[spec.key] : Boolean(value[spec.key]),
              onChange: (event) => setDraft(spec.key, event.target.checked),
            }),
            React.createElement('span', { className: 'bswHint' }, spec.hint))),
          React.createElement('div', { className: 'bswFooter' },
            React.createElement('button', {
              type: 'button',
              className: 'bswBtn bswPrimary',
              disabled: !writable || saving || !dirty,
              onClick: save,
            }, saving ? '保存中…' : '保存'),
            React.createElement('button', {
              type: 'button',
              className: 'bswBtn',
              disabled: !writable || saving || !dirty,
              onClick: discard,
            }, '撤销'),
            notice !== null ? React.createElement('span', { className: 'bswNotice', 'data-kind': notice.kind }, notice.text) : null,
            !writable ? React.createElement('span', { className: 'bswHint' }, '（当前只读）') : null),
        ];
        }
      }

      return React.createElement('div', { className: 'bswCard' }, head, body);
    }

    // -------------------------------------------------------------- entry
    /** Required services: the slots registry for the card slot. */
    const inject = ['slots'];

    /**
     * Register the settings card.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      try {
        // The card reads/writes the plugin's own loopback settings bridge
        // (the host apiproxy does not expose third-party namespaces to the
        // official settingsScope service).
        const scope = createBridgeScope(SETTINGS_API);
        scope.load();
        ctx.slots.inject('settings.plugin.item', function* () {
          yield ctx.slots.register({
            name: 'settings.plugin.item',
            id: CARD_ID,
            order: CARD_ORDER,
            inject: () => ({ scope }),
          }, BraveSettingsCard);
        });
      } catch (error) {
        // Card failures degrade the settings page, never the GUI.
        console.warn('[dsh-web-search-brave] settings card mount failed:', error);
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
