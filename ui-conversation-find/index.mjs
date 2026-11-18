import { hostImport } from '../plugins/host-modules.mjs'

const { default: z } = await hostImport('schemastery')

export const name = 'dsh-runtime-tuning-conversation-find'

export const Config = z.object({
  interceptCtrlFOnWeb: z.boolean()
    .default(false)
    .description(
      '在网页端（dsh-web）接管 Ctrl+F / Cmd+F 打开全历史查找条；默认关闭并保留浏览器原生查找。 / ' +
      'Intercept Ctrl+F / Cmd+F in dsh-web to open the full-history find bar (default false, keeps native browser find).',
    )
    .volatile(),
})

export function apply() {}
