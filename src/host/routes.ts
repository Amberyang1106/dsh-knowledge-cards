/**
 * /api/dsh-knowledge/* route family: KB CRUD, card listing/search/detail,
 * source status, commit, lint. Loopback-fenced like dsh-ssh /
 * dsh-allocation-monitor (the routes read local files the web GUI owns, so a
 * LAN-exposed dsh web must not serve them to unpaired devices).
 * @module dsh-knowledge-cards/host/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { CardMeta, PageInput } from '../core/types.ts'
import { searchCards } from '../core/search.ts'
import { auditKb, buildDeepAuditPromptForKb } from './audit.ts'
import { lintKb } from './lint.ts'
import {
  addReview, commitPages, createKb, deleteCodeFile, editCard, getKb, importCards, kbSummary, listCards,
  listCodeFiles, listKbSummaries, listLogEntries, listReviews, listSources, pendingSources, readCard,
  readCodeFile, rebuildAggregates, resolveReview, writeCodeFile,
} from './store.ts'

/** Body cap: raised to fit code-file uploads (JSON base64/utf8 text). */
const MAX_BODY_BYTES = 10 << 20
/** Per-file cap for code uploads. */
const MAX_CODE_FILE_BYTES = 5 << 20
/** Preview cap for the panel content route. */
const MAX_CODE_PREVIEW_BYTES = 500 << 10

function isLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
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

