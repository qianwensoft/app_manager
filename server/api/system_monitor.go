package api

import (
	"app-manager/agent"
	"app-manager/database"
	"app-manager/models"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// 运行监控查询接口（管理员）：Agent 在线连接 + 接口调用量趋势/详情。
// 趋势聚合在 Go 侧完成，避免 SQLite/MySQL 日期函数差异。

func parseHoursParam(c *gin.Context, def int) int {
	h, err := strconv.Atoi(c.Query("hours"))
	if err != nil || h <= 0 || h > 24*30 {
		return def
	}
	return h
}

// GetAgentConnections 返回当前在线 Agent 数量与设备列表。
func GetAgentConnections(c *gin.Context) {
	keys := agent.AgentHub.ConnectedDeviceIDs()
	type agentEntry struct {
		DeviceID          uint       `json:"device_id"`
		ConnKey           string     `json:"conn_key"`
		Name              string     `json:"name"`
		Serial            string     `json:"serial"`
		AndroidSerial     string     `json:"android_serial"`
		Status            string     `json:"status"`
		LastSeenAt        *time.Time `json:"last_seen_at"`
		ForegroundPackage string     `json:"foreground_package"`
		ForegroundAppName string     `json:"foreground_app_name,omitempty"`
	}
	agents := make([]agentEntry, 0, len(keys))

	// 预加载所有 APK 应用的包名-名称映射
	var apps []models.App
	database.DB.Select("package_name, name").Find(&apps)
	appNameMap := make(map[string]string, len(apps))
	for _, app := range apps {
		if app.PackageName != "" {
			appNameMap[app.PackageName] = app.Name
		}
	}

	for _, k := range keys {
		e := agentEntry{ConnKey: k}
		if d, ok := agent.LookupDeviceByConnectionKey(k); ok {
			e.DeviceID = d.ID
			e.Name = d.Name
			e.Serial = d.Serial
			e.AndroidSerial = d.AndroidSerial
			e.Status = d.Status
			e.LastSeenAt = d.LastSeenAt
			e.ForegroundPackage = d.ForegroundPackage
			// 如果前台应用包名在 APK 管理中存在，填充应用名称
			if d.ForegroundPackage != "" {
				if appName, ok := appNameMap[d.ForegroundPackage]; ok {
					e.ForegroundAppName = appName
				}
			}
		}
		agents = append(agents, e)
	}
	sort.Slice(agents, func(i, j int) bool { return agents[i].DeviceID < agents[j].DeviceID })
	c.JSON(http.StatusOK, gin.H{
		"online_count": len(keys),
		"agents":       agents,
	})
}

// GetAgentOnlineTrend 返回 Agent 在线数时间序列（按分钟桶；集群多节点同桶求和）。
func GetAgentOnlineTrend(c *gin.Context) {
	hours := parseHoursParam(c, 24)
	since := time.Now().Add(-time.Duration(hours) * time.Hour)
	var samples []models.AgentOnlineSample
	database.DB.Where("sample_ts >= ?", since).Order("sample_ts asc").Find(&samples)

	type point struct {
		Ts     time.Time `json:"ts"`
		Online int       `json:"online"`
	}
	// 同一分钟桶跨节点求和
	sum := map[int64]int{}
	var order []int64
	for _, s := range samples {
		b := s.SampleTs.Truncate(time.Minute).Unix()
		if _, ok := sum[b]; !ok {
			order = append(order, b)
		}
		sum[b] += s.Online
	}
	sort.Slice(order, func(i, j int) bool { return order[i] < order[j] })
	points := make([]point, 0, len(order))
	for _, b := range order {
		points = append(points, point{Ts: time.Unix(b, 0), Online: sum[b]})
	}
	c.JSON(http.StatusOK, gin.H{"points": points})
}

// GetApiCallTrend 返回接口调用量时间序列，按来源（internal/external/anonymous）分组。
// granularity=hour（默认）或 minute。
func GetApiCallTrend(c *gin.Context) {
	hours := parseHoursParam(c, 24)
	since := time.Now().Add(-time.Duration(hours) * time.Hour)
	gran := c.Query("granularity")
	trunc := time.Hour
	if gran == "minute" {
		trunc = time.Minute
	}

	var rows []models.ApiCallMetric
	database.DB.Where("bucket_ts >= ?", since).Find(&rows)

	type point struct {
		Ts        time.Time `json:"ts"`
		Internal  int64     `json:"internal"`
		External  int64     `json:"external"`
		Device    int64     `json:"device"`
		Anonymous int64     `json:"anonymous"`
		Total     int64     `json:"total"`
	}
	agg := map[int64]*point{}
	var order []int64
	for _, r := range rows {
		b := r.BucketTs.Truncate(trunc).Unix()
		p := agg[b]
		if p == nil {
			p = &point{Ts: time.Unix(b, 0)}
			agg[b] = p
			order = append(order, b)
		}
		switch r.Source {
		case "internal":
			p.Internal += r.Count
		case "external":
			p.External += r.Count
		case "device":
			p.Device += r.Count
		default:
			p.Anonymous += r.Count
		}
		p.Total += r.Count
	}
	sort.Slice(order, func(i, j int) bool { return order[i] < order[j] })
	points := make([]point, 0, len(order))
	for _, b := range order {
		points = append(points, *agg[b])
	}
	c.JSON(http.StatusOK, gin.H{"points": points})
}

// GetApiCallDetails 返回按端点+方法聚合的调用详情（调用数、平均延迟、错误数），按调用数降序。
func GetApiCallDetails(c *gin.Context) {
	hours := parseHoursParam(c, 24)
	since := time.Now().Add(-time.Duration(hours) * time.Hour)

	var rows []models.ApiCallMetric
	database.DB.Where("bucket_ts >= ?", since).Find(&rows)

	type detailKey struct {
		endpoint string
		method   string
	}
	type detailAgg struct {
		count        int64
		sumLatencyMs int64
		errorCount   int64
	}
	m := map[detailKey]*detailAgg{}
	for _, r := range rows {
		k := detailKey{r.Endpoint, r.Method}
		a := m[k]
		if a == nil {
			a = &detailAgg{}
			m[k] = a
		}
		a.count += r.Count
		a.sumLatencyMs += r.SumLatencyMs
		if r.StatusClass == "4xx" || r.StatusClass == "5xx" {
			a.errorCount += r.Count
		}
	}

	type detail struct {
		Endpoint     string `json:"endpoint"`
		Method       string `json:"method"`
		Count        int64  `json:"count"`
		AvgLatencyMs int64  `json:"avg_latency_ms"`
		ErrorCount   int64  `json:"error_count"`
	}
	details := make([]detail, 0, len(m))
	for k, a := range m {
		avg := int64(0)
		if a.count > 0 {
			avg = a.sumLatencyMs / a.count
		}
		details = append(details, detail{
			Endpoint:     k.endpoint,
			Method:       k.method,
			Count:        a.count,
			AvgLatencyMs: avg,
			ErrorCount:   a.errorCount,
		})
	}
	sort.Slice(details, func(i, j int) bool { return details[i].Count > details[j].Count })
	c.JSON(http.StatusOK, gin.H{"details": details})
}
