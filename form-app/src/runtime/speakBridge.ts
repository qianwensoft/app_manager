/**
 * 语音播报桥接：
 * - Agent WebView 内：优先 window.AndroidBridge.speak(text)，由原生 TextToSpeech 播报。
 * - 纯浏览器：降级用 Web Speech API（speechSynthesis），默认中文。
 * 两者都不可用时返回 false，调用方可据此提示。
 *
 * 说明：
 * - 浏览器 voices 是异步加载的，首次 getVoices() 可能为空，这里监听 onvoiceschanged。
 * - 不在 speak 前调用 cancel()：Chrome 已知 bug 会把紧跟的 speak 一起吞掉导致不发声。
 * - 浏览器自动播放策略：无用户手势（如 page_enter）时可能被拦截，需要一次交互后才放行。
 */

interface AndroidSpeakBridge {
  speak?: (text: string) => void
}

function getBridge(): AndroidSpeakBridge | null {
  if (typeof window === 'undefined') return null
  const b = (window as any).AndroidBridge as AndroidSpeakBridge | undefined
  console.debug('[speakBridge] AndroidBridge exists:', !!b, 'speak method exists:', typeof b?.speak)
  return b && typeof b.speak === 'function' ? b : null
}

function pickChineseVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | undefined {
  const voices = synth.getVoices() || []
  return voices.find(v => /^zh\b|^cmn\b|-CN|-TW|-HK|Chinese|中文|普通话/i.test(`${v.lang} ${v.name}`))
}

function speakBrowser(msg: string): boolean {
  console.debug('[speakBridge] speakBrowser called with:', msg)
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('[speakBridge] Browser speechSynthesis not available')
    return false
  }
  const synth = window.speechSynthesis
  const utter = () => {
    try {
      const u = new SpeechSynthesisUtterance(msg)
      u.lang = 'zh-CN'
      const zh = pickChineseVoice(synth)
      if (zh) u.voice = zh
      console.debug('[speakBridge] Browser TTS: speaking with voice:', zh?.name || 'default')
      // 部分浏览器在长时间不发声后进入 paused 态，先 resume 再 speak。
      try { synth.resume() } catch { /* ignore */ }
      synth.speak(u)
    } catch (e) {
      console.warn('[speakBridge] Browser TTS error:', e)
    }
  }
  // voices 尚未就绪时，等 voiceschanged 再播；同时兜底直接尝试（事件可能已触发过）。
  if ((synth.getVoices() || []).length === 0) {
    console.debug('[speakBridge] Browser TTS: voices not loaded, waiting for voiceschanged')
    const once = () => { synth.onvoiceschanged = null; utter() }
    synth.onvoiceschanged = once
    setTimeout(utter, 250)
  } else {
    utter()
  }
  return true
}

/**
 * 播报文本。返回是否找到可用的播报通道（不代表已实际发声——浏览器可能被自动播放策略拦截）。
 */
export function speak(text: string): boolean {
  const msg = (text ?? '').toString().trim()
  console.debug('[speakBridge] speak called with:', msg)
  if (!msg) return false

  const bridge = getBridge()
  if (bridge?.speak) {
    console.debug('[speakBridge] Calling AndroidBridge.speak...')
    try {
      bridge.speak(msg)
      console.debug('[speakBridge] AndroidBridge.speak called successfully')
      return true
    } catch (e) {
      console.warn('[speakBridge] AndroidBridge.speak threw:', e, ', falling back to browser TTS')
    }
  } else {
    console.debug('[speakBridge] No AndroidBridge.speak, falling back to browser TTS')
  }

  return speakBrowser(msg)
}

/** 当前环境是否存在可用的语音通道（Agent 桥或浏览器 TTS）。 */
export function isSpeakAvailable(): boolean {
  const bridge = getBridge()
  const browserTts = typeof window !== 'undefined' && 'speechSynthesis' in window
  console.debug('[speakBridge] isSpeakAvailable: bridge=', !!bridge, 'browserTts=', browserTts)
  if (bridge) return true
  return browserTts
}
