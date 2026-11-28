import { hostImport } from './host-modules.mjs?v=0.2.24'
import { parseEnhancedArgs, enhancedCommand, parseSearchOutput, matchingFragments, retainSearch } from './grep-engine.mjs'
const official = await hostImport('dsh-tool-fs-search')
const { defineTool, ToolArgsError } = await hostImport('dsh-tools')
export const name = 'grep-enhanced'
export const inject = official.inject
export const Config = official.Config

export async function apply(ctx, config) {
  const required = ['applyGlobTool', 'runRipgrep', 'parseGrepArgs', 'toWorkdirRelative', 'trySaveFormattedResult']
  if (required.some(key => typeof official[key] !== 'function')) return official.apply(ctx, config)
  official.applyGlobTool(ctx, { sampleOverCapGlobResults: config.sampleOverCapGlobResults, maxResults: config.globMaxResults, maxMetaBytes: config.searchMetaMaxBytes,
    rawOutputMaxBytes: config.rawOutputMaxBytes, graceMs: config.graceMs, stderrMaxBytes: config.stderrMaxBytes, timeoutMs: config.timeoutMs })
  ctx.systemPrompt.section({ name: 'tool:grep', order: ctx.systemPrompt.getSectionOrder('TOOL_GREP'),
    text: 'Use grep to search file contents with ripgrep regular expressions. Choose content, files_with_matches, or count for the evidence needed. ' +
      'Request context or exact fragments when needed; multiline explicitly enables dotall. Truncated previews are not complete source lines. Read the source for full surrounding code.' })
  ctx.tools.register(defineTool({
    name: 'grep',
    description: 'Search file contents using ripgrep regex. Returns matching content with line numbers, matching filenames, or per-file match counts. Optional context, exclusion globs, multiline and exact fragments. Reports scan completion, preview truncation, and complete-result references.',
    parameters: {
      pattern: { type: 'string', required: true, description: 'Ripgrep regular expression; inline (?i) enables case-insensitive matching.' },
      path: { type: 'string', description: 'File or directory; defaults to the session workspace.' },
      include: { type: 'string', description: 'One positive glob, e.g. *.{ts,tsx}.' },
      output_mode: { type: 'string', enum: ['content', 'files_with_matches', 'count'], description: 'Default content. count reports non-overlapping regex matches per file.' },
      context: { type: 'integer', description: 'Lines before and after a match, 0–50.' },
      before_context: { type: 'integer', description: 'Override context before matches, 0–50.' },
      after_context: { type: 'integer', description: 'Override context after matches, 0–50.' },
      only_matching: { type: 'boolean', description: 'Exact matched fragments in content mode; cannot be combined with context.' },
      exclude: { type: 'array', items: { type: 'string' }, description: 'Up to 32 positive globs to exclude.' },
      multiline: { type: 'boolean', description: 'Enable multiline regex and dotall; default false.' },
      head_limit: { type: 'integer', description: `Maximum shown matched records or file entries, 1–${config.grepMaxMatches}.` },
    },
    timeoutMs: config.timeoutMs, isConcurrencySafe: () => true,
    output: { schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: value.view.text + (value.spillRef ? `\nComplete result: ${JSON.stringify(value.spillRef.locator ?? value.spillRef.path ?? value.spillRef)}` : '') }],
      presentationMeta: (_args, value) => value.presentation ?? {},
    },
    presentCall: official.presentGrepCall,
    presentResult: (_args, result) => result.isError ? undefined : result.meta?.shape === 'matches' ? official.presentGrepResult(_args, result) : undefined,
    async execute(args, exec) {
      let input
      try { input = parseEnhancedArgs(args, official.parseGrepArgs, config.grepMaxMatches) }
      catch (error) { throw new ToolArgsError([error.message]) }
      const run = await official.runRipgrep(ctx, exec, 'grep', enhancedCommand(input), config.rawOutputMaxBytes, config.graceMs, config.stderrMaxBytes)
      let rows
      try { rows = parseSearchOutput(run.stdout, input.mode, path => official.toWorkdirRelative(path, run.workdir)) }
      catch (cause) { throw new official.SearchError('Malformed ripgrep output', 'SEARCH_FAILED', { cause }) }
      if (input.onlyMatching) rows = rows.filter(r => r.kind === 'match').flatMap(matchingFragments)
      const view = retainSearch(rows, input, { lineBytes: config.grepMaxLineBytes, metaBytes: Math.max(300, Math.floor(config.searchMetaMaxBytes / 2)) })
      const files = new Map()
      for (const row of view.rows) if (row.lineNumber !== undefined) {
        if (!files.has(row.path)) files.set(row.path, [])
        files.get(row.path).push({ lineNumber: row.lineNumber, line: `${row.kind === 'context' ? '[context] ' : ''}${row.endLineNumber ? `[lines ${row.lineNumber}–${row.endLineNumber}] ` : ''}${row.line}` })
      }
      const presentation = input.mode === 'content' ? { shape: 'matches', files: [...files].map(([path, matches]) => ({ path, matches })), total: view.summary.total, truncated: view.summary.truncated } : undefined
      let spillRef
      if (view.summary.truncated) {
        // Persist all record previews with their locations; oversized individual lines remain explicitly marked.
        const all = retainSearch(rows, { ...input, limit: Number.MAX_SAFE_INTEGER }, { lineBytes: config.grepMaxLineBytes, metaBytes: config.rawOutputMaxBytes * 2 })
        spillRef = await official.trySaveFormattedResult(ctx, exec, 'grep-results.txt', all.text)
      }
      exec.signal.throwIfAborted()
      return { ...(input.mode === 'content' ? { matches: rows.filter(r => r.kind === 'match').map(({ path, lineNumber, line }) => ({ path, lineNumber, line })) } : {}),
        view, ...(presentation ? { presentation } : {}), ...(spillRef ? { spillRef } : {}) }
    },
  }))
}
