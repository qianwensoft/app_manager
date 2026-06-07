package api

import (
	"app-manager/agent"
	"app-manager/database"
	"app-manager/models"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// metrics 监控：内存计数中间件 + 定期 flush 到 DB。
// 每请求只做内存累加（加锁，零 DB 开销）；后台 goroutine 每分钟把分钟桶批量写入 ApiCallMetric，
// 并采样 Agent 在线连接数写入 AgentOnlineSample。趋势/详情查询全部走 DB（见 system_monitor.go）。

const (
	metricsFlushInterval     = time.Minute
	metricsRetentionInterval = time.Hour
	metricsRetention         = 7 * 24 * time.Hour
)

type metricBucketKey struct {
	bucketTs    int64 // 分钟对齐的 unix 秒
	endpoint    string
	method      string
	source      string
	statusClass string
}

type metricAgg struct {
	count        int64
	sumLatencyMs int64
}

type metricCollector struct {
	mu      sync.Mutex
	buckets map[metricBucketKey]*metricAgg
}

var collector = &metricCollector{buckets: make(map[metricBucketKey]*metricAgg)}

// MetricsMiddleware 统计全部 /api/* 请求（按端点模板、方法、来源、状态类聚合到分钟桶）。
func MetricsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		path := c.Request.URL.Path
		if !strings.HasPrefix(path, "/api/") {
			return
		}
		latencyMs := time.Since(start).Milliseconds()
		endpoint := c.FullPath() // 路由模板，天然低基数
		if endpoint == "" {
			endpoint = "other" // 未匹配路由（含 404），避免随机路径制造高基数
		}
		key := metricBucketKey{
			bucketTs:    start.Truncate(time.Minute).Unix(),
			endpoint:    endpoint,
			method:      c.Request.Method,
			source:      requestSource(c),
			statusClass: statusClass(c.Writer.Status()),
		}
		collector.mu.Lock()
		agg := collector.buckets[key]
		if agg == nil {
			agg = &metricAgg{}
			collector.buckets[key] = agg
		}
		agg.count++
		agg.sumLatencyMs += latencyMs
		collector.mu.Unlock()
	}
}

// requestSource 依据认证上下文区分调用来源（与 auth/middleware.go 设置的 key 对应）。
// 注意：主 AuthMiddleware 走 Bearer 时只设 user_id（不设 auth_kind），故以 api_key_id / user_id 为准。
func requestSource(c *gin.Context) string {
	if id := c.GetUint("api_key_id"); id > 0 {
		return "external" // 开放 API（X-API-Key）
	}
	if uid := c.GetUint("user_id"); uid > 0 {
		return "internal" // 已登录用户（JWT）
	}
	if c.GetString("auth_kind") == "device" {
		return "device" // Agent 设备令牌
	}
	return "anonymous"
}

func statusClass(code int) string {
	switch {
	case code >= 500:
		return "5xx"
	case code >= 400:
		return "4xx"
	case code >= 300:
		return "3xx"
	default:
		return "2xx"
	}
}

// StartMetricsAggregator 在 DB 就绪后启动定期 flush 与过期清理。
func StartMetricsAggregator() {
	go func() {
		<-database.Ready
		flushTicker := time.NewTicker(metricsFlushInterval)
		retentionTicker := time.NewTicker(metricsRetentionInterval)
		defer flushTicker.Stop()
		defer retentionTicker.Stop()
		for {
			select {
			case <-flushTicker.C:
				flushMetricsOnce()
			case <-retentionTicker.C:
				pruneMetrics()
			}
		}
	}()
}

// flushMetricsOnce 交换出当前内存桶并批量写库，同时采样 Agent 在线数。
func flushMetricsOnce() {
	collector.mu.Lock()
	buckets := collector.buckets
	collector.buckets = make(map[metricBucketKey]*metricAgg)
	collector.mu.Unlock()

	if len(buckets) > 0 {
		rows := make([]models.ApiCallMetric, 0, len(buckets))
		for k, agg := range buckets {
			rows = append(rows, models.ApiCallMetric{
				BucketTs:     time.Unix(k.bucketTs, 0),
				Endpoint:     k.endpoint,
				Method:       k.method,
				Source:       k.source,
				StatusClass:  k.statusClass,
				Count:        agg.count,
				SumLatencyMs: agg.sumLatencyMs,
			})
		}
		database.DB.CreateInBatches(rows, 100)
	}

	// Agent 在线连接数采样（分钟对齐）
	database.DB.Create(&models.AgentOnlineSample{
		SampleTs: time.Now().Truncate(time.Minute),
		Online:   agent.AgentHub.OnlineCount(),
	})
}

func pruneMetrics() {
	cutoff := time.Now().Add(-metricsRetention)
	database.DB.Where("bucket_ts < ?", cutoff).Delete(&models.ApiCallMetric{})
	database.DB.Where("sample_ts < ?", cutoff).Delete(&models.AgentOnlineSample{})
}
