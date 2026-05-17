// Auth, User, API Key schemas

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  user: User
}

export interface RegisterRequest {
  username: string
  password: string
}

export interface User {
  id: number
  username: string
  /** "admin" | "operator" | "viewer" */
  role: string
  created_at: string
  last_login_at: string | null
}

export interface MeResponse {
  data: User
}

// API Keys

export interface ApiKey {
  id: number
  user_id: number
  name: string
  key: string
  /** JSON array of scope strings, e.g. ["open:devices:list"] */
  permissions: string
  expires_at: string | null
  last_used_at: string | null
  revoked: boolean
  created_at: string
}

export interface CreateApiKeyRequest {
  name: string
  expires_at?: string | null
  scopes?: OpenScope[]
}

export interface CreateApiKeyResponse {
  data: ApiKey
}

export interface ListApiKeysResponse {
  data: ApiKey[]
}

// Scopes

/** Open API scopes for X-API-Key authentication */
export type OpenScope =
  | 'open:devices:list'
  | 'open:devices:info'
  | 'open:devices:apps'
  | 'open:apps:upload'
  | 'open:apps:install'
  | 'open:tasks:get'
  | 'open:events:list'
  | 'open:dataiface:query'
  | 'open:dataiface:write'

/** Screen share link scopes */
export type ScreenShareScope =
  | 'screen:view'
  | 'screen:touch'
  | 'screen:stop'

export interface ScopeDescription {
  id: string
  name: string
}

export interface ScopeCatalogResponse {
  open: ScopeDescription[]
  screen_share: ScopeDescription[]
}

// Screen share links

export interface ScreenShareLink {
  id: number
  device_id: number
  scopes_json: string
  expires_at: string | null
  revoked: boolean
  created_by: number
  last_used_at: string | null
  created_at: string
}
