package cluster

import (
	"app-manager/metrics"
	"app-manager/webrtc"
	"context"
	"strings"
	"time"
)

const (
	webrtcRTPPrefix    = "app-manager:webrtc-rtp:"
	cameraViewerPrefix = "am:viewers:camera:"
	cameraTrackPrefix  = "am:webrtc:track:"
	cameraViewerTTL    = 300 * time.Second
	cameraTrackTTL     = 120 * time.Second
)

// IncrCameraViewer increments cluster-wide camera viewers; returns true when start_camera is needed.
func IncrCameraViewer(deviceID, camera string) bool {
	if !Enabled() {
		return true
	}
	n, err := incrCameraViewers(deviceID, camera)
	if err != nil {
		return true
	}
	return n == 1
}

// DecrCameraViewer decrements cluster-wide camera viewers; returns remaining count (0 = send stop_camera).
func DecrCameraViewer(deviceID, camera string) int64 {
	if !Enabled() {
		return 0
	}
	return decrCameraViewers(deviceID, camera)
}

// LookupWebRTCTrackMime returns the codec of an active cluster-wide camera track, if any.
func LookupWebRTCTrackMime(deviceID, camera string) string {
	if !Enabled() || deviceID == "" || camera == "" {
		return ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	val, err := rdb.Get(ctx, cameraTrackKey(deviceID, camera)).Result()
	if err != nil {
		return ""
	}
	return val
}

// PublishWebRTCTrackReady notifies remote nodes that agent media is available.
func PublishWebRTCTrackReady(deviceID string, camera webrtc.CameraType, mimeType string) {
	if !Enabled() || deviceID == "" || mimeType == "" {
		return
	}
	setCameraTrackMime(deviceID, string(camera), mimeType)
	publishEnvelope(Envelope{
		OriginNode: NodeID(),
		Kind:       KindWebRTCTrackReady,
		DeviceID:   deviceID,
		Camera:     string(camera),
		Body:       mimeType,
	})
}

// PublishWebRTCRTP mirrors an RTP packet to other cluster nodes.
func PublishWebRTCRTP(deviceID string, camera webrtc.CameraType, pkt []byte) {
	if !Enabled() || deviceID == "" || len(pkt) == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	channel := webrtcRTPChannel(deviceID, string(camera))
	payload := packScreenRelay(NodeID(), pkt)
	if err := rdb.Publish(ctx, channel, payload).Err(); err == nil {
		metrics.WebRTCRelayPublishTotal.Inc()
		metrics.ClusterRedisPublishTotal.WithLabelValues("webrtc_rtp").Inc()
	}
}

// PublishWebRTCCameraError mirrors camera errors to viewers on other nodes.
func PublishWebRTCCameraError(deviceID string, camera webrtc.CameraType, message string) {
	if !Enabled() || deviceID == "" || message == "" {
		return
	}
	publishEnvelope(Envelope{
		OriginNode: NodeID(),
		Kind:       KindWebRTCCameraError,
		DeviceID:   deviceID,
		Camera:     string(camera),
		Body:       message,
	})
}

// PublishWebRTCStopCamera notifies remote nodes that agent stopped streaming.
func PublishWebRTCStopCamera(deviceID string, camera webrtc.CameraType) {
	if !Enabled() || deviceID == "" {
		return
	}
	clearCameraTrackMime(deviceID, string(camera))
	publishEnvelope(Envelope{
		OriginNode: NodeID(),
		Kind:       KindWebRTCStopCamera,
		DeviceID:   deviceID,
		Camera:     string(camera),
	})
}

func deliverWebRTCRTP(deviceID, camera string, payload []byte) {
	origin, frame, ok := unpackScreenRelay(payload)
	if !ok || origin == NodeID() {
		return
	}
	webrtc.CameraHub.WriteRemoteRTP(deviceID, webrtc.CameraType(camera), frame)
}

func incrCameraViewers(deviceID, camera string) (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	key := cameraViewerKey(deviceID, camera)
	n, err := rdb.Incr(ctx, key).Result()
	if err != nil {
		return 0, err
	}
	_ = rdb.Expire(ctx, key, cameraViewerTTL).Err()
	return n, nil
}

func decrCameraViewers(deviceID, camera string) int64 {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	key := cameraViewerKey(deviceID, camera)
	n, err := rdb.Decr(ctx, key).Result()
	if err != nil {
		return 0
	}
	if n <= 0 {
		_ = rdb.Del(ctx, key).Err()
	}
	return n
}

func cameraViewerKey(deviceID, camera string) string {
	return cameraViewerPrefix + deviceID + ":" + camera
}

func cameraTrackKey(deviceID, camera string) string {
	return cameraTrackPrefix + deviceID + ":" + camera
}

func setCameraTrackMime(deviceID, camera, mimeType string) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = rdb.Set(ctx, cameraTrackKey(deviceID, camera), mimeType, cameraTrackTTL).Err()
}

func clearCameraTrackMime(deviceID, camera string) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = rdb.Del(ctx, cameraTrackKey(deviceID, camera)).Err()
}

func webrtcRTPChannel(deviceID, camera string) string {
	return webrtcRTPPrefix + deviceID + "|" + camera
}

func parseWebRTCRTPChannel(channel string) (deviceID, camera string, ok bool) {
	rest, ok := strings.CutPrefix(channel, webrtcRTPPrefix)
	if !ok {
		return "", "", false
	}
	deviceID, camera, ok = strings.Cut(rest, "|")
	return deviceID, camera, ok && deviceID != "" && camera != ""
}
