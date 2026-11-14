// Keep the official preset lifecycle and schema; only anchor our own child module.
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { findHostPackage } from './chat-answer-fix.mjs'
import { resolvePresetConfig } from './tool-use-prompt.mjs'

const directory = findHostPackage(process.argv[1], 'dsh-agent-preset')
const { default: OfficialPreset } = await import(pathToFileURL(join(directory, 'lib/index.js')).href)

export default class RuntimeTuningPreset extends OfficialPreset {
  constructor(ctx, config) {
    super(ctx, resolvePresetConfig(config))
  }
}
