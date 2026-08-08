import { api } from './client'
import type { DocumentNode, DocumentVersion, DocumentRole, PortalPermissions } from './types'

export async function fetchNodes(): Promise<DocumentNode[]> {
  const { data } = await api.get('/docs/nodes')
  return data.data || []
}

export async function createNode(body: Partial<DocumentNode>): Promise<DocumentNode> {
  const { data } = await api.post('/docs/nodes', body)
  return data.data
}

export async function updateNode(id: number, body: Partial<DocumentNode>): Promise<DocumentNode> {
  const { data } = await api.put(`/docs/nodes/${id}`, body)
  return data.data
}

export async function deleteNode(id: number): Promise<void> {
  await api.delete(`/docs/nodes/${id}`)
}

// 按 code 解析节点（用于 /d/:code 路由 deep-link），未命中返回 null。
export async function fetchNodeByCode(code: string): Promise<DocumentNode | null> {
  try {
    const { data } = await api.get(`/docs/nodes/code/${encodeURIComponent(code)}`)
    return data.data || null
  } catch (e: any) {
    if (e?.response?.status === 404) return null
    throw e
  }
}

export async function uploadFile(id: number, file: File, comment?: string): Promise<{ doc_type: string }> {
  const form = new FormData()
  form.append('file', file)
  if (comment) form.append('comment', comment)
  const { data } = await api.post(`/docs/nodes/${id}/upload`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function fetchVersions(id: number): Promise<DocumentVersion[]> {
  const { data } = await api.get(`/docs/nodes/${id}/versions`)
  return data.data || []
}

export async function revertVersion(id: number, versionId: number): Promise<void> {
  await api.post(`/docs/nodes/${id}/revert/${versionId}`)
}

export async function fetchContent(id: number): Promise<string> {
  const { data } = await api.get(`/docs/nodes/${id}/content`)
  return data.content || ''
}

export async function saveContent(id: number, content: string, comment?: string): Promise<void> {
  await api.put(`/docs/nodes/${id}/content`, { content, comment })
}

// 下载 URL（带 token 作为 query，便于 <a> / iframe 直接访问）。
export function downloadUrl(id: number): string {
  const token = localStorage.getItem('token') || ''
  return `/api/docs/nodes/${id}/download?token=${encodeURIComponent(token)}`
}

export async function fetchPortalPermissions(): Promise<PortalPermissions> {
  const { data } = await api.get('/docs/portal/permissions')
  return data
}

export async function fetchPermCatalog(): Promise<string[]> {
  const { data } = await api.get('/docs/perm-catalog')
  return data.data || []
}

// ---- 角色（管理端）----

export async function fetchRoles(): Promise<DocumentRole[]> {
  const { data } = await api.get('/docs/roles')
  return data.data || []
}

// 按 code 解析节点（用于 URL /d/:code 反向定位）。
export async function resolveNodeByCode(code: string): Promise<DocumentNode | null> {
  try {
    const { data } = await api.get(`/docs/nodes/code/${encodeURIComponent(code)}`)
    return data.data || null
  } catch {
    return null
  }
}

// 生成 URL 友好的 code 片段（与后端 normalizeDocCode 规则保持一致）。
// 用于前端表单「编码」字段的实时预览，让用户看到默认 slug。
export function slugifyCode(s: string): string {
  const lower = s.trim().toLowerCase()
  if (!lower) return ''
  let out = ''
  let prevSep = ''
  for (const ch of lower) {
    const code = ch.charCodeAt(0)
    const isAlnum =
      (code >= 0x61 && code <= 0x7a) || // a-z
      (code >= 0x30 && code <= 0x39) // 0-9
    if (isAlnum) {
      out += ch
      prevSep = ''
    } else if (ch === '-') {
      if (prevSep === '-' || prevSep === '_') continue
      out += '-'
      prevSep = '-'
    } else if (ch === '_') {
      if (prevSep === '_') continue
      out += '_'
      prevSep = '_'
    } else {
      if (prevSep === '-' || prevSep === '_') continue
      out += '-'
      prevSep = '-'
    }
  }
  return out.replace(/^[-_]+|[-_]+$/g, '').slice(0, 100)
}

export async function createRole(body: { name: string; code?: string; description?: string }): Promise<DocumentRole> {
  const { data } = await api.post('/docs/roles', body)
  return data.data
}

export async function updateRole(id: number, body: { name: string; code?: string; description?: string }): Promise<DocumentRole> {
  const { data } = await api.put(`/docs/roles/${id}`, body)
  return data.data
}

export async function deleteRole(id: number): Promise<void> {
  await api.delete(`/docs/roles/${id}`)
}

export async function setRoleNodes(id: number, nodes: { node_id: number; perms: string[] }[]): Promise<void> {
  await api.put(`/docs/roles/${id}/nodes`, { nodes })
}

export async function setRoleUsers(id: number, userIds: number[]): Promise<void> {
  await api.put(`/docs/roles/${id}/users`, { user_ids: userIds })
}

export interface SimpleUser {
  id: number
  username: string
  role: string
}

// 拉取系统用户列表（仅 admin 可访问），用于角色-用户分配。
export async function fetchUsers(): Promise<SimpleUser[]> {
  const { data } = await api.get('/users')
  return data.data || []
}

// 平铺文档节点树为 { id, name, depth } 列表，供节点授权面板选择。
export function flattenNodes(
  nodes: DocumentNode[],
  depth = 0,
  out: { id: number; name: string; depth: number }[] = [],
): { id: number; name: string; depth: number }[] {
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, depth })
    if (n.children) flattenNodes(n.children, depth + 1, out)
  }
  return out
}

