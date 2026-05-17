// Device schemas

export interface Device {
  id: number
  user_id: number | null
  serial: string
  name: string
  model: string
  brand: string
  os_version: string
  sdk_version: number
  cpu_info: string
  total_memory: number
  total_storage: number
  storage_used: number
  resolution: string
  ip_address: string
  status: 'online' | 'offline'
  agent_connected: boolean
  /** Unique token used for agent WebSocket auth and QR onboarding */
  agent_token: string
  agent_version: string
  battery: number
  cpu_usage: number
  memory_used: number
  memory_total: number
  ip: string
  network_type: string
  wifi_ssid: string
  wifi_signal: number
  wifi_speed: number
  network_connected: boolean
  group_name: string
  server_alias: string
  agent_alias: string
  allow_remote_screen: boolean
  android_serial: string
  wireless_adb_serial: string
  last_seen_at: string | null
  agent_menu_revision: number
  created_at: string
}

export interface ListDevicesResponse {
  data: Device[]
}

export interface GetDeviceResponse {
  data: Device
}

export interface CreateDeviceRequest {
  serial: string
  name?: string
}

export interface UpdateDeviceRequest {
  name?: string
  group_name?: string | null
  server_alias?: string | null
  /** null = no change; "" = clear; non-empty = bind (must be globally unique) */
  agent_token?: string | null
}

export interface DeviceInfo {
  model: string
  brand: string
  os_version: string
  sdk_version: number
  resolution: string
  ip_address: string
  battery: number
  cpu_usage: number
  memory_used: number
  memory_total: number
  total_memory: number
  total_storage: number
  storage_used: number
  network_type: string
  wifi_ssid: string
  wifi_signal: number
  wifi_speed: number
  network_connected: boolean
}

export interface InstalledApp {
  package_name: string
  version_name: string
  version_code: number
  app_label: string
  is_system: boolean
}

export interface GetDeviceAppsResponse {
  data: InstalledApp[]
}

export interface ConnectDeviceRequest {
  ip: string
  port?: number
}

export interface AdbConnectByAgentIPRequest {
  port?: number
  ip?: string
}

export interface AdbPairByAgentIPRequest {
  port: number
  code: string
  ip?: string
}

export interface AdbStatusEntry {
  serial: string
  /** "device" | "offline" | "unauthorized" | "no_device" | "not_configured" */
  state: string
}

export interface AdbStatusResponse {
  usb: AdbStatusEntry
  wireless: AdbStatusEntry
}

export interface DeviceMedia {
  id: number
  device_id: number
  /** "screenshot" | "audio" */
  category: string
  file_name: string
  file_size: number
  content_type: string
  created_at: string
}

export interface AuditLog {
  id: number
  user_id: number
  device_id: number | null
  action: string
  command: string
  ip_address: string
  result: string
  created_at: string
}

export interface DeviceEvent {
  id: number
  device_id: number
  event_type: string
  event_data: string
  created_at: string
}
