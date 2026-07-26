import { registerTool } from './types'
import type { OpenModalAction, CloseModalAction } from '@/types/workflow'

/** 打开模态（target=模态元素 id） */
registerTool({
  name: 'open_modal',
  execute: async (action, { deps }) => {
    const a = action as OpenModalAction
    if (a.target) deps.openModal?.(a.target)
  },
})

/** 关闭模态（target=模态元素 id） */
registerTool({
  name: 'close_modal',
  execute: async (action, { deps }) => {
    const a = action as CloseModalAction
    if (a.target) deps.closeModal?.(a.target)
  },
})
