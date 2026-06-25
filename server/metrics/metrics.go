package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	ClusterRedisPublishTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "cluster_redis_publish_total",
			Help: "Redis Pub/Sub publishes from this node (by kind).",
		},
		[]string{"kind"},
	)
	AgentForwardTotal = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "agent_forward_total",
			Help: "Agent commands forwarded to a remote cluster node.",
		},
	)
	ScreenRelayPublishTotal = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "screen_relay_publish_total",
			Help: "Screen binary frames published to Redis for cross-node relay.",
		},
	)
	ShellRelayPublishTotal = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "shell_relay_publish_total",
			Help: "Shell output chunks published to Redis for cross-node relay.",
		},
	)
	LogcatRelayPublishTotal = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "logcat_relay_publish_total",
			Help: "Logcat lines published to Redis for cross-node relay.",
		},
	)
	WebRTCRelayPublishTotal = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "webrtc_relay_publish_total",
			Help: "WebRTC RTP packets published to Redis for cross-node relay.",
		},
	)
)
