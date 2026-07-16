package database

import (
	"app-manager/config"
	"app-manager/migrations"
	"app-manager/models"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	_ "modernc.org/sqlite"
)

var DB *gorm.DB

// Ready is closed once DB is fully initialized (migrated + seeded).
var Ready = make(chan struct{})

func openDB(dbCfg config.DatabaseConfig) (*gorm.DB, error) {
	switch strings.ToLower(strings.TrimSpace(dbCfg.Type)) {
	case "mysql":
		return gorm.Open(mysql.Open(dbCfg.DSN), &gorm.Config{})
	case "sqlite", "":
		dsn := dbCfg.DSN
		if dsn == "" {
			dsn = "./data/app-manager.db"
		}
		// 使用 modernc.org/sqlite（DriverName: "sqlite"）专属的 _pragma 语法。
		// 旧写法 _journal_mode/_busy_timeout 是 mattn/go-sqlite3 语法，modernc 会忽略，
		// 导致 busy_timeout 从未生效，并发启动写入直接 SQLITE_BUSY。
		// _txlock=immediate 让事务在 BEGIN 时即获取写锁，配合 busy_timeout 串行等待。
		sep := "?"
		if strings.Contains(dsn, "?") {
			sep = "&"
		}
		dsn += sep + "_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_txlock=immediate"
		return gorm.Open(sqlite.Dialector{
			DriverName: "sqlite",
			DSN:        dsn,
		}, &gorm.Config{})
	default:
		return nil, fmt.Errorf("unsupported database type: %q (use mysql or sqlite)", dbCfg.Type)
	}
}

// Init tries to connect once. Returns error on unsupported type or SQLite failure.
// For MySQL connection failures it launches a background retry loop and returns nil
// so the caller (main) can start the HTTP server immediately.
func Init(dbCfg config.DatabaseConfig) error {
	dbType := strings.ToLower(strings.TrimSpace(dbCfg.Type))

	db, err := openDB(dbCfg)
	if err != nil {
		if dbType == "mysql" {
			log.Printf("[db] MySQL unreachable (%v); will retry in background — HTTP server starting now", err)
			go retryLoop(dbCfg)
			return nil
		}
		return err
	}
	return initSchema(db)
}

// retryLoop keeps trying to connect until success; closes Ready when done.
func retryLoop(dbCfg config.DatabaseConfig) {
	backoff := 5 * time.Second
	for {
		time.Sleep(backoff)
		log.Printf("[db] Retrying database connection...")
		db, err := openDB(dbCfg)
		if err != nil {
			log.Printf("[db] Still unreachable: %v", err)
			if backoff < 60*time.Second {
				backoff += 5 * time.Second
			}
			continue
		}
		if err := initSchema(db); err != nil {
			log.Printf("[db] Migration failed: %v", err)
			continue
		}
		return
	}
}

