export const SIDEBAR_OPEN_TOOL = 'open_sidebar'
export const MAX_SIDEBAR_URL_LENGTH = 16 * 1024

export const SIDEBAR_OPEN_PROMPT = [
  'You can use `open_sidebar` to display a file or HTTP(S) URL directly in the user\'s right sidebar preview panel for immediate visual review (HTML/HTM pages, images, PDFs, Office docs, spreadsheets/CSV/TSV, Markdown, code at a line, or a local/web URL).',
  'Call `open_sidebar` when showing a generated report, HTML page, chart, diagram, image, deliverable, or dev server page would let the user inspect your work without manually opening it.',
  'Prefer files in the workspace directory (isolated sandbox `/tmp` files are not readable by host preview). Pass either `path` or `url`, not both; do not call it speculatively for every routine file edit or before the file exists.',
].join(' ')

/** Parse and normalize an HTTP(S) URL for the sidebar browser; throws Error on invalid input. */
export function parseSidebarUrl(input) {
  if (typeof input !== 'string') throw new Error('url must be a string')
  const trimmed = input.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_SIDEBAR_URL_LENGTH) {
    throw new Error(`url must be a non-empty string of at most ${MAX_SIDEBAR_URL_LENGTH} characters`)
  }
  if (!/^https?:/i.test(trimmed)) throw new Error('url must use an explicit http:// or https:// scheme')
  let parsed
  try { parsed = new URL(trimmed) } catch { throw new Error('url is not a valid URL') }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('url must use http:// or https://')
  if (parsed.username !== '' || parsed.password !== '') throw new Error('url must not include embedded credentials')
  return parsed.href
}

/** Normalize an absolute target path to a workspace-relative POSIX path when inside `workspaceRoot`. */
export function toSidebarAddressPath(absolutePath, workspaceRoot) {
  const target = String(absolutePath).replace(/\\/g, '/')
  if (typeof workspaceRoot !== 'string' || workspaceRoot.trim().length === 0) return target
  const root = workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '')
  if (root.length > 0 && target.startsWith(`${root}/`)) return target.slice(root.length + 1)
  return target
}

/** Validate mutual exclusivity and field constraints for `open_sidebar` arguments. */
export function validateSidebarArgs(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('arguments must be an object')
  const hasPath = raw.path !== undefined
  const hasUrl = raw.url !== undefined
  if (hasPath === hasUrl) throw new Error('open_sidebar requires exactly one of `path` or `url`')
  if (raw.destination !== undefined && raw.destination !== 'sidebar' && raw.destination !== 'float') {
    throw new Error('destination must be "sidebar" or "float"')
  }
  const dest = raw.destination === undefined ? {} : { destination: raw.destination }
  if (hasUrl) {
    if (raw.line !== undefined) throw new Error('line is only valid when opening a file `path`')
    if (raw.destination === 'float') throw new Error('destination "float" is only supported when opening a file `path`')
    return { kind: 'url', url: parseSidebarUrl(raw.url), ...dest }
  }
  if (typeof raw.path !== 'string' || raw.path.trim().length === 0) throw new Error('path must be a non-empty string')
  if (raw.line !== undefined && (!Number.isSafeInteger(raw.line) || raw.line < 1)) {
    throw new Error('line must be a positive integer starting at 1')
  }
  return { kind: 'file', path: raw.path, ...(raw.line !== undefined ? { line: raw.line } : {}), ...dest }
}

/** Format a concise single-line confirmation string returned to the model. */
export function formatOpenSidebarResult(value) {
  if (value.kind === 'url') return `Opened ${value.url} in right sidebar browser.`
  const loc = `${value.path}${value.line !== undefined ? `:${value.line}` : ''}`
  const extra = value.absolutePath && value.absolutePath !== value.path ? ` (${value.absolutePath})` : ''
  return `Opened ${loc} in right sidebar preview${extra}.`
}

/** Validate target existence on the host filesystem (for files) or normalize URLs, returning durable metadata. */
export async function executeOpenSidebar(args, exec, { fs, workingDirectory, ToolArgsError, FsError, now = Date.now }) {
  const argsErr = (msg) => (ToolArgsError ? new ToolArgsError([msg]) : new Error(msg))
  const fsErr = (msg, code) => (FsError ? new FsError(msg, code) : Object.assign(new Error(msg), { code }))
  let input
  try { input = validateSidebarArgs(args) } catch (err) { throw argsErr(err.message) }
  if (input.kind === 'url') {
    return { kind: 'url', url: input.url, ...(input.destination ? { destination: input.destination } : {}), openedAt: now() }
  }
  const cwd = exec?.agent !== undefined && workingDirectory ? await workingDirectory.ensure(exec.agent, exec.signal) : undefined
  const workspaceRoot = exec?.agent?.session?.header?.cwd ?? cwd
  const entry = await fs.lstat(input.path, cwd !== undefined ? { cwd } : {}, exec?.signal)
  if (entry !== undefined && entry.type !== 'file') {
    throw fsErr(`Cannot open ${input.path} in sidebar: not a regular file (${entry.type})`, 'FS_NOT_REGULAR_FILE')
  }
  const target = await fs.resolve(input.path, { ...(cwd !== undefined ? { cwd } : {}), ...(exec?.signal ? { signal: exec.signal } : {}) })
  const info = await fs.stat(target, exec?.signal)
  if (info === undefined) {
    const tmpHint = input.path.startsWith('/tmp/') ? ' Sandbox /tmp files are isolated from host preview; save into the workspace directory first.' : ' Check the path and retry.'
    throw fsErr(`Cannot open ${input.path} in sidebar: file not found.${tmpHint}`, 'FS_NOT_FOUND')
  }
  if (info.type !== 'file') throw fsErr(`Cannot open ${input.path} in sidebar: not a regular file (${info.type})`, 'FS_NOT_REGULAR_FILE')
  const absolutePath = fs.processPath(target)
  const addressPath = toSidebarAddressPath(absolutePath, workspaceRoot)
  return {
    kind: 'file', path: addressPath, absolutePath,
    ...(input.line !== undefined ? { line: input.line } : {}),
    ...(input.destination ? { destination: input.destination } : {}),
    openedAt: now(),
  }
}

/** Build the DSH `open_sidebar` tool definition from runtime dependencies. */
export function createSidebarOpenToolDefinition({ defineTool = (def) => def, ...deps }) {
  return defineTool({
    name: SIDEBAR_OPEN_TOOL,
    description: 'Open an existing file (HTML, Markdown, code, image, PDF, Office, CSV/TSV) or an HTTP(S) URL in the user\'s right sidebar preview immediately.',
    parameters: {
      path: { type: 'string', description: 'Path to an existing regular file. Relative paths resolve from the session working directory.' },
      url: { type: 'string', description: 'Explicit http:// or https:// URL to open in the sidebar browser tab.' },
      line: { type: 'integer', description: 'Optional 1-based line number for text, code, or Markdown files.' },
      destination: { type: 'string', enum: ['sidebar', 'float'], description: 'Placement for files: docked "sidebar" (default) or "float" floating panel.' },
    },
    timeoutMs: 10000,
    isConcurrencySafe: () => true,
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['file', 'url'], required: true },
          path: { type: 'string' }, absolutePath: { type: 'string' }, url: { type: 'string' },
          line: { type: 'integer' }, destination: { type: 'string', enum: ['sidebar', 'float'] },
          openedAt: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatOpenSidebarResult(value) }],
      presentationMeta: (_args, value) => ({ tool: SIDEBAR_OPEN_TOOL, ...value }),
    },
    execute: (args, exec) => executeOpenSidebar(args, exec, deps),
  })
}
