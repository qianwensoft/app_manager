import { create } from 'zustand'
import type { DocumentNode, PortalPermissions } from './api/types'

interface DocsState {
  selectedNode: DocumentNode | null
  perms: PortalPermissions | null
  aiOpen: boolean
  // 免登录分享模式：由 URL ?share=<token> 触发，此时所有写操作不可用，权限恒为只读。
  shareMode: boolean
  shareToken: string
  setSelectedNode: (n: DocumentNode | null) => void
  setPerms: (p: PortalPermissions | null) => void
  toggleAI: () => void
  setShareMode: (token: string) => void
  // 判定当前用户对某节点是否具备指定权限（admin 恒 true，share 模式恒 false）。
  can: (nodeId: number, perm: string) => boolean
}

export const useDocsStore = create<DocsState>((set, get) => ({
  selectedNode: null,
  perms: null,
  aiOpen: false,
  shareMode: false,
  shareToken: '',
  setSelectedNode: (n) => set({ selectedNode: n }),
  setPerms: (p) => set({ perms: p }),
  toggleAI: () => set((s) => ({ aiOpen: !s.aiOpen })),
  setShareMode: (token) => set({ shareMode: !!token, shareToken: token }),
  can: (nodeId, perm) => {
    if (get().shareMode) return false
    const p = get().perms
    if (!p) return false
    if (p.is_admin) return true
    const keys = p.perms[String(nodeId)]
    return !!keys && keys.includes(perm)
  },
}))