// migrateGroups defines independent model groups that can run concurrently on MySQL.
// SQLite has a single write lock, so groups are run sequentially there too —
// but the list structure makes it easy to switch later.
var migrateGroups = [][]interface{}{
	// Group 1 — core entities (no FK deps on later groups)
	{
		&models.User{},
		&models.Device{},
		&models.DeviceRealTimeStatus{},
		&models.App{},
		&models.ApiKey{},
		&models.OAuthClient{},
		&models.OAuthAuthCode{},
		&models.ThirdPartyProvider{},
		&models.ThirdPartyToken{},
		&models.ThirdPartyApiEndpoint{},
		&models.AuditLog{},
		&models.AgentUpdate{},
		&models.AgentMenuItem{},
		&models.AgentMenuAssignment{},
		&models.ApiCallMetric{},
		&models.AgentOnlineSample{},
	},
	// Group 2 — device activity
	{
		&models.ScreenShareLink{},
		&models.InstallTask{},
		&models.Recording{},
		&models.RecordingShareLink{},
		&models.DeviceMedia{},
		&models.DeviceEvent{},
		&models.AgentMenuExecutionLog{},
		&models.UploadLink{},
		&models.UploadedFile{},
	},
	// Group 3 — custom events
	{
		&models.CustomEventGroup{},
		&models.CustomEventDefinition{},
		&models.DeviceCustomListenState{},
	},
	// Group 4 — outbound pipeline
	{
		&models.OutboundApp{},
		&models.OutboundEndpoint{},
		&models.OutboundConnector{},
		&models.OutboundConnectorDefinition{},
		&models.OutboundConnectorDevice{},
		&models.DeviceOutboundConnectorState{},
		&models.OutboundConnectorEndpoint{},
		&models.OutboundConnectorPhase{},
		&models.OutboundConnectorStep{},
		&models.OutboundDelivery{},
		&models.OutboundWebhook{},
		&models.OutboundWebhookLog{},
		&models.OutboundWebhookEventType{},
	},
	// Group 5 — SCADA
	{
		&models.ScadaGroup{},
		&models.ScadaInfo{},
		&models.ScadaCustomizeComponent{},
		&models.ScadaSimPoint{},
		&models.ScadaDeployRule{},
		&models.ScadaDeployRecord{},
		&models.ScadaAccessPolicy{},
	},
	// Group 6 — data stack
	{
		&models.DataSource{},
		&models.Dataset{},
		&models.DataInterfaceGroup{},
		&models.DataStructure{},
		&models.DataInterface{},
	},
	// Group 7 — form app
	{
		&models.FormAppInfo{},
		&models.FormAppPage{},
		&models.FormAppPageLink{},
		&models.FormAppEventRoute{},
		&models.FormAppAccessPolicy{},
		&models.FormAppDraft{},
		&models.AISkill{},
		&models.FormPageSnapshot{},
	},
	// Group 8 — org
	{
		&models.Department{},
		&models.Position{},
		&models.UserDepartment{},
		&models.DeviceGroup{},
		&models.DeviceGroupMember{},
	},
	// Group 9 — work order (问题反馈/工单)
	{
		&models.WorkOrderType{},
		&models.WorkOrderWebhook{},
		&models.WorkOrderWebhookLog{},
		&models.WorkOrderWorkflow{},
		&models.WorkOrderWorkflowLog{},
		&models.WorkOrder{},
		&models.WorkOrderItem{},
		&models.WorkOrderActivity{},
		&models.WorkOrderTag{},
		&models.WorkOrderTagLink{},
		&models.WorkOrderProgress{},
		&models.WorkOrderProgressAttachment{},
		&models.WorkOrderReportShare{},
		&models.WorkOrderReportShareView{},
	},
	// Group 10 — workflow engine
	{
		&models.WorkflowDefinition{},
		&models.WorkflowExecution{},
		&models.WorkflowExecutionLog{},
		&models.CompensationDeadLetter{},
	},
	// Group 11 — x5 kernel
	{
		&models.X5KernelVersion{},
	},
}

func runAutoMigrate(db *gorm.DB) error {
	dbType := strings.ToLower(strings.TrimSpace(db.Dialector.Name()))

	if dbType == "mysql" {
		// MySQL supports concurrent DDL — run each group in parallel.
		var wg sync.WaitGroup
		errs := make([]error, len(migrateGroups))
		for i, group := range migrateGroups {
			wg.Add(1)
			go func(idx int, models []interface{}) {
				defer wg.Done()
				errs[idx] = db.AutoMigrate(models...)
			}(i, group)
		}
		wg.Wait()
		for _, err := range errs {
			if err != nil {
				return err
			}
		}
		return nil
	}

	// SQLite: single write lock — run groups sequentially but in one call per group
	// (still faster than one-by-one because GORM batches the PRAGMA reads).
	for _, group := range migrateGroups {
		if err := db.AutoMigrate(group...); err != nil {
			return err
		}
	}
	return nil
}

func initSchema(db *gorm.DB) error {
	start := time.Now()

	if err := runAutoMigrate(db); err != nil {
		return err
	}
	log.Printf("[db] AutoMigrate done in %v", time.Since(start))

	// One-time migrations — each is idempotent internally.
	postMigrate := []func(*gorm.DB){
		SeedDefaultCustomEvents,
		SeedDefaultAgentMenus,
		SeedDefaultWorkOrderTypes,
		MigrateLegacyOutboundPhases,
		MigrateDeviceAndroidSerialUnique,
		MigrateDataStackCode,
		MigrateThirdPartyAuthorizerAppID,
		MigrateFormAppToV2,
		MigrateWirelessAdbPort,
		MigrateConnectorInterfaceCodeIndex,
		MigrateLowCode,
		MigrateUserThirdParty,
		MigrateThirdPartyOutbound,
		migrations.MigrateDeviceX5Fields,
		func(db *gorm.DB) { migrations.AddWorkflowInterfaceFields(db) },
		MigrateWorkOrderSettledAt,
	}
	if strings.ToLower(strings.TrimSpace(db.Dialector.Name())) == "mysql" {
		// MySQL 支持并发写，并行执行加速启动。
		var wg sync.WaitGroup
		wg.Add(len(postMigrate))
		for _, fn := range postMigrate {
			go func(f func(*gorm.DB)) { defer wg.Done(); f(db) }(fn)
		}
		wg.Wait()
	} else {
		// SQLite 单写者：顺序执行，避免启动期多写者抢锁。
		for _, fn := range postMigrate {
			fn(db)
		}
	}
	log.Printf("[db] Post-migrate tasks done in %v", time.Since(start))

	DB = db
	close(Ready)
	log.Printf("[db] Database ready in %v total", time.Since(start))
	return nil
}
