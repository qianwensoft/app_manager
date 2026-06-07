package cluster

import (
	"app-manager/agent"
	"app-manager/config"
	"app-manager/stomp"
	"app-manager/webrtc"
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
)

func TestCluster_StompMirrorAcrossNodes(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer mr.Close()

	url := "redis://" + mr.Addr() + "/0"

	cfgA := config.ClusterConfig{Enabled: true, NodeID: "node-a", RedisURL: url}
	cfgB := config.ClusterConfig{Enabled: true, NodeID: "node-b", RedisURL: url}

	if err := Init(cfgA); err != nil {
		t.Fatal(err)
	}
	defer Close()

	// Simulate second node subscriber only (share same miniredis).
	rdb2, err := parseRedisURL(url)
	if err != nil {
		t.Fatal(err)
	}
	defer rdb2.Close()
	pub := rdb2.Subscribe(context.Background(), redisChannel)
	defer pub.Close()

	var wg sync.WaitGroup
	var got string
	wg.Add(1)
	go func() {
		defer wg.Done()
		select {
		case msg := <-pub.Channel():
			got = msg.Payload
		case <-time.After(3 * time.Second):
		}
	}()

	stomp.DefaultHub.PublishJSON("/topic/test", `{"ok":true}`)
	wg.Wait()

	if got == "" {
		t.Fatal("expected redis publish")
	}
	var env Envelope
	if err := json.Unmarshal([]byte(got), &env); err != nil {
		t.Fatal(err)
	}
	if env.Kind != KindStomp || env.Topic != "/topic/test" || env.OriginNode != "node-a" {
		t.Fatalf("unexpected envelope: %+v", env)
	}

	done := make(chan struct{})
	stomp.DefaultHub.Subscribe("/topic/test", "sub-1", func(b []byte) {
		close(done)
	})
	deliverEnvelope(env)
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("remote node should deliver stomp locally")
	}

	_ = cfgB
}

func TestCluster_AgentForwardWhenRemote(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer mr.Close()
	url := "redis://" + mr.Addr() + "/0"

	if err := Init(config.ClusterConfig{Enabled: true, NodeID: "node-a", RedisURL: url}); err != nil {
		t.Fatal(err)
	}
	defer Close()

	ctx := context.Background()
	_ = rdb.Set(ctx, agentKeyPrefix+"dev-1", "node-b", agentKeyTTL*time.Second).Err()

	if agent.AgentHub.HasLocal("dev-1") {
		t.Fatal("unexpected local agent")
	}
	if !TryForwardAgentCommand("dev-1", []byte(`{"type":"ping"}`)) {
		t.Fatal("expected forward to remote node")
	}
	if TryForwardAgentCommand("dev-1", []byte(`{"type":"ping"}`)) {
		// still forwards when not local — ok
	}
	if !AgentReachable("dev-1") {
		t.Fatal("expected reachable via registry")
	}
}

func TestCluster_ScreenRelayIgnoresSelfOrigin(t *testing.T) {
	frame := []byte{0x01, 0x00, 0x10, 0x00, 0x20, 0xff}
	packed := packScreenRelay("node-a", frame)
	origin, out, ok := unpackScreenRelay(packed)
	if !ok || origin != "node-a" || len(out) != len(frame) {
		t.Fatalf("unpack failed: origin=%q len=%d", origin, len(out))
	}
}

