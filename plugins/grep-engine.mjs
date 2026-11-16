// Parsing and retention share ripgrep's byte offsets; no second regular-expression engine.
export function parseEnhancedArgs(args, parseBase, cap = 250) {
  const base = parseBase(args)
  const mode = args.output_mode ?? 'content'
  if (!['content', 'files_with_matches', 'count'].includes(mode)) throw new Error('Unsupported output_mode')
  const number = (name, fallback, max) => {
    const value = args[name] ?? fallback
    if (!Number.isInteger(value) || value < 0 || value > max) throw new Error(`${name} must be an integer from 0 to ${max}`)
    return value
  }
  const context = number('context', 0, 50)
  const before = number('before_context', context, 50), after = number('after_context', context, 50)
  const limit = number('head_limit', cap, cap)
  if (limit < 1) throw new Error('head_limit must be positive')
  const exclude = args.exclude ?? []
  if (!Array.isArray(exclude) || exclude.length > 32 || exclude.some(s => typeof s !== 'string' || !s.trim() || s.includes('\0') || s.startsWith('!'))) throw new Error('exclude must contain at most 32 non-empty positive globs')
  for (const field of ['only_matching', 'multiline']) if (args[field] !== undefined && typeof args[field] !== 'boolean') throw new Error(`${field} must be boolean`)
  if ((mode !== 'content' && (before || after || args.only_matching)) || (args.only_matching && (before || after))) throw new Error('Context and only_matching require content mode and cannot be combined with each other')
  return { ...base, mode, before, after, limit, exclude, onlyMatching: args.only_matching ?? false, multiline: args.multiline ?? false }
}

export function enhancedCommand(input) {
  const argv = input.mode === 'files_with_matches' ? ['--files-with-matches', '--null'] : input.mode === 'count' ? ['--count-matches', '--with-filename', '--null'] : ['--json']
  argv.push(`--regexp=${input.pattern}`)
  if (input.include !== undefined) argv.push(`--glob=${input.include}`)
  for (const glob of input.exclude) argv.push(`--glob=!${glob}`)
  if (input.multiline) argv.push('--multiline', '--multiline-dotall')
  if (input.mode === 'content') {
    if (input.before) argv.push(`--before-context=${input.before}`)
    if (input.after) argv.push(`--after-context=${input.after}`)
  }
  if (input.path !== undefined) argv.push('--', input.path)
  return argv
}

export function parseSearchOutput(stdout, mode, relative = p => p) {
  if (mode === 'files_with_matches') {
    if (stdout && !stdout.endsWith('\0')) throw new Error('Incomplete NUL-delimited path list')
    return [...new Set(stdout.split('\0').filter(Boolean))].map(path => ({ path: relative(path) }))
  }
  if (mode === 'count') {
    const rows = []; let offset = 0
    while (offset < stdout.length) {
      const nul = stdout.indexOf('\0', offset), end = stdout.indexOf('\n', nul + 1)
      if (nul < offset || end < nul || !/^\d+$/.test(stdout.slice(nul + 1, end))) throw new Error('Malformed count record')
      const count = Number(stdout.slice(nul + 1, end))
      if (!Number.isSafeInteger(count)) throw new Error('Count exceeds the safe integer range')
      rows.push({ path: relative(stdout.slice(offset, nul)), count }); offset = end + 1
    }
    return rows
  }
  const rows = []
  for (const line of stdout.split('\n')) {
    if (!line) continue
    const event = JSON.parse(line)
    if (!['match', 'context'].includes(event.type)) continue
    const d = event.data
    if (typeof d?.path?.text !== 'string' || !Number.isInteger(d.line_number) || d.line_number < 1) throw new Error('Malformed ripgrep path or line number')
    const text = d.lines?.text
    if (typeof text !== 'string') {
      if (typeof d.lines?.bytes !== 'string') throw new Error('Malformed ripgrep line')
      rows.push({ path: relative(d.path.text), lineNumber: d.line_number, line: '(line is not valid UTF-8)', unreadable: true, kind: event.type, spans: [] }); continue
    }
    const bytes = Buffer.byteLength(text)
    if (event.type === 'match' && (!Array.isArray(d.submatches) || !d.submatches.length)) throw new Error('Missing ripgrep submatches')
    const spans = (d.submatches ?? []).map(span => {
      if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end < span.start || span.end > bytes) throw new Error('Malformed match byte range')
      return { start: span.start, end: span.end }
    })
    rows.push({ path: relative(d.path.text), lineNumber: d.line_number, line: text.replace(/\r?\n$/, ''), rawLine: text, kind: event.type, spans })
  }
  return rows
}

