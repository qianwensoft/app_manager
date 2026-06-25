import { registerTool } from './types'
import { speak } from '../speakBridge'

/** 语音播报 */
registerTool({
  name: 'speak',
  execute: async (a, { deps, resolve }) => {
    const text = resolve(a.text_src)
    if (text !== undefined && text !== null && String(text).trim() !== '') {
      const ok = speak(String(text))
      if (!ok) deps.toast?.('当前环境不支持语音播报')
    }
  },
})
