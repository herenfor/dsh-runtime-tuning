// Keep the official preset lifecycle and schema; only anchor our own child module.
import { hostImport } from './host-modules.mjs'
import { resolvePresetConfig } from './tool-use-prompt.mjs'

const { default: OfficialPreset } = await hostImport('dsh-agent-preset')

export default class RuntimeTuningPreset extends OfficialPreset {
  constructor(ctx, config) {
    super(ctx, resolvePresetConfig(config))
  }
}