function utf8Window(buffer, start, end) {
  while (start > 0 && start < buffer.length && (buffer[start] & 0xc0) === 0x80) start++
  while (end > start && end < buffer.length && (buffer[end] & 0xc0) === 0x80) end--
  return { start, end, text: buffer.subarray(start, end).toString('utf8') }
}

export function matchPreview(line, spans = [], budget = 2000) {
  const b = Buffer.from(line)
  if (b.length <= budget) return { text: line, truncated: false }
  const relevant = spans.length ? spans : [{ start: 0, end: 0 }]
  const windows = []; let left = budget
  for (let i = 0; i < relevant.length && left >= 8; i++) {
    const span = relevant[i]
    if (windows.some(w => w.start <= span.start && w.end >= span.end)) continue
    const size = Math.min(left, Math.max(8, Math.floor(budget / Math.min(8, relevant.length))))
    const start = Math.max(0, Math.min(b.length - size, span.start - Math.min(80, Math.floor(size / 4))))
    const w = utf8Window(b, start, Math.min(b.length, start + size))
    if (w.end <= w.start) break
    windows.push(w); left -= w.end - w.start
  }
  windows.sort((a, b) => a.start - b.start)
  return { text: windows.map(w => `[bytes ${w.start}..${w.end} of ${b.length}] ${w.text}`).join(' … ') + ' (line truncated; read source for the complete line)', truncated: true }
}

export function matchingFragments(row) {
  if (row.unreadable) throw new Error('Exact fragments cannot be displayed as valid UTF-8; read the source bytes')
  const buffer = Buffer.from(row.rawLine ?? row.line)
  return row.spans.map(span => ({ ...row,
    lineNumber: row.lineNumber + buffer.subarray(0, span.start).toString('utf8').split('\n').length - 1,
    line: buffer.subarray(span.start, Math.min(span.end, buffer.length)).toString('utf8'),
    spans: [{ start: 0, end: Math.min(span.end, buffer.length) - span.start }],
  }))
}

export function retainSearch(rows, input, { lineBytes = 2000, metaBytes = 65536 } = {}) {
  const total = input.mode === 'content' ? rows.filter(r => r.kind === 'match').length : rows.length
  const selected = []; let matches = 0, bytes = 300, truncated = false
  for (const row of rows) {
    if (input.mode === 'content') {
      if (row.kind === 'match' && matches >= input.limit) { truncated = true; break }
      if (row.kind === 'match') matches++
    } else if (selected.length >= input.limit) { truncated = true; break }
    const preview = input.mode === 'content' ? matchPreview(row.line, row.spans, lineBytes) : undefined
    const kept = preview ? { path: row.path, lineNumber: row.lineNumber, line: preview.text, kind: row.kind,
      ...(row.line.includes('\n') ? { endLineNumber: row.lineNumber + row.line.split('\n').length - 1 } : {}) } : row
    const size = Buffer.byteLength(JSON.stringify(kept)) + 2
    if (bytes + size > metaBytes) { truncated = true; break }
    bytes += size; selected.push(kept)
    if (preview?.truncated) truncated = true
  }
  const summary = { mode: input.mode, total, shown: input.mode === 'content' ? selected.filter(r => r.kind === 'match').length : selected.length, complete: true, truncated,
    ...(input.mode === 'count' ? { countUnit: 'non-overlapping regex matches' } : {}) }
  const header = `${total} ${input.mode === 'files_with_matches' ? 'matching files' : input.mode === 'count' ? 'files with match counts (non-overlapping regex matches)' : 'matched records'}; showing ${summary.shown}; scan complete${truncated ? '; preview truncated' : ''}.`
  const text = [header, ...selected.map(row => input.mode === 'content'
    ? `${JSON.stringify(row.path)}:${row.lineNumber}${row.endLineNumber ? `-${row.endLineNumber}` : ''}${row.kind === 'context' ? '-' : ':'} ${row.line}`
    : input.mode === 'count' ? `${JSON.stringify(row.path)}: ${row.count}` : JSON.stringify(row.path))].join('\n')
  return { summary, rows: selected, text }
}
