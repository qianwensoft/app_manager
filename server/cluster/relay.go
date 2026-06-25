package cluster

import (
	"app-manager/logcat"
	"app-manager/metrics"
	"app-manager/screen"
	"app-manager/shell"
	"bytes"
	"context"
	"encoding/base64"
	"strings"
	"time"
)

const (
	screenChannelPrefix = "app-manager:screen:"
	screenViewerPrefix  = "am:viewers:screen:"
	screenViewerTTL     = 300 * time.Second
)

// ScreenViewerJoined tracks cluster-wide screen viewers and returns whether start_screen is needed.
func ScreenViewerJoined(deviceID string) bool {
	if !Enabled() {
		return screen.ViewerJoined(deviceID)
	}
	global, err := incrScreenViewers(deviceID)
	if err != nil {
		return screen.ViewerJoined(deviceID)
	}
	screen.ViewerJoined(deviceID)
	return global == 1
}

// ScreenViewerLeft decrements cluster-wide viewer count and updates local capture state.
func ScreenViewerLeft(deviceID string) {
	screen.ViewerLeft(deviceID)
	if !Enabled() {
		return
	}
	_ = decrScreenViewers(deviceID)
}

// PublishScreenBinary mirrors a local MJPEG/binary frame to other nodes.
func PublishScreenBinary(deviceID string, data []byte) {
	if !Enabled() || deviceID == "" || len(data) == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	channel := screenChannelPrefix + deviceID
	payload := packScreenRelay(NodeID(), data)
	if err := rdb.Publish(ctx, channel, payload).Err(); err == nil {
		metrics.ScreenRelayPublishTotal.Inc()
		metrics.ClusterRedisPublishTotal.WithLabelValues("screen_binary").Inc()
	}
}

// PublishScreenText mirrors JSON screen notifications (meta/pong/legacy frame) to other nodes.
func PublishScreenText(deviceID string, data []byte) {
	if !Enabled() || deviceID == "" || len(data) == 0 {
		return
	}
	publishEnvelope(Envelope{
		OriginNode: NodeID(),
		Kind:       KindScreenText,
		DeviceID:   deviceID,
		Body:       string(data),
	})
}

// PublishShellOutput mirrors shell stdout/stderr to viewers on other nodes.
func PublishShellOutput(deviceID string, data []byte) {
	if !Enabled() || deviceID == "" || len(data) == 0 {
		return
	}
	publishEnvelope(Envelope{
		OriginNode: NodeID(),
		Kind:       KindShellOut,
		DeviceID:   deviceID,
		Body:       base64.StdEncoding.EncodeToString(data),
	})
	metrics.ShellRelayPublishTotal.Inc()
}

// PublishLogcatOutput mirrors logcat text to viewers on other nodes.
func PublishLogcatOutput(deviceID string, data []byte) {
	if !Enabled() || deviceID == "" || len(data) == 0 {
		return
	}
	publishEnvelope(Envelope{
		OriginNode: NodeID(),
		Kind:       KindLogcatOut,
		DeviceID:   deviceID,
		Body:       string(data),
	})
	metrics.LogcatRelayPublishTotal.Inc()
}

// LookupAgentNode returns the node_id holding the agent WebSocket, if any.
func LookupAgentNode(deviceID string) (string, error) {
	if !Enabled() {
		return "", nil
	}
	return lookupAgentNode(deviceID)
}

func incrScreenViewers(deviceID string) (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	key := screenViewerPrefix + deviceID
	n, err := rdb.Incr(ctx, key).Result()
	if err != nil {
		return 0, err
	}
	_ = rdb.Expire(ctx, key, screenViewerTTL).Err()
	return n, nil
}

func decrScreenViewers(deviceID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	key := screenViewerPrefix + deviceID
	n, err := rdb.Decr(ctx, key).Result()
	if err != nil {
		return err
	}
	if n <= 0 {
		_ = rdb.Del(ctx, key).Err()
	}
	return nil
}

func deliverScreenBinary(deviceID string, payload []byte) {
	if deviceID == "" || len(payload) == 0 {
		return
	}
	origin, frame, ok := unpackScreenRelay(payload)
	if !ok || origin == NodeID() {
		return
	}
	screen.MarkAgentCaptureHeld(deviceID)
	screen.ScreenHub.BroadcastBinary(deviceID, frame)
}

func packScreenRelay(origin string, data []byte) []byte {
	return append(append([]byte(origin), 0), data...)
}

func unpackScreenRelay(payload []byte) (origin string, frame []byte, ok bool) {
	i := bytes.IndexByte(payload, 0)
	if i < 0 {
		return "", nil, false
	}
	return string(payload[:i]), payload[i+1:], true
}

func deliverShellOutput(deviceID string, body string) {
	if deviceID == "" || body == "" {
		return
	}
	data, err := base64.StdEncoding.DecodeString(body)
	if err != nil {
		return
	}
	shell.ShellHub.SendToClient(deviceID, data)
}

func deliverLogcatOutput(deviceID string, body string) {
	if deviceID == "" || body == "" {
		return
	}
	logcat.LogcatHub.SendToClient(deviceID, []byte(body))
}

func screenDeviceFromChannel(channel string) string {
	if !strings.HasPrefix(channel, screenChannelPrefix) {
		return ""
	}
	return strings.TrimPrefix(channel, screenChannelPrefix)
}
