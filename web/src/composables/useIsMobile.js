import { ref, onMounted, onBeforeUnmount } from 'vue'

/**
 * 共享的移动端断点检测。
 * 返回一个响应式 `isMobile`（视口宽度 < breakpoint 时为 true），
 * 并自动在挂载/卸载时管理 resize 监听。
 *
 * @param {number} breakpoint 断点像素值，默认 768
 */
export function useIsMobile(breakpoint = 768) {
  const query = `(max-width: ${breakpoint - 1}px)`
  const getMatch = () => {
    if (typeof window === 'undefined') return false
    if (typeof window.matchMedia === 'function') return window.matchMedia(query).matches
    return window.innerWidth < breakpoint
  }

  const isMobile = ref(getMatch())

  let mql = null
  const onChange = () => { isMobile.value = getMatch() }

  onMounted(() => {
    if (typeof window === 'undefined') return
    if (typeof window.matchMedia === 'function') {
      mql = window.matchMedia(query)
      // Safari < 14 仅支持 addListener
      if (mql.addEventListener) mql.addEventListener('change', onChange)
      else if (mql.addListener) mql.addListener(onChange)
    } else {
      window.addEventListener('resize', onChange)
    }
    onChange()
  })

  onBeforeUnmount(() => {
    if (mql) {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange)
      else if (mql.removeListener) mql.removeListener(onChange)
    } else if (typeof window !== 'undefined') {
      window.removeEventListener('resize', onChange)
    }
  })

  return { isMobile }
}

export default useIsMobile