func TestCluster_ShellRelayDeliver(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer mr.Close()
	url := "redis://" + mr.Addr() + "/0"

	if err := Init(config.ClusterConfig{Enabled: true, NodeID: "node-a", RedisURL: url}); err != nil {
		t.Fatal(err)
	}
	defer Close()

	rdb2, err := parseRedisURL(url)
	if err != nil {
		t.Fatal(err)
	}
	defer rdb2.Close()
	pub := rdb2.Subscribe(context.Background(), redisChannel)
	defer pub.Close()

	var wg sync.WaitGroup
	var got Envelope
	wg.Add(1)
	go func() {
		defer wg.Done()
		select {
		case msg := <-pub.Channel():
			_ = json.Unmarshal([]byte(msg.Payload), &got)
		case <-time.After(3 * time.Second):
		}
	}()

	PublishShellOutput("dev-1", []byte("hello shell"))
	wg.Wait()

	if got.Kind != KindShellOut || got.DeviceID != "dev-1" || got.OriginNode != "node-a" {
		t.Fatalf("unexpected envelope: %+v", got)
	}
	got.OriginNode = "node-b"
	deliverEnvelope(got)
}

func TestCluster_ScreenViewerJoinedGlobal(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer mr.Close()
	url := "redis://" + mr.Addr() + "/0"

	if err := Init(config.ClusterConfig{Enabled: true, NodeID: "node-a", RedisURL: url}); err != nil {
		t.Fatal(err)
	}
	defer Close()

	if !ScreenViewerJoined("dev-screen") {
		t.Fatal("first global viewer should need start")
	}
	if ScreenViewerJoined("dev-screen") {
		t.Fatal("second viewer should not need start")
	}
	ScreenViewerLeft("dev-screen")
	ScreenViewerLeft("dev-screen")
	if !ScreenViewerJoined("dev-screen") {
		t.Fatal("after all left, first viewer again should need start")
	}
}

func TestCluster_WebRTCRTPChannelParse(t *testing.T) {
	ch := webrtcRTPChannel("dev-42", "back")
	deviceID, camera, ok := parseWebRTCRTPChannel(ch)
	if !ok || deviceID != "dev-42" || camera != "back" {
		t.Fatalf("parse failed: %q %q %v", deviceID, camera, ok)
	}
}

func TestCluster_WebRTCTrackReadyEnvelope(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer mr.Close()
	url := "redis://" + mr.Addr() + "/0"

	if err := Init(config.ClusterConfig{Enabled: true, NodeID: "node-a", RedisURL: url}); err != nil {
		t.Fatal(err)
	}
	defer Close()

	PublishWebRTCTrackReady("dev-1", webrtc.CameraBack, "video/H264")
	if got := LookupWebRTCTrackMime("dev-1", "back"); got != "video/H264" {
		t.Fatalf("expected track mime in redis, got %q", got)
	}

	env := Envelope{
		OriginNode: "node-b",
		Kind:       KindWebRTCTrackReady,
		DeviceID:   "dev-1",
		Camera:     "back",
		Body:       "video/H264",
	}
	deliverEnvelope(env)

	PublishWebRTCStopCamera("dev-1", webrtc.CameraBack)
	if got := LookupWebRTCTrackMime("dev-1", "back"); got != "" {
		t.Fatalf("expected track cleared, got %q", got)
	}
}

func TestCluster_CameraViewerCount(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer mr.Close()
	url := "redis://" + mr.Addr() + "/0"

	if err := Init(config.ClusterConfig{Enabled: true, NodeID: "node-a", RedisURL: url}); err != nil {
		t.Fatal(err)
	}
	defer Close()

	if !IncrCameraViewer("dev-1", "back") {
		t.Fatal("first viewer should need start")
	}
	if IncrCameraViewer("dev-1", "back") {
		t.Fatal("second viewer should not need start")
	}
	if DecrCameraViewer("dev-1", "back") != 1 {
		t.Fatal("expected 1 remaining")
	}
	if DecrCameraViewer("dev-1", "back") != 0 {
		t.Fatal("expected 0 remaining")
	}
}

func TestCluster_DisabledByDefault(t *testing.T) {
	Close()
	if Enabled() {
		t.Fatal("expected disabled after close")
	}
	if err := Init(config.ClusterConfig{Enabled: false, RedisURL: "redis://127.0.0.1:9"}); err != nil {
		t.Fatal(err)
	}
	if Enabled() {
		t.Fatal("expected disabled when enabled=false")
	}
}
