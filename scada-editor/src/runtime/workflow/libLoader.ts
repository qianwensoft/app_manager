/**
 * 外部脚本库动态加载器。
 *
 * 两条通道（对应 WorkflowLib.source）：
 *  - url：直接注入远程/相对 URL 的 <script>
 *  - upload：上传到 /api/scada/resource 得到 URL 后同样注入 <script>
 *
 * 库以 UMD 形式在 window 暴露全局变量（globalVar 或 name），加载后镜像到内部表，
 * 供 scriptApi 的 ctx.libs.<name> 访问。已加载的库按 name 去重缓存。
 */
import type { WorkflowLib } from '@/types/workflow'

const loaded = new Map<string, unknown>()
const loadingPromises = new Map<string, Promise<unknown>>()

/** 取所有已加载库（供 ctx.libs 注入） */
export function getLoadedLibs(): Record<string, unknown> {
  return Object.fromEntries(loaded.entries())
}

/** 清空已加载库（切换组态/退出预览时调用） */
export function resetLoadedLibs(): void {
  loaded.clear()
  loadingPromises.clear()
}

function injectScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 已存在同 src 的 script 标签则复用
    const existing = document.querySelector<HTMLScriptElement>(`script[data-wf-lib="${CSS.escape(url)}"]`)
    if (existing) {
      if (existing.dataset.loaded === '1') return resolve()
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error(`库加载失败：${url}`)))
      return
    }
    const el = document.createElement('script')
    el.src = url
    el.async = true
    el.dataset.wfLib = url
    el.addEventListener('load', () => { el.dataset.loaded = '1'; resolve() })
    el.addEventListener('error', () => reject(new Error(`库加载失败：${url}`)))
    document.head.appendChild(el)
  })
}

/** 加载单个库；返回其全局导出对象 */
export async function loadLib(lib: WorkflowLib): Promise<unknown> {
  if (!lib.name || !lib.url) throw new Error('库配置缺少 name/url')
  if (loaded.has(lib.name)) return loaded.get(lib.name)
  const cached = loadingPromises.get(lib.name)
  if (cached) return cached

  const p = (async () => {
    await injectScript(lib.url)
    const globalVar = lib.globalVar || lib.name
    const exported = (window as unknown as Record<string, unknown>)[globalVar]
    loaded.set(lib.name, exported)
    return exported
  })()
  loadingPromises.set(lib.name, p)
  try {
    return await p
  } finally {
    loadingPromises.delete(lib.name)
  }
}

/** 批量加载库清单（并行，单个失败不影响其它） */
export async function loadLibs(libs: WorkflowLib[] | undefined): Promise<void> {
  if (!libs || libs.length === 0) return
  await Promise.all(
    libs.map((lib) =>
      loadLib(lib).catch((e) => {
        console.error(`[workflow] ${e?.message || e}`)
      }),
    ),
  )
}
