package api

import (
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"app-manager/database"
	"app-manager/models"

	"github.com/gin-gonic/gin"
)

// autoArchiveScanInterval 自动归档扫描周期。
const autoArchiveScanInterval = 5 * time.Minute

// StartWorkOrderAutoArchiver 启动工单自动归档后台任务：
// 周期扫描各工单类型的自动归档规则，将「已到达约定结算状态（已解决/已关闭）
// 并停留超过约定时长」的未归档工单自动归档，并在时间线写入「系统自动归档」标识。
func StartWorkOrderAutoArchiver() {
	go func() {
		// 启动后稍等，避开迁移/种子数据竞争，再首扫。
		time.Sleep(30 * time.Second)
		ticker := time.NewTicker(autoArchiveScanInterval)
		defer ticker.Stop()
		runWorkOrderAutoArchiveOnce()
		for range ticker.C {
			runWorkOrderAutoArchiveOnce()
		}
	}()
}

// RunWorkOrderTypeAutoArchive 手动「立即执行」某工单类型的自动归档扫描。
// POST /api/work-orders/types/:id/auto-archive/run
func RunWorkOrderTypeAutoArchive(c *gin.Context) {
	var t models.WorkOrderType
	if err := database.DB.First(&t, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if !t.AutoArchiveEnabled {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该类型未启用自动归档"})
		return
	}
	archived := autoArchiveTypeOnce(&t)
	c.JSON(http.StatusOK, gin.H{
		"archived":             archived,
		"last_auto_archive_at": t.LastAutoArchiveAt,
	})
}

// runWorkOrderAutoArchiveOnce 执行一轮自动归档扫描（所有启用类型）。
func runWorkOrderAutoArchiveOnce() {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[wo-auto-archive] panic recovered: %v", r)
		}
	}()

	var types []models.WorkOrderType
	if err := database.DB.Where("auto_archive_enabled = ?", true).Find(&types).Error; err != nil {
		log.Printf("[wo-auto-archive] load types failed: %v", err)
		return
	}

	for i := range types {
		autoArchiveTypeOnce(&types[i])
	}
}

// autoArchiveTypeOnce 对单个类型执行一次自动归档扫描，返回本次归档数量。
// 无论是否有命中，都会更新该类型的 last_auto_archive_at / last_auto_archive_count，
// 便于前端展示「上次执行时间」与「立即执行」结果。
func autoArchiveTypeOnce(t *models.WorkOrderType) int {
	now := time.Now()
	statuses := parseAutoArchiveStatuses(t.AutoArchiveStatuses)
	archived := 0
	if len(statuses) == 0 {
		recordAutoArchiveRun(t, now, 0)
		return 0
	}
	delay := time.Duration(t.AutoArchiveDelayMinutes) * time.Minute
	// 截止时间：结算时刻早于该点的工单才够时长。delay<=0 表示到达即归档。
	cutoff := now.Add(-delay)

	var rows []models.WorkOrder
	err := database.DB.
		Where("type_code = ?", t.Code).
		Where("status IN ?", statuses).
		Where("(archived = ? OR archived IS NULL)", false).
		Where("settled_at IS NOT NULL AND settled_at <= ?", cutoff).
		Find(&rows).Error
	if err != nil {
		log.Printf("[wo-auto-archive] query type=%s failed: %v", t.Code, err)
		recordAutoArchiveRun(t, now, 0)
		return 0
	}
	for j := range rows {
		archiveWorkOrderBySystem(&rows[j], now, delay)
		archived++
	}
	recordAutoArchiveRun(t, now, archived)
	return archived
}

// recordAutoArchiveRun 记录某类型最近一次自动归档扫描的时刻与归档数量。
func recordAutoArchiveRun(t *models.WorkOrderType, at time.Time, count int) {
	database.DB.Model(&models.WorkOrderType{}).Where("id = ?", t.ID).Updates(map[string]interface{}{
		"last_auto_archive_at":    &at,
		"last_auto_archive_count": count,
	})
	t.LastAutoArchiveAt = &at
	t.LastAutoArchiveCount = count
}

// archiveWorkOrderBySystem 系统自动归档单个工单：更新归档字段 + 写时间线 + 实时事件。
func archiveWorkOrderBySystem(wo *models.WorkOrder, now time.Time, delay time.Duration) {
	if err := database.DB.Model(wo).Updates(map[string]interface{}{
		"archived":    true,
		"archived_at": &now,
		"archived_by": nil, // 系统操作，无归档人
	}).Error; err != nil {
		log.Printf("[wo-auto-archive] archive wo=%s failed: %v", wo.Code, err)
		return
	}
	wo.Archived = true
	wo.ArchivedAt = &now

	detail := "系统自动归档：到达「" + workOrderStatusLabel(wo.Status) + "」并超过 " + humanizeAutoArchiveDelay(delay)
	// actorUserID=0、actorLabel="系统" 表示系统操作（与第三方=0 区分靠 label）。
	addWorkOrderActivity(wo.ID, "auto_archive", wo.Status, wo.Status, 0, "系统", detail)

	// 实时推送：归档后默认列表/看板不再展示，前端据此移除卡片/行。
	dispatchWorkOrderEvent("work_order.archived", wo, "系统", detail)
	log.Printf("[wo-auto-archive] archived wo=%s type=%s status=%s", wo.Code, wo.TypeCode, wo.Status)
}

// parseAutoArchiveStatuses 解析逗号分隔的结算状态；空则默认 resolved,closed。
// 仅保留结算态（resolved/closed），忽略其它，避免误归档进行中工单。
func parseAutoArchiveStatuses(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []string{"resolved", "closed"}
	}
	out := make([]string, 0, 2)
	seen := map[string]bool{}
	for _, p := range strings.Split(raw, ",") {
		s := strings.TrimSpace(p)
		if s != "" && isSettledStatus(s) && !seen[s] {
			out = append(out, s)
			seen[s] = true
		}
	}
	return out
}

// humanizeAutoArchiveDelay 把时长转为「N天/N小时/N分钟」中文，用于时间线说明。
func humanizeAutoArchiveDelay(d time.Duration) string {
	if d <= 0 {
		return "即时"
	}
	mins := int(d.Minutes())
	days := mins / (60 * 24)
	hours := (mins % (60 * 24)) / 60
	rem := mins % 60
	switch {
	case days > 0 && hours > 0:
		return strconv.Itoa(days) + "天" + strconv.Itoa(hours) + "小时"
	case days > 0:
		return strconv.Itoa(days) + "天"
	case hours > 0 && rem > 0:
		return strconv.Itoa(hours) + "小时" + strconv.Itoa(rem) + "分钟"
	case hours > 0:
		return strconv.Itoa(hours) + "小时"
	default:
		return strconv.Itoa(mins) + "分钟"
	}
}
