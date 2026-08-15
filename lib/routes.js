/**
 * The /api/dsh-web-search-brave route family: the plugin's own loopback
 * settings bridge. The host apiproxy only exposes a hard-coded allowlist of
 * namespaces to the official settingsScope service, so a third-party
 * namespace would otherwise render as "设置段不可用" in the settings page.
 * This route serves the same describe/mutate contract over the loopback
 * fence instead, and carries the same trust fence as the ssh/opencode route
 * families (loopback literal plus browser same-origin markers) — LAN-exposed
 * dsh web deployments must not serve plugin API surfaces to strangers.
 */

/** Exact path of the settings bridge route (browser half spells the same value). */
export const SETTINGS_API = '/api/dsh-web-search-brave/settings'

/** Loopback literal check plus browser same-origin markers (mirrors the ssh routes' fence). */
function isLoopbackRequest(request) {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** One JSON response. */
function writeJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(payload)
}

/** Collect a JSON request body (small; settings writes are a few fields). */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** One redacted namespace view, shaped like the official settings.describe row. */
function namespaceView(descriptor, writable, hasDocument) {
  return {
    ns: descriptor.ns,
    schema: descriptor.schema,
    value: descriptor.value,
    base: descriptor.base,
    user: descriptor.user,
    revision: descriptor.revision,
    writable,
    hasDocument,
  }
}

/**
 * Build the settings bridge route: GET describes this plugin's namespace
 * (redacted view), POST applies one or more path ops through the settings
 * seam. Both ride the same loopback fence. Writes go through
 * `settings.mutate` so validation, revision fencing, and persistence behave
 * exactly like the official settings surface.
 * @param ctx - host plugin context (needs the `settings` service).
 * @param namespace - the plugin's settings namespace.
 * @returns the WebRoute to register with ctx.webServer.
 */
export function makeSettingsRoute(ctx, namespace) {
  const view = () => {
    const settings = ctx.get('settings')
    if (settings === undefined) return undefined
    const descriptor = settings.describe({ redactSecrets: true }).find((candidate) => candidate.ns === namespace)
    if (descriptor === undefined) return undefined
    return namespaceView(descriptor, settings.writable, settings.documentPath !== undefined)
  }
  return {
    kind: 'exact',
    path: SETTINGS_API,
    handler: async (req, res) => {
      if (!isLoopbackRequest(req)) {
        writeJson(res, 403, { success: false, error: 'forbidden: loopback-only' })
        return
      }
      if (req.method === 'GET') {
        const current = view()
        if (current === undefined) {
          writeJson(res, 200, { success: false, error: `settings namespace "${namespace}" is not registered` })
          return
        }
        writeJson(res, 200, { success: true, value: current })
        return
      }
      if (req.method === 'POST') {
        let body
        try {
          body = JSON.parse(await readBody(req))
        } catch {
          writeJson(res, 400, { success: false, error: 'invalid JSON body' })
          return
        }
        const settings = ctx.get('settings')
        if (settings === undefined) {
          writeJson(res, 200, { success: false, error: 'settings service unavailable' })
          return
        }
        try {
          await settings.mutate(namespace, body?.ops, body?.expectedRevision)
        } catch (error) {
          writeJson(res, 200, { success: false, error: error instanceof Error ? error.message : String(error) })
          return
        }
        const current = view()
        if (current === undefined) {
          writeJson(res, 200, { success: false, error: `settings namespace "${namespace}" is not registered` })
          return
        }
        writeJson(res, 200, { success: true, value: current })
        return
      }
      writeJson(res, 405, { success: false, error: 'method not allowed' })
    },
  }
}
