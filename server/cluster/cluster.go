package cluster

import (
	"app-manager/agent"
	"app-manager/config"
	"app-manager/metrics"
	"app-manager/screen"
	"app-manager/stomp"
	"app-manager/webrtc"
	"context"
	"encoding/json"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

var (
	mu           sync.RWMutex
	enabled      bool
	nodeID       string
	rdb          *redis.Client
	pub          *redis.PubSub
	screenPub    *redis.PubSub
	webrtcPub    *redis.PubSub
	cancel       context.CancelFunc
	screenCancel context.CancelFunc
	webrtcCancel context.CancelFunc
)

// Init starts the cluster bus when config.cluster.enabled and redis_url are set.
func Init(cfg config.ClusterConfig) error {
	mu.Lock()
	defer mu.Unlock()
	if strings.TrimSpace(cfg.RedisURL) == "" {
		enabled = false
		return nil
	}
	if !cfg.Enabled {
		enabled = false
		return nil
	}
	client, err := parseRedisURL(cfg.RedisURL)
	if err != nil {
		return err
	}
	rdb = client
	ctx, pingCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer pingCancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return err
	}
	nodeID = strings.TrimSpace(cfg.NodeID)
	if nodeID == "" {
		host, _ := os.Hostname()
		if host == "" {
			host = "node"
		}
		nodeID = host
	}
	enabled = true
	stomp.SetPublishHook(publishStompMirror)
	agent.SetClusterHooks(TryForwardAgentCommand, AgentReachable, RegisterAgent, UnregisterAgent)
	agent.SetClusterScreenPublish(PublishScreenBinary)
	webrtc.SetClusterRelayHooks(PublishWebRTCRTP, PublishWebRTCTrackReady)
	startSubscriber()
	startScreenSubscriber()
	startWebRTCSubscriber()
	log.Printf("[cluster] enabled node_id=%s", nodeID)
	return nil
}

// Enabled reports whether cross-node routing is active.
func Enabled() bool {
	mu.RLock()
	defer mu.RUnlock()
	return enabled
}

// NodeID returns this instance identifier.
func NodeID() string {
	mu.RLock()
	defer mu.RUnlock()
	return nodeID
}

// Close stops the Redis subscriber.
func Close() {
	mu.Lock()
	defer mu.Unlock()
	if cancel != nil {
		cancel()
		cancel = nil
	}
	if screenCancel != nil {
		screenCancel()
		screenCancel = nil
	}
	if webrtcCancel != nil {
		webrtcCancel()
		webrtcCancel = nil
	}
	if pub != nil {
		_ = pub.Close()
		pub = nil
	}
	if screenPub != nil {
		_ = screenPub.Close()
		screenPub = nil
	}
	if webrtcPub != nil {
		_ = webrtcPub.Close()
		webrtcPub = nil
	}
	if rdb != nil {
		_ = rdb.Close()
		rdb = nil
	}
	enabled = false
	stomp.SetPublishHook(nil)
	agent.SetClusterHooks(nil, nil, nil, nil)
	agent.SetClusterScreenPublish(nil)
	webrtc.SetClusterRelayHooks(nil, nil)
}

func publishStompMirror(topic, jsonBody string) {
	if !Enabled() {
		return
	}
	env := Envelope{
		OriginNode: NodeID(),
		Kind:       KindStomp,
		Topic:      topic,
		Body:       jsonBody,
	}
	publishEnvelope(env)
}

// TryForwardAgentCommand returns true if the command was sent locally or forwarded to another node.
func TryForwardAgentCommand(deviceID string, data []byte) bool {
	if !Enabled() {
		return false
	}
	if agent.AgentHub.HasLocal(deviceID) {
		return false
	}
	owner, err := lookupAgentNode(deviceID)
	if err != nil || owner == "" {
		return false
	}
	if owner == NodeID() {
		return false
	}
	env := Envelope{
		OriginNode: NodeID(),
		Kind:       KindAgentCmd,
		DeviceID:   deviceID,
		Body:       string(data),
	}
	publishEnvelope(env)
	metrics.AgentForwardTotal.Inc()
	return true
}

// AgentReachable returns true if the device has a local or cluster-registered agent connection.
func AgentReachable(deviceID string) bool {
	if agent.AgentHub.HasLocal(deviceID) {
		return true
	}
	if !Enabled() {
		return false
	}
	owner, err := lookupAgentNode(deviceID)
	return err == nil && owner != ""
}

