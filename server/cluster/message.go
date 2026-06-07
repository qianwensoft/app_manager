package cluster

const redisChannel = "app-manager:cluster"

const (
	agentKeyPrefix = "am:agent:"
	agentKeyTTL    = 120 // seconds
)

// Kind identifies cross-node message types.
type Kind string

const (
	KindStomp             Kind = "stomp"
	KindAgentCmd          Kind = "agent_cmd"
	KindScreenText        Kind = "screen_text"
	KindShellOut          Kind = "shell_out"
	KindLogcatOut         Kind = "logcat_out"
	KindWebRTCTrackReady  Kind = "webrtc_track_ready"
	KindWebRTCCameraError Kind = "webrtc_camera_error"
	KindWebRTCStopCamera  Kind = "webrtc_stop_camera"
)

// Envelope is the Redis Pub/Sub payload.
type Envelope struct {
	OriginNode string `json:"origin_node"`
	Kind       Kind   `json:"kind"`
	Topic      string `json:"topic,omitempty"`
	DeviceID   string `json:"device_id,omitempty"`
	Camera     string `json:"camera,omitempty"`
	Body       string `json:"body"`
}
