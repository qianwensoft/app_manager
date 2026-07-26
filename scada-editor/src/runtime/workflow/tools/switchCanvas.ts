import { registerTool } from './types'
import type { SwitchCanvasAction } from '@/types/workflow'

/** 切换画布 */
registerTool({
  name: 'switch_canvas',
  execute: async (action, { deps }) => {
    const a = action as SwitchCanvasAction
    if (a.canvasId == null) return
    deps.switchCanvas?.(a.canvasId)
  },
})
