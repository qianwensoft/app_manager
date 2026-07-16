package database

import (
	"log"

	"gorm.io/gorm"
)

// MigrateWorkOrderSettledAt 为历史工单回填 settled_at（结算时刻）。
// AutoMigrate 新增列后，已处于已解决/已关闭的旧工单 settled_at 为 NULL，
// 会导致「处理耗时」持续增长、且无法被自动归档规则命中。这里做一次性回填：
//   - closed_at 存在：settled_at = closed_at；
//   - 否则（resolved 无 closed_at）：settled_at = updated_at（近似结算时刻）。
//
// 幂等：仅回填 settled_at IS NULL 的结算态工单。
func MigrateWorkOrderSettledAt(db *gorm.DB) {
	// 有 closed_at 的：直接用 closed_at。
	r1 := db.Exec(`UPDATE work_orders
		SET settled_at = closed_at
		WHERE settled_at IS NULL
		  AND status IN ('resolved','closed')
		  AND closed_at IS NOT NULL`)
	if r1.Error != nil {
		log.Printf("[migrate] work_order settled_at (closed_at) failed: %v", r1.Error)
	}

	// resolved 且无 closed_at 的：近似用 updated_at。
	r2 := db.Exec(`UPDATE work_orders
		SET settled_at = updated_at
		WHERE settled_at IS NULL
		  AND status IN ('resolved','closed')
		  AND closed_at IS NULL`)
	if r2.Error != nil {
		log.Printf("[migrate] work_order settled_at (updated_at) failed: %v", r2.Error)
	}

	n := r1.RowsAffected + r2.RowsAffected
	if n > 0 {
		log.Printf("[migrate] work_order settled_at backfilled: %d rows", n)
	}
}