// ---- 当前用户（协同 awareness 显示用户名）----

export interface CurrentUser {
  id: number
  username: string
  // server-side role: 'admin' | 'operator' | 'viewer'
  role?: string
  // 可选扩展字段（avatar / display_name 等）。
  [k: string]: any
}

// fetchMe 拉取当前登录用户；用于协同 awareness 中显示用户名。
// 后端：GET /api/me（auth.AuthMiddleware）。
export async function fetchMe(): Promise<CurrentUser | null> {
  try {
    const { data } = await api.get('/me')
    return data?.data || null
  } catch {
    return null
  }
}

// pickUserColor 给定用户名/ID 生成稳定的 hex 颜色（HSL 黄金角度采样 + 限定饱和/亮度，确保可读）。
// 同一用户名多次访问颜色一致，便于识别。
export function pickUserColor(seed: string): string {
  const s = (seed || '').trim() || Math.random().toString(36).slice(2)
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0
  const hue = Math.abs(hash) % 360
  // 70% 饱和、55% 亮度：背景填充时仍能与白底文字（label）保持对比。
  return hslToHex(hue, 70, 45)
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ln - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// initials 取用户名首字（或前 2 字符），用于头像缩写显示。
export function initialsOf(name: string, max = 2): string {
  const s = (name || '').trim()
  if (!s) return '?'
  // 优先取大写字母（英文名），否则取前 1-2 个非空字符。
  const upper = s.match(/[A-Z]/g)
  if (upper && upper.length > 0) return upper.slice(0, max).join('').toUpperCase()
  // 中文名取最后 1-2 字（姓在前名在后，符合中文显示习惯）。
  const chars = Array.from(s).filter((c) => c.trim())
  if (chars.length === 0) return '?'
  return chars.slice(-max).join('')
}

// ---- 项目管理（Document Projects）----

export async function fetchProjectCategories(): Promise<import('./types').DocumentProjectCategory[]> {
  const { data } = await api.get('/docs/project-categories')
  return data.data || []
}

export async function createProjectCategory(body: {
  name: string
  code?: string
  description?: string
  icon?: string
  color?: string
  sort_order?: number
}): Promise<import('./types').DocumentProjectCategory> {
  const { data } = await api.post('/docs/project-categories', body)
  return data.data
}

export async function updateProjectCategory(
  id: number,
  body: {
    name: string
    code?: string
    description?: string
    icon?: string
    color?: string
    sort_order?: number
  },
): Promise<import('./types').DocumentProjectCategory> {
  const { data } = await api.put(`/docs/project-categories/${id}`, body)
  return data.data
}

export async function deleteProjectCategory(id: number): Promise<void> {
  await api.delete(`/docs/project-categories/${id}`)
}

export async function fetchProjects(): Promise<import('./types').DocumentProject[]> {
  const { data } = await api.get('/docs/projects')
  return data.data || []
}

export async function fetchProjectByCode(code: string): Promise<import('./types').DocumentProject | null> {
  try {
    const { data } = await api.get(`/docs/projects/code/${encodeURIComponent(code)}`)
    return data.data || null
  } catch (e: any) {
    if (e?.response?.status === 404) return null
    throw e
  }
}

export async function createProject(body: {
  name: string
  code?: string
  description?: string
  icon?: string
  color?: string
  category_id?: number | null
  sort_order?: number
  root_node_id?: number | null
}): Promise<import('./types').DocumentProject> {
  const { data } = await api.post('/docs/projects', body)
  return data.data
}

export async function updateProject(
  id: number,
  body: {
    name: string
    code?: string
    description?: string
    icon?: string
    color?: string
    category_id?: number | null
    sort_order?: number
    root_node_id?: number | null
  },
): Promise<import('./types').DocumentProject> {
  const { data } = await api.put(`/docs/projects/${id}`, body)
  return data.data
}

export async function deleteProject(id: number): Promise<void> {
  await api.delete(`/docs/projects/${id}`)
}

export async function updateDocumentAnchors(id: number, anchors: import('./types').DocumentAnchor[]): Promise<void> {
  await api.put(`/docs/nodes/${id}/anchors`, { anchors })
}
