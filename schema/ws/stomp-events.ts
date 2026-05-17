// STOMP over WebSocket push notification schemas
// Endpoint: /ws/stomp  (subprotocols: v12.stomp, v11.stomp, v10.stomp)
// Auth: JWT Bearer header or ?token= query param
//
// STOMP frame flow:
//   Browser → CONNECT/STOMP → Server replies CONNECTED
//   Browser → SUBSCRIBE destination=/topic/... id=sub-N
//   Server  → MESSAGE destination=... subscription=sub-N  (push)
//   Browser → UNSUBSCRIBE id=sub-N
//   Browser → DISCONNECT

// --- Available subscription destinations ---

/**
 * /topic/devices
 * Broadcast on any device connect/disconnect/status change.
 */
export type StompDestDevices = '/topic/devices'

/**
 * /topic/events
 * Broadcast on any device custom event (barcode scan, button press, etc.).
 */
export type StompDestEvents = '/topic/events'

/**
 * /topic/device/{deviceId}/events
 * Per-device custom event stream.
 */
export type StompDestDeviceEvents = `/topic/device/${number}/events`

/**
 * /topic/device/{deviceId}/recording
 * Recording progress updates for a specific device.
 */
export type StompDestDeviceRecording = `/topic/device/${number}/recording`

/**
 * /topic/scada/point-data/{scadaCode}
 * Real-time point data updates for a SCADA canvas.
 */
export type StompDestScadaPointData = `/topic/scada/point-data/${string}`

/**
 * /topic/outbound/connectors/{connectorId}/execution-trace
 * Live execution trace for an outbound connector.
 */
export type StompDestOutboundTrace = `/topic/outbound/connectors/${number}/execution-trace`

// --- Message payloads (JSON body of STOMP MESSAGE frames) ---

/** Sent to /topic/devices on device status change */
export interface DeviceStatusPayload {
  type: 'device_status'
  device_id: number
  serial: string
  name: string
  /** "online" | "offline" */
  status: string
  agent_connected: boolean
  updated_at: string
}

/** Sent to /topic/events and /topic/device/{id}/events */
export interface DeviceCustomEventPayload {
  type: 'device_event'
  id: number
  device_id: number
  device_name?: string
  device_serial?: string
  event_type: string
  event_data: string
  created_at: string
}

/** Sent to /topic/device/{id}/recording */
export interface RecordingProgressPayload {
  type: 'recording_progress'
  device_id: number
  recording_id?: number
  /** "started" | "stopped" | "error" | "hls_ready" */
  status: string
  message?: string
  duration?: number
  file_size?: number
}

/** Sent to /topic/scada/point-data/{scadaCode} */
export interface ScadaPointDataPayload {
  type: 'point_data'
  scada_code: string
  points: Record<string, unknown>
  ts: number
}

/** Sent to /topic/outbound/connectors/{id}/execution-trace */
export interface OutboundExecutionTracePayload {
  type: 'execution_trace'
  connector_id: number
  device_event_id: number
  phase_index: number
  step_index: number
  step_type: string
  endpoint_id?: number
  /** "started" | "success" | "failed" | "skipped" */
  status: string
  http_status?: number
  duration_ms?: number
  error?: string
  request_url?: string
  ts: string
}

export type StompMessagePayload =
  | DeviceStatusPayload
  | DeviceCustomEventPayload
  | RecordingProgressPayload
  | ScadaPointDataPayload
  | OutboundExecutionTracePayload

// --- STOMP frame helpers (for reference) ---

/** CONNECT frame headers sent by browser */
export interface StompConnectHeaders {
  'accept-version': '1.2,1.1,1.0'
  'heart-beat': string
  login?: string
  passcode?: string
}

/** CONNECTED frame headers from server */
export interface StompConnectedHeaders {
  version: '1.2'
  'heart-beat': string
  server: 'app-manager'
  session: string
}

/** SUBSCRIBE frame headers */
export interface StompSubscribeHeaders {
  destination: string
  id: string
  ack?: 'auto' | 'client' | 'client-individual'
}

/** MESSAGE frame headers from server */
export interface StompMessageHeaders {
  destination: string
  'message-id': string
  subscription: string
  'content-type': 'application/json'
}
