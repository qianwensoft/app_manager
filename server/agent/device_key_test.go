package agent

import (
	"app-manager/database"
	"app-manager/models"
	"os"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestAgentConnectionKeyCandidates_ADBSerialFallback(t *testing.T) {
	f, err := os.CreateTemp("", "device-key-*.db")
	if err != nil {
		t.Fatal(err)
	}
	f.Close()
	defer os.Remove(f.Name())

	db, err := gorm.Open(sqlite.Open(f.Name()), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.Device{}); err != nil {
		t.Fatal(err)
	}
	database.DB = db

	sn := "SC40GFK00507"
	if err := db.Create(&models.Device{
		Serial:        sn,
		Name:          "PDA",
		AndroidSerial: sn,
	}).Error; err != nil {
		t.Fatal(err)
	}

	keys, err := AgentConnectionKeyCandidates("1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(keys) == 0 || keys[0] != sn {
		t.Fatalf("expected first key %q, got %v", sn, keys)
	}
}
