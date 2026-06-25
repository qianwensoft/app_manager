// Agent WebSocket command protocol
// All messages are JSON over WebSocket at /ws/agent/:deviceToken
// Direction: Server→Agent (commands) and Agent→Server (responses/events)

// --- Base envelope ---

export interface AgentMessage {
  type: string
  action?: string
  /** Correlates request/response pairs */
  commandId?: string
  data?: unknown
}

// --- Server → Agent commands ---

export interface StartScreenCommand {
  type: 'command'
  action: 'start_screen'
}

export interface StopScreenCommand {
  type: 'command'
  action: 'stop_screen'
}

export interface StartShellCommand {
  type: 'command'
  action: 'start_shell'
}

export interface StopShellCommand {
  type: 'command'
  action: 'stop_shell'
}

export interface ShellInputCommand {
  type: 'command'
  action: 'shell_input'
  data: { command: string }
}

export interface StartLogcatCommand {
  type: 'command'
  action: 'start_logcat'
  data: { filter?: string }
}

export interface StopLogcatCommand {
  type: 'command'
  action: 'stop_logcat'
}

export interface CaptureScreenshotCommand {
  type: 'command'
  action: 'capture_screenshot'
  data: { request_id: string }
}

export interface InstallAppCommand {
  type: 'command'
  action: 'install_app'
  commandId: string
  data: {
    task_id: number
    app_id: number
    fetch_url: string
    fetch_token: string
    package_name?: string
    start_after_install: boolean
  }
}

export interface ListInstalledAppsCommand {
  type: 'command'
  action: 'list_installed_apps'
  data: { request_id: string }
}

export interface ExportInstalledApkCommand {
  type: 'command'
  action: 'export_installed_apk'
  data: {
    request_id: string
    package_name: string
    upload_path: string
  }
}

export interface PushDeviceInfoCommand {
  type: 'command'
  action: 'push_device_info'
  data: { request_id: string }
}

export interface StartAudioRecordingCommand {
  type: 'command'
  action: 'start_audio_recording'
}

export interface StopAudioRecordingCommand {
  type: 'command'
  action: 'stop_audio_recording'
}

export interface StartCameraCommand {
  type: 'command'
  action: 'start_camera'
  camera: 'back' | 'front'
}

export interface StopCameraCommand {
  type: 'command'
  action: 'stop_camera'
  camera: 'back' | 'front'
}

export interface BroadcastIntentCommand {
  type: 'command'
  action: 'broadcast_intent'
  data: {
    intent_action: string
    extras?: Record<string, string>
  }
}

export interface ViewUrlCommand {
  type: 'command'
  action: 'view_url'
  data: { url: string }
}

export type ServerToAgentCommand =
  | StartScreenCommand
  | StopScreenCommand
  | StartShellCommand
  | StopShellCommand
  | ShellInputCommand
  | StartLogcatCommand
  | StopLogcatCommand
  | CaptureScreenshotCommand
  | InstallAppCommand
  | ListInstalledAppsCommand
  | ExportInstalledApkCommand
  | PushDeviceInfoCommand
  | StartAudioRecordingCommand
  | StopAudioRecordingCommand
  | StartCameraCommand
  | StopCameraCommand
  | BroadcastIntentCommand
  | ViewUrlCommand

// --- Agent → Server messages ---

/** Periodic heartbeat with live device stats */
export interface HeartbeatMessage {
  type: 'heartbeat'
  data: {
    battery: number
    cpu_usage: number
    memory_used: number
    memory_total: number
    storage_used: number
    ip: string
    network_type: string
    wifi_ssid: string
    wifi_signal: number
    wifi_speed: number
    network_connected: boolean
    agent_version?: string
    allow_remote_screen?: boolean
  }
}

/** Full device info push (triggered by push_device_info command) */
export interface DeviceInfoMessage {
  type: 'device_info'
  push_request_id?: string
  data: HeartbeatMessage['data'] & {
    model?: string
    brand?: string
    os_version?: string
    sdk_version?: number
    resolution?: string
    android_serial?: string
  }
}

export interface ShellOutputMessage {
  type: 'shell_output'
  data: string
}

export interface LogcatOutputMessage {
  type: 'logcat_output'
  data: string
}

/** Custom event from device (barcode scan, button press, etc.) */
export interface DeviceEventMessage {
  type: 'device_event'
  eventType: string
  eventData: string
}

export interface ScreenshotResultMessage {
  type: 'screenshot_result'
  request_id: string
  success: boolean
  /** Base64-encoded PNG */
  data?: string
  error?: string
}

export interface InstallTaskResultMessage {
  type: 'install_task_result'
  commandId: string
  success: boolean
  output?: string
  error?: string
}

export interface InstalledAppsResultMessage {
  type: 'installed_apps_result'
  request_id: string
  success: boolean
  apps?: Array<{
    package_name: string
    version_name: string
    version_code: number
    app_label: string
    is_system: boolean
  }>
  error?: string
}

export interface FsListResultMessage {
  type: 'fs_list_result'
  request_id: string
  success: boolean
  entries?: Array<{ name: string; type: 'file' | 'dir'; size: number; mtime: number }>
  next_page_token?: string
  error?: string
}

export interface FsDownloadResultMessage {
  type: 'fs_download_result'
  request_id: string
  success: boolean
  /** Base64-encoded file content */
  data_base64?: string
  error?: string
}

export interface FsUploadProgressMessage {
  type: 'fs_upload_progress'
  upload_id: string
  received_bytes: number
  success: boolean
  error?: string
}

export interface FsUploadDoneMessage {
  type: 'fs_upload_done'
  upload_id: string
  success: boolean
  error?: string
}

export interface SpeedTestResultMessage {
  type: 'speed_test_result'
  request_id: string
  success: boolean
  phase?: string
  download_ms?: number
  upload_ms?: number
  download_bytes?: number
  upload_bytes?: number
  error?: string
}

export interface WebRTCOfferMessage {
  type: 'webrtc_offer'
  camera: 'back' | 'front'
  sdp: string
}

export interface WebRTCIceCandidateMessage {
  type: 'webrtc_ice_candidate'
  camera: 'back' | 'front'
  candidate: Record<string, unknown>
}

export interface WebRTCStopCameraMessage {
  type: 'webrtc_stop_camera'
  camera: 'back' | 'front'
}

export interface CameraErrorMessage {
  type: 'camera_error'
  camera: 'back' | 'front'
  message: string
}

export type AgentToServerMessage =
  | HeartbeatMessage
  | DeviceInfoMessage
  | ShellOutputMessage
  | LogcatOutputMessage
  | DeviceEventMessage
  | ScreenshotResultMessage
  | InstallTaskResultMessage
  | InstalledAppsResultMessage
  | FsListResultMessage
  | FsDownloadResultMessage
  | FsUploadProgressMessage
  | FsUploadDoneMessage
  | SpeedTestResultMessage
  | WebRTCOfferMessage
  | WebRTCIceCandidateMessage
  | WebRTCStopCameraMessage
  | CameraErrorMessage
