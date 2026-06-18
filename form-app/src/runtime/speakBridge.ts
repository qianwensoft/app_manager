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
  return b && typeof b.speak === 'function' ? b : null
}

function pickChineseVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | undefined {
  const voices = synth.getVoices() || []
  return voices.find(v => /^zh\b|^cmn\b|-CN|-TW|-HK|Chinese|中文|普通话/i.test(`${v.lang} ${v.name}`))
}

function speakBrowser(msg: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
  const synth = window.speechSynthesis
  const utter = () => {
    try {
      const u = new SpeechSynthesisUtterance(msg)
      u.lang = 'zh-CN'
      const zh = pickChineseVoice(synth)
      if (zh) u.voice = zh
      // 部分浏览器在长时间不发声后进入 paused 态，先 resume 再 speak。
      try { synth.resume() } catch { /* ignore */ }
      synth.speak(u)
    } catch { /* ignore */ }
  }
  // voices 尚未就绪时，等 voiceschanged 再播；同时兜底直接尝试（事件可能已触发过）。
  if ((synth.getVoices() || []).length === 0) {
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
  if (!msg) return false

  const bridge = getBridge()
  if (bridge?.speak) {
    try { bridge.speak(msg); return true } catch { /* 落到浏览器降级 */ }
  }

  return speakBrowser(msg)
}

/** 当前环境是否存在可用的语音通道（Agent 桥或浏览器 TTS）。 */
export function isSpeakAvailable(): boolean {
  if (getBridge()) return true
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}