// RegisterAgent marks this node as holding the agent WebSocket.
func RegisterAgent(deviceID string) {
	if !Enabled() || deviceID == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	key := agentKeyPrefix + deviceID
	_ = rdb.Set(ctx, key, NodeID(), agentKeyTTL*time.Second).Err()
}

// UnregisterAgent removes the registration when it belongs to this node.
func UnregisterAgent(deviceID string) {
	if !Enabled() || deviceID == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	key := agentKeyPrefix + deviceID
	val, err := rdb.Get(ctx, key).Result()
	if err == nil && val == NodeID() {
		_ = rdb.Del(ctx, key).Err()
	}
}

func lookupAgentNode(deviceID string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return rdb.Get(ctx, agentKeyPrefix+deviceID).Result()
}

func publishEnvelope(env Envelope) {
	if rdb == nil {
		return
	}
	b, err := json.Marshal(env)
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := rdb.Publish(ctx, redisChannel, b).Err(); err == nil {
		metrics.ClusterRedisPublishTotal.WithLabelValues(string(env.Kind)).Inc()
	}
}

func startSubscriber() {
	ctx, c := context.WithCancel(context.Background())
	cancel = c
	pub = rdb.Subscribe(ctx, redisChannel)
	go func() {
		ch := pub.Channel()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				handleMessage(msg.Payload)
			}
		}
	}()
}

func handleMessage(payload string) {
	var env Envelope
	if err := json.Unmarshal([]byte(payload), &env); err != nil {
		return
	}
	if env.OriginNode == NodeID() {
		return
	}
	deliverEnvelope(env)
}

func deliverEnvelope(env Envelope) {
	switch env.Kind {
	case KindStomp:
		if env.Topic != "" && env.Body != "" {
			stomp.DefaultHub.PublishJSONLocal(env.Topic, env.Body)
		}
	case KindAgentCmd:
		if env.DeviceID != "" && env.Body != "" {
			_ = agent.AgentHub.DeliverRaw(env.DeviceID, []byte(env.Body))
		}
	case KindScreenText:
		if env.DeviceID != "" && env.Body != "" {
			screen.MarkAgentCaptureHeld(env.DeviceID)
			screen.ScreenHub.BroadcastText(env.DeviceID, []byte(env.Body))
		}
	case KindShellOut:
		deliverShellOutput(env.DeviceID, env.Body)
	case KindLogcatOut:
		deliverLogcatOutput(env.DeviceID, env.Body)
	case KindWebRTCTrackReady:
		if env.DeviceID != "" && env.Camera != "" && env.Body != "" {
			webrtc.CameraHub.HandleRemoteTrackReady(env.DeviceID, webrtc.CameraType(env.Camera), env.Body)
		}
	case KindWebRTCCameraError:
		if env.DeviceID != "" && env.Camera != "" && env.Body != "" {
			webrtc.CameraHub.BroadcastError(env.DeviceID, webrtc.CameraType(env.Camera), env.Body)
		}
	case KindWebRTCStopCamera:
		if env.DeviceID != "" && env.Camera != "" {
			webrtc.CameraHub.HandleRemoteStopCamera(env.DeviceID, webrtc.CameraType(env.Camera))
		}
	}
}

func startScreenSubscriber() {
	ctx, c := context.WithCancel(context.Background())
	screenCancel = c
	screenPub = rdb.PSubscribe(ctx, screenChannelPrefix+"*")
	go func() {
		ch := screenPub.Channel()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				deviceID := screenDeviceFromChannel(msg.Channel)
				if deviceID == "" {
					continue
				}
				deliverScreenBinary(deviceID, []byte(msg.Payload))
			}
		}
	}()
}

func startWebRTCSubscriber() {
	ctx, c := context.WithCancel(context.Background())
	webrtcCancel = c
	webrtcPub = rdb.PSubscribe(ctx, webrtcRTPPrefix+"*")
	go func() {
		ch := webrtcPub.Channel()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				deviceID, camera, ok := parseWebRTCRTPChannel(msg.Channel)
				if !ok {
					continue
				}
				deliverWebRTCRTP(deviceID, camera, []byte(msg.Payload))
			}
		}
	}()
}
