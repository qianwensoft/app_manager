// Screen stream WebSocket protocol
// Endpoint: /ws/screen/:deviceId
// Auth: JWT Bearer or ?token= query param; share links use ?share=<token>

// --- Binary frame format (Agent → Server → Browser) ---
// Agent sends binary WebSocket frames:
//   byte[0]    = 0x01 (frame type marker)
//   byte[1..2] = width  (uint16 big-endian)
//   byte[3..4] = height (uint16 big-endian)
//   byte[5..]  = JPEG data
//
// Server fans out binary frames to all connected browser viewers via ScreenHub.

export interface ScreenBinaryFrameHeader {
  /** Always 0x01 */
  marker: 0x01
  width: number
  height: number
  // followed by raw JPEG bytes
}

// --- Text messages: Browser → Server ---

export interface ScreenTouchMessage {
  type: 'screen_touch'
  data:
    | { type: 'tap'; x: number; y: number }
    | { type: 'swipe'; x: number; y: number; x2: number; y2: number; duration: number }
    | { type: 'scroll'; x: number; y: number; dx: number; dy: number }
    | { type: 'ping' }
}

export interface ViewerStopScreenMessage {
  type: 'viewer_stop_screen'
}

export interface ClientPingMessage {
  type: 'client_ping'
  ts: number
}

export type BrowserToScreenServerMessage =
  | ScreenTouchMessage
  | ViewerStopScreenMessage
  | ClientPingMessage

// --- Text messages: Server → Browser ---

export interface ClientPongMessage {
  type: 'client_pong'
  ts: number
}

export interface ViewerStopAckMessage {
  type: 'viewer_stop_ack'
}

/** Forwarded from agent: current screen dimensions / orientation */
export interface ScreenMetaMessage {
  type: 'screen_meta'
  width: number
  height: number
  rotation?: number
}

export interface ScreenPongMessage {
  type: 'screen_pong'
}

/** Forwarded from agent: JSON frame (alternative to binary, used for recording) */
export interface ScreenFrameMessage {
  type: 'screen_frame'
  data: {
    /** Base64-encoded JPEG */
    frame?: string
    width?: number
    height?: number
    ts?: number
  }
}

/** Agent-originated notice forwarded to the browser viewer */
export interface UserNoticeMessage {
  type: 'user_notice'
  message: string
  level?: 'info' | 'warn' | 'error'
}

export type ScreenServerToBrowserMessage =
  | ClientPongMessage
  | ViewerStopAckMessage
  | ScreenMetaMessage
  | ScreenPongMessage
  | ScreenFrameMessage
  | UserNoticeMessage

// --- Shell WebSocket: /ws/shell/:deviceId ---
// Browser sends raw text/binary (terminal input).
// Server forwards to agent via shell_input command.
// Agent replies with shell_output; server forwards as binary frame to browser.

export interface ShellMetaMessage {
  type: 'shell_meta'
  /** "adb" = PTY via adb; "agent" = routed through agent WS */
  mode: 'adb' | 'agent'
}

// --- Logcat WebSocket: /ws/logcat/:deviceId?filter=<tag> ---
// Server streams raw logcat lines as text frames.
// No structured messages; each frame is a plain logcat line string.

// --- Camera WebRTC WebSocket: /ws/camera/:deviceId?camera=back|front ---

export interface WebRTCAnswerMessage {
  type: 'webrtc_answer'
  sdp: string
}

export interface WebRTCViewerIceMessage {
  type: 'webrtc_ice_candidate'
  candidate: Record<string, unknown>
}

export interface WebRTCOfferFromServerMessage {
  type: 'webrtc_offer'
  sdp: string
}

export interface WebRTCServerIceMessage {
  type: 'webrtc_ice_candidate'
  candidate: Record<string, unknown>
}

export interface CameraErrorFromServerMessage {
  type: 'camera_error'
  message: string
}

export interface PingMessage {
  type: 'ping'
}

export interface PongMessage {
  type: 'pong'
}