function json(res: ServerResponse, value: unknown, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

function ok(res: ServerResponse, value: unknown): void {
  json(res, { ok: true, ...(value as Record<string, unknown>) })
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    chunks.push(buffer)
    total += buffer.length
    if (total > MAX_BODY_BYTES) return null
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text === '') return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function queryParam(url: URL, name: string): string {
  return url.searchParams.get(name) ?? ''
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/** Normalize one incoming page (agent-generated) into a PageInput. */
function normalizePage(value: unknown): PageInput | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const type = asString(record.type).trim()
  const title = asString(record.title).trim()
  const body = asString(record.body)
  if (type === '' || title === '' || body === '') return null
  return {
    type,
    title,
    description: record.description !== undefined ? asString(record.description).trim() || undefined : undefined,
    tags: asStringArray(record.tags),
    related: asStringArray(record.related),
    sources: asStringArray(record.sources),
    body,
    path: record.path !== undefined ? asString(record.path).trim() || undefined : undefined,
  }
}

export function registerKnowledgeRoutes(ctx: Context): () => void {
  const routes = [
    // ------------------------------------------------------------ KB list + create
    // One handler per path — the webserver keyed route registry rejects
    // duplicate (kind, path), so GET and POST dispatch by method here.
    {
      kind: 'exact' as const,
      path: '/api/dsh-knowledge/kbs',
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (!isLoopbackRequest(req)) return json(res, { error: 'forbidden: loopback-only' }, 403)
        if (req.method === 'GET') {
          try {
            ok(res, { kbs: await listKbSummaries() })
          } catch (error) {
            json(res, { ok: false, error: String((error as Error).message ?? error) }, 500)
          }
          return
        }
        if (req.method === 'POST') {
          try {
            const body = (await readJsonBody(req)) as Record<string, unknown> | null
            const kb = await createKb({
              name: asString(body?.name),
              path: body?.path !== undefined ? asString(body.path) : undefined,
              description: body?.description !== undefined ? asString(body.description) : undefined,
            })
            ok(res, { kb: await kbSummary(kb) })
          } catch (error) {
            json(res, { ok: false, error: String((error as Error).message ?? error) }, 400)
          }
          return
        }
        json(res, { error: `method not allowed: ${req.method}` }, 405)
      },
    },
    // ------------------------------------------------------------ card list / search
    {
      kind: 'exact' as const,
      path: '/api/dsh-knowledge/cards',
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (!isLoopbackRequest(req)) return json(res, { error: 'forbidden: loopback-only' }, 403)
        if (req.method !== 'GET') return json(res, { error: `method not allowed: ${req.method}` }, 405)
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const kbId = queryParam(url, 'kb')
          const kb = await getKb(kbId)
          if (kb === null) return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404)
          const query = queryParam(url, 'q')
          const type = queryParam(url, 'type')
          const offset = Math.max(0, Number.parseInt(queryParam(url, 'offset') || '0', 10) || 0)
          const limitRaw = Number.parseInt(queryParam(url, 'limit') || '0', 10)
          const limit = limitRaw > 0 ? limitRaw : 100

          let cards = await listCards(kb)
          if (type !== '' && type !== 'all') {
            cards = cards.filter((card) => card.type === type)
          }
          let hits: Array<{ card: CardMeta; score: number }>
          if (query !== '') {
            hits = searchCards(cards, query, limit, (card) => card.description ?? '')
          } else {
            hits = cards.map((card) => ({ card, score: 0 }))
          }
          const page = hits.slice(offset, offset + limit)
          ok(res, { cards: page.map((hit) => hit.card), total: hits.length, offset, limit: page.length })
        } catch (error) {
          json(res, { ok: false, error: String((error as Error).message ?? error) }, 500)
        }
      },
    },
    // ------------------------------------------------------------ card detail
    {
      kind: 'exact' as const,
      path: '/api/dsh-knowledge/card',
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (!isLoopbackRequest(req)) return json(res, { error: 'forbidden: loopback-only' }, 403)
        if (req.method !== 'GET') return json(res, { error: `method not allowed: ${req.method}` }, 405)
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const kbId = queryParam(url, 'kb')
          const slug = queryParam(url, 'slug')
          const kb = await getKb(kbId)
          if (kb === null) return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404)
          if (slug === '') return json(res, { ok: false, error: 'slug is required' }, 400)
          const card = await readCard(kb, slug)
          if (card === null) return json(res, { ok: false, error: `card not found: ${slug}` }, 404)
          ok(res, { card })
        } catch (error) {
          json(res, { ok: false, error: String((error as Error).message ?? error) }, 500)
        }
      },
    },
    // ------------------------------------------------------------ commit pages
    {
      kind: 'exact' as const,
      path: '/api/dsh-knowledge/commit',
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (!isLoopbackRequest(req)) return json(res, { error: 'forbidden: loopback-only' }, 403)
        if (req.method !== 'POST') return json(res, { error: `method not allowed: ${req.method}` }, 405)
        try {
          const body = (await readJsonBody(req)) as Record<string, unknown> | null
          const kbId = asString(body?.kb)
          const kb = await getKb(kbId)
          if (kb === null) return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404)
          const pages = (Array.isArray(body?.pages) ? body.pages : []).map(normalizePage).filter((page): page is PageInput => page !== null)
          if (pages.length === 0) return json(res, { ok: false, error: 'pages must be a non-empty array of {type,title,body,...}' }, 400)
          const sourceFiles = asStringArray(body?.sourceFiles)
          const result = await commitPages(kb, pages, sourceFiles)
          ok(res, { result })
        } catch (error) {
          json(res, { ok: false, error: String((error as Error).message ?? error) }, 500)
        }
      },
    },
    // ------------------------------------------------------------ card edit (manual)
    {
      kind: 'exact' as const,
      path: '/api/dsh-knowledge/card/edit',
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (!isLoopbackRequest(req)) return json(res, { error: 'forbidden: loopback-only' }, 403)
        if (req.method !== 'POST') return json(res, { error: `method not allowed: ${req.method}` }, 405)
        try {
          const body = (await readJsonBody(req)) as Record<string, unknown> | null
          const kbId = asString(body?.kb)
          const slug = asString(body?.slug)
          const kb = await getKb(kbId)
          if (kb === null) return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404)
          if (slug === '') return json(res, { ok: false, error: 'slug is required' }, 400)
          const fields = (body ?? {}) as Record<string, unknown>
          const result = await editCard(kb, slug, {
            title: fields.title !== undefined ? asString(fields.title) : undefined,
            description: fields.description !== undefined ? asString(fields.description) : undefined,
            tags: fields.tags !== undefined ? asStringArray(fields.tags) : undefined,
            related: fields.related !== undefined ? asStringArray(fields.related) : undefined,
            sources: fields.sources !== undefined ? asStringArray(fields.sources) : undefined,
            body: fields.body !== undefined ? asString(fields.body) : undefined,
          })
          ok(res, { result })
        } catch (error) {
          json(res, { ok: false, error: String((error as Error).message ?? error) }, 400)
        }
      },
    },
    // ------------------------------------------------------------ modification log (看板)
    {
      kind: 'exact' as const,
      path: '/api/dsh-knowledge/log',
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (!isLoopbackRequest(req)) return json(res, { error: 'forbidden: loopback-only' }, 403)
        if (req.method !== 'GET') return json(res, { error: `method not allowed: ${req.method}` }, 405)
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const kbId = queryParam(url, 'kb')
          const kb = await getKb(kbId)
          if (kb === null) return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404)
          const entries = await listLogEntries(kb)
          const action = queryParam(url, 'action')
          const filtered = action !== '' && action !== 'all' ? entries.filter((entry) => entry.action === action) : entries
          ok(res, { entries: filtered, total: entries.length })
        } catch (error) {
          json(res, { ok: false, error: String((error as Error).message ?? error) }, 500)
        }
      },
    },
    // ------------------------------------------------------------ source status
    {
      kind: 'exact' as const,
      path: '/api/dsh-knowledge/sources',
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (!isLoopbackRequest(req)) return json(res, { error: 'forbidden: loopback-only' }, 403)
        if (req.method !== 'GET') return json(res, { error: `method not allowed: ${req.method}` }, 405)
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const kbId = queryParam(url, 'kb')
          const kb = await getKb(kbId)
          if (kb === null) return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404)
          ok(res, { sources: await listSources(kb), pending: (await pendingSources(kb)).length })
        } catch (error) {
          json(res, { ok: false, error: String((error as Error).message ?? error) }, 500)
        }
      },
    },
    // ------------------------------------------------------------ lint
    {
      kind: 'exact' as const,
      path: '/api/dsh-knowledge/lint',
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (!isLoopbackRequest(req)) return json(res, { error: 'forbidden: loopback-only' }, 403)
        if (req.method !== 'POST') return json(res, { error: `method not allowed: ${req.method}` }, 405)
        try {
          const body = (await readJsonBody(req)) as Record<string, unknown> | null
          const kbId = asString(body?.kb)
          const kb = await getKb(kbId)
          if (kb === null) return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404)
          ok(res, { issues: await lintKb(kb) })
        } catch (error) {
          json(res, { ok: false, error: String((error as Error).message ?? error) }, 500)
        }
      },
    },
    // ------------------------------------------------------------ bulk import cards
    {
      kind: 'exact' as const,
      path: '/api/dsh-knowledge/import-cards',
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (!isLoopbackRequest(req)) return json(res, { error: 'forbidden: loopback-only' }, 403)
        if (req.method !== 'POST') return json(res, { error: `method not allowed: ${req.method}` }, 405)
        try {
          const body = (await readJsonBody(req)) as Record<string, unknown> | null
          const kbId = asString(body?.kb)
          const dir = asString(body?.dir)
          const kb = await getKb(kbId)
          if (kb === null) return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404)
          if (dir === '') return json(res, { ok: false, error: 'dir is required' }, 400)
          ok(res, { result: await importCards(kb, dir) })
        } catch (error) {
          json(res, { ok: false, error: String((error as Error).message ?? error) }, 500)
        }
      },
    },
    // ------------------------------------------------------------ rebuild aggregates
    {
      kind: 'exact' as const,
      path: '/api/dsh-knowledge/rebuild',
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (!isLoopbackRequest(req)) return json(res, { error: 'forbidden: loopback-only' }, 403)
        if (req.method !== 'POST') return json(res, { error: `method not allowed: ${req.method}` }, 405)
        try {
          const body = (await readJsonBody(req)) as Record<string, unknown> | null
          const kbId = asString(body?.kb)
          const kb = await getKb(kbId)
          if (kb === null) return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404)
          ok(res, { rebuilt: await rebuildAggregates(kb) })
        } catch (error) {
          json(res, { ok: false, error: String((error as Error).message ?? error) }, 500)
        }
      },
    },
    // ------------------------------------------------------------ code list + write (upload)
    // One handler per path (the webserver rejects duplicate (kind, path));
    // GET lists, POST writes — dispatched by method.
    {
      kind: 'exact' as const,
      path: '/api/dsh-knowledge/code',
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (!isLoopbackRequest(req)) return json(res, { error: 'forbidden: loopback-only' }, 403)
        if (req.method === 'GET') {
          try {
            const url = new URL(req.url ?? '/', 'http://localhost')
            const kbId = queryParam(url, 'kb')
            const kb = await getKb(kbId)
            if (kb === null) return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404)
            ok(res, { files: await listCodeFiles(kb) })
          } catch (error) {
            json(res, { ok: false, error: String((error as Error).message ?? error) }, 500)
          }
          return
        }
        if (req.method === 'POST') {
          try {
            const body = (await readJsonBody(req)) as Record<string, unknown> | null
            const kbId = asString(body?.kb)
            const relPath = asString(body?.path)
            const content = asString(body?.content)
            const kb = await getKb(kbId)
            if (kb === null) return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404)
            if (relPath === '' || content === '') return json(res, { ok: false, error: 'path and content are required' }, 400)
            if (Buffer.byteLength(content, 'utf8') > MAX_CODE_FILE_BYTES) {
              return json(res, { ok: false, error: `code file too large (max ${MAX_CODE_FILE_BYTES >> 20} MB)` }, 413)
            }
            ok(res, { file: await writeCodeFile(kb, relPath, content) })
          } catch (error) {
            json(res, { ok: false, error: String((error as Error).message ?? error) }, 400)
          }
          return
        }
        json(res, { error: `method not allowed: ${req.method}` }, 405)
      },
    },
    // ------------------------------------------------------------ code content (preview)
    {
      kind: 'exact' as const,
      path: '/api/dsh-knowledge/code/content',
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (!isLoopbackRequest(req)) return json(res, { error: 'forbidden: loopback-only' }, 403)
        if (req.method !== 'GET') return json(res, { error: `method not allowed: ${req.method}` }, 405)
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const kbId = queryParam(url, 'kb')
          const relPath = queryParam(url, 'path')
          const kb = await getKb(kbId)
          if (kb === null) return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404)
          const content = await readCodeFile(kb, relPath)
          if (Buffer.byteLength(content, 'utf8') > MAX_CODE_PREVIEW_BYTES) {
            return json(res, { ok: false, error: 'file too large to preview (use wiki_code_read with a cap or open it locally)' }, 413)
          }
          ok(res, { path: relPath, content })
        } catch (error) {
          json(res, { ok: false, error: String((error as Error).message ?? error) }, 400)
        }
      },
    },
    // ------------------------------------------------------------ code delete
    {
      kind: 'exact' as const,
      path: '/api/dsh-knowledge/code/delete',
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (!isLoopbackRequest(req)) return json(res, { error: 'forbidden: loopback-only' }, 403)
        if (req.method !== 'POST') return json(res, { error: `method not allowed: ${req.method}` }, 405)
        try {
          const body = (await readJsonBody(req)) as Record<string, unknown> | null
          const kbId = asString(body?.kb)
          const relPath = asString(body?.path)
          const kb = await getKb(kbId)
          if (kb === null) return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404)
          ok(res, { deleted: await deleteCodeFile(kb, relPath) })
        } catch (error) {
          json(res, { ok: false, error: String((error as Error).message ?? error) }, 400)
        }
      },
    },
    // ------------------------------------------------------------ review queue
    {
      kind: 'exact' as const,
      path: '/api/dsh-knowledge/reviews',
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (!isLoopbackRequest(req)) return json(res, { error: 'forbidden: loopback-only' }, 403)
        if (req.method === 'GET') {
          try {
            const url = new URL(req.url ?? '/', 'http://localhost')
            const kbId = queryParam(url, 'kb')
            const status = queryParam(url, 'status')
            const kb = await getKb(kbId)
            if (kb === null) return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404)
            const items = await listReviews(kb, status)
            ok(res, { items, pending: items.filter((item) => item.status === 'pending').length })
          } catch (error) {
            json(res, { ok: false, error: String((error as Error).message ?? error) }, 500)
          }
          return
        }
        if (req.method === 'POST') {
          try {
            const body = (await readJsonBody(req)) as Record<string, unknown> | null
            const kbId = asString(body?.kb)
            const kind = asString(body?.kind) as 'contradiction' | 'duplicate' | 'missing-page' | 'suggestion'
            const kb = await getKb(kbId)
            if (kb === null) return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404)
            if (!['contradiction', 'duplicate', 'missing-page', 'suggestion'].includes(kind)) {
              return json(res, { ok: false, error: 'kind 必须是 contradiction|duplicate|missing-page|suggestion' }, 400)
            }
            const item = await addReview(kb, {
              kind,
              title: asString(body?.title),
              summary: asString(body?.summary),
              source: body?.source !== undefined ? asString(body.source) : undefined,
              options: body?.options !== undefined ? asStringArray(body.options) : undefined,
              searchQuery: body?.searchQuery !== undefined ? asString(body.searchQuery) : undefined,
            })
            ok(res, { item })
          } catch (error) {
            json(res, { ok: false, error: String((error as Error).message ?? error) }, 400)
          }
          return
        }
        json(res, { error: `method not allowed: ${req.method}` }, 405)
      },
    },
    // ------------------------------------------------------------ review resolve
    {
      kind: 'exact' as const,
      path: '/api/dsh-knowledge/reviews/resolve',
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (!isLoopbackRequest(req)) return json(res, { error: 'forbidden: loopback-only' }, 403)
        if (req.method !== 'POST') return json(res, { error: `method not allowed: ${req.method}` }, 405)
        try {
          const body = (await readJsonBody(req)) as Record<string, unknown> | null
          const kbId = asString(body?.kb)
          const id = asString(body?.id)
          const status = asString(body?.status)
          const kb = await getKb(kbId)
          if (kb === null) return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404)
          if (status !== 'resolved' && status !== 'skipped') {
            return json(res, { ok: false, error: 'status 必须是 resolved|skipped' }, 400)
          }
          const item = await resolveReview(kb, id, status, body?.resolution !== undefined ? asString(body.resolution) : undefined)
          if (item === null) return json(res, { ok: false, error: `review item not found: ${id}` }, 404)
          ok(res, { item })
        } catch (error) {
          json(res, { ok: false, error: String((error as Error).message ?? error) }, 400)
        }
      },
    },
    // ------------------------------------------------------------ audit existing KB
    {
      kind: 'exact' as const,
      path: '/api/dsh-knowledge/audit',
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (!isLoopbackRequest(req)) return json(res, { error: 'forbidden: loopback-only' }, 403)
        if (req.method !== 'POST') return json(res, { error: `method not allowed: ${req.method}` }, 405)
        try {
          const body = (await readJsonBody(req)) as Record<string, unknown> | null
          const kbId = asString(body?.kb)
          const kb = await getKb(kbId)
          if (kb === null) return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404)
          ok(res, { result: await auditKb(kb) })
        } catch (error) {
          json(res, { ok: false, error: String((error as Error).message ?? error) }, 500)
        }
      },
    },
    // ------------------------------------------------------------ deep-audit prompt (no side effects)
    {
      kind: 'exact' as const,
      path: '/api/dsh-knowledge/audit-prompt',
      handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        if (!isLoopbackRequest(req)) return json(res, { error: 'forbidden: loopback-only' }, 403)
        if (req.method !== 'GET') return json(res, { error: `method not allowed: ${req.method}` }, 405)
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const kbId = queryParam(url, 'kb')
          const kb = await getKb(kbId)
          if (kb === null) return json(res, { ok: false, error: `unknown knowledge base: ${kbId}` }, 404)
          ok(res, { prompt: await buildDeepAuditPromptForKb(kb) })
        } catch (error) {
          json(res, { ok: false, error: String((error as Error).message ?? error) }, 500)
        }
      },
    },
  ]
  const disposers = routes.map((route) => ctx.webServer.register(route))
  return () => { for (const dispose of disposers) dispose() }
}
