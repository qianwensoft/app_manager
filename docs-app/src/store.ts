import { create } from 'zustand'
import type { DocumentNode, PortalPermissions } from './api/types'

interface DocsState {
  selectedNode: DocumentNode | null
  perms: PortalPermissions | null
  aiOpen: boolean
  setSelectedNode: (n: DocumentNode | null) => void
  setPerms: (p: PortalPermissions | null) => void
  toggleAI: () => void
  // 判定当前用户对某节点是否具备指定权限（admin 恒 true）。
  can: (nodeId: number, perm: string) => boolean
}

export const useDocsStore = create<DocsState>((set, get) => ({
  selectedNode: null,
  perms: null,
  aiOpen: false,
  setSelectedNode: (n) => set({ selectedNode: n }),
  setPerms: (p) => set({ perms: p }),
  toggleAI: () => set((s) => ({ aiOpen: !s.aiOpen })),
  can: (nodeId, perm) => {
    const p = get().perms
    if (!p) return false
    if (p.is_admin) return true
    const keys = p.perms[String(nodeId)]
    return !!keys && keys.includes(perm)
  },
}))
