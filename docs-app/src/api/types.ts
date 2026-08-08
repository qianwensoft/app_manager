// 文档管理数据类型定义。

export type DocNodeType = 'folder' | 'doc' | 'form_app'
export type DocType =
  | 'markdown'
  | 'word'
  | 'excel'
  | 'ppt'
  | 'pdf'
  | 'image'
  | 'video'
  | 'other'
  | ''

export interface DocumentNode {
  id: number
  parent_id: number | null
  name: string
  // code：URL 编码，用于路由 /d/:code 定位节点；默认 = name 的 slug，同级下唯一。
  code: string
  node_type: DocNodeType
  doc_type: DocType
  icon?: string
  sort_order: number
  storage_path?: string
  mime_type?: string
  size_bytes?: number
  current_version_id?: number | null
  config_json?: string
  created_by?: number
  children?: DocumentNode[]
  created_at?: string
  updated_at?: string
}

export interface DocumentVersion {
  id: number
  node_id: number
  version: number
  storage_path: string
  size_bytes: number
  mime_type: string
  changed_by: number
  comment: string
  created_at: string
}

export interface DocumentRoleNodePerm {
  node_id: number
  perms: string[]
}

export interface DocumentRole {
  id: number
  name: string
  code: string
  description: string
  created_at?: string
  updated_at?: string
  nodes: DocumentRoleNodePerm[]
  user_ids: number[]
}

export interface PortalPermissions {
  is_admin: boolean
  perms: Record<string, string[]>
}

export interface DocumentAnchor {
  id: string
  label: string
  level: number
}

export interface DocumentNodeConfig {
  form_code?: string
  page_key?: string
  open_mode?: string
  anchors?: DocumentAnchor[]
}

export interface DocumentProjectCategory {
  id: number
  name: string
  code: string
  description: string
  icon?: string
  color?: string
  sort_order: number
  created_at?: string
  updated_at?: string
}

export interface DocumentProject {
  id: number
  name: string
  code: string
  description: string
  icon?: string
  color?: string
  category_id?: number | null
  sort_order: number
  root_node_id?: number | null
  created_by?: number
  created_at?: string
  updated_at?: string
  root_node_name?: string
}
