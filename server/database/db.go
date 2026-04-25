package database

import (
	"app-manager/config"
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
		return gorm.Open(sqlite.Dialector{
			DriverName: "sqlite",
			DSN:        dsn + "?_journal_mode=WAL&_busy_timeout=5000",
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
		&models.App{},
		&models.ApiKey{},
		&models.OAuthClient{},
		&models.OAuthAuthCode{},
		&models.ThirdPartyProvider{},
		&models.ThirdPartyToken{},
		&models.AuditLog{},
		&models.AgentUpdate{},
		&models.AgentMenuItem{},
		&models.AgentMenuAssignment{},
	},
	// Group 2 — device activity
	{
		&models.ScreenShareLink{},
		&models.InstallTask{},
		&models.Recording{},
		&models.RecordingShareLink{},
		&models.DeviceMedia{},
		&models.DeviceEvent{},
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
	// Group 7 — org
	{
		&models.Department{},
		&models.Position{},
		&models.UserDepartment{},
		&models.DeviceGroup{},
		&models.DeviceGroupMember{},
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
	// Run them concurrently where safe (all read-then-write, independent tables).
	var wg sync.WaitGroup
	wg.Add(4)
	go func() { defer wg.Done(); SeedDefaultCustomEvents(db) }()
	go func() { defer wg.Done(); MigrateLegacyOutboundPhases(db) }()
	go func() { defer wg.Done(); MigrateDeviceAndroidSerialUnique(db) }()
	go func() { defer wg.Done(); MigrateDataStackCode(db) }()
	wg.Wait()
	log.Printf("[db] Post-migrate tasks done in %v", time.Since(start))

	DB = db
	close(Ready)
	log.Printf("[db] Database ready in %v total", time.Since(start))
	return nil
}
