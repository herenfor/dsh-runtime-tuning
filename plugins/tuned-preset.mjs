// Keep the official preset lifecycle and schema; only anchor our own child module.
import { hostImport } from './host-modules.mjs?v=0.2.24'
import { resolvePresetConfig } from './tool-use-prompt.mjs?v=0.2.24'

const { default: OfficialPreset } = await hostImport('dsh-agent-preset')

export default class RuntimeTuningPreset extends OfficialPreset {
  constructor(ctx, config) {
    super(ctx, resolvePresetConfig(config))
  }
}
