package api

import (
	"app-manager/stomp"
	"encoding/json"
	"net/http"
	"regexp"
	"sort"
	"time"

	"github.com/gin-gonic/gin"
)

// topic category patterns for grouping
var (
	reTopicDevice    = regexp.MustCompile(`^/topic/device/(\d+)/`)
	reTopicScada     = regexp.MustCompile(`^/topic/scada/point-data/([^/]+)$`)
	reTopicConnector = regexp.MustCompile(`^/topic/outbound/connectors/(\d+)/`)
	reTopicWebhook   = regexp.MustCompile(`^/topic/outbound/webhooks/(\d+)/`)
)

type stompTopicEntry struct {
	Topic    string `json:"topic"`
	SubCount int    `json:"sub_count"`
	MsgCount int64  `json:"msg_count"`
	Category string `json:"category"`
	// DimKey is the grouping key within the category (device id, scada code, etc.)
	DimKey string `json:"dim_key,omitempty"`
}

type stompCategoryGroup struct {
	Category string             `json:"category"`
	SubTotal int                `json:"sub_total"`
	MsgTotal int64              `json:"msg_total"`
	Topics   []*stompTopicEntry `json:"topics"`
}

func categorise(topic string) (category, dimKey string) {
	if m := reTopicDevice.FindStringSubmatch(topic); m != nil {
		return "device", m[1]
	}
	if m := reTopicScada.FindStringSubmatch(topic); m != nil {
		return "scada", m[1]
	}
	if m := reTopicConnector.FindStringSubmatch(topic); m != nil {
		return "connector", m[1]
	}
	if m := reTopicWebhook.FindStringSubmatch(topic); m != nil {
		return "webhook", m[1]
	}
	return "system", ""
}

func buildStompStats() []*stompCategoryGroup {
	raw := stomp.DefaultHub.Stats()

	entries := make([]*stompTopicEntry, 0, len(raw))
	for _, s := range raw {
		cat, dim := categorise(s.Topic)
		entries = append(entries, &stompTopicEntry{
			Topic:    s.Topic,
			SubCount: s.SubCount,
			MsgCount: s.MsgCount,
			Category: cat,
			DimKey:   dim,
		})
	}
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].Category != entries[j].Category {
			return entries[i].Category < entries[j].Category
		}
		return entries[i].Topic < entries[j].Topic
	})

	groupMap := map[string]*stompCategoryGroup{}
	groupOrder := []string{}
	for _, e := range entries {
		g := groupMap[e.Category]
		if g == nil {
			g = &stompCategoryGroup{Category: e.Category}
			groupMap[e.Category] = g
			groupOrder = append(groupOrder, e.Category)
		}
		g.Topics = append(g.Topics, e)
		g.SubTotal += e.SubCount
		g.MsgTotal += e.MsgCount
	}

	groups := make([]*stompCategoryGroup, 0, len(groupOrder))
	for _, cat := range groupOrder {
		groups = append(groups, groupMap[cat])
	}
	return groups
}

// GetStompStats returns current STOMP topic subscriber + message counts grouped by category.
func GetStompStats(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"groups":    buildStompStats(),
		"timestamp": time.Now(),
	})
}

// publishStompStats pushes a snapshot to /topic/monitor/stomp-stats.
func publishStompStats() {
	groups := buildStompStats()
	payload := map[string]any{
		"type":      "stomp_stats",
		"groups":    groups,
		"timestamp": time.Now().Format(time.RFC3339),
	}
	b, _ := json.Marshal(payload)
	stomp.DefaultHub.PublishJSON("/topic/monitor/stomp-stats", string(b))
}

// StartStompStatsPublisher wires up the subscribe hook so stats are pushed on every topology change.
func StartStompStatsPublisher() {
	stomp.SetSubscribeHook(publishStompStats)
}
