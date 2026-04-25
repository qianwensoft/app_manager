package datastack

import (
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"app-manager/dbdriver"
	"app-manager/models"

	"gorm.io/gorm"
)

// StartBufferPollers 后台轮询 kind=buffer 且 ingress.kind=http_poll 的数据集，将响应体写入缓冲表。
func StartBufferPollers(db *gorm.DB) {
	go func() {
		t := time.NewTicker(30 * time.Second)
		defer t.Stop()
		client := &http.Client{Timeout: 45 * time.Second}
		for range t.C {
			runOneBufferPollCycle(db, client)
		}
	}()
}

func runOneBufferPollCycle(db *gorm.DB, client *http.Client) {
	var sets []models.Dataset
	if err := db.Preload("DataSource").Where("kind = ?", "buffer").Find(&sets).Error; err != nil {
		return
	}
	for _, ds := range sets {
		meta, err := ParseBufferMeta(ds.MetaJSON)
		if err != nil || meta.Ingress == nil || ds.DataSource == nil || ds.DataSourceID == nil {
			continue
		}
		if strings.ToLower(strings.TrimSpace(meta.Ingress.Kind)) != "http_poll" && strings.ToLower(strings.TrimSpace(meta.Ingress.Kind)) != "poll" {
			continue
		}
		if meta.BufferTable == "" {
			continue
		}
		url := strings.TrimSpace(meta.Ingress.PollURL)
		if url == "" {
			continue
		}
		if ds.DataSource.IsReadOnly() {
			continue
		}
		method := strings.ToUpper(strings.TrimSpace(meta.Ingress.PollMethod))
		if method == "" {
			method = "GET"
		}
		req, err := http.NewRequest(method, url, strings.NewReader(meta.Ingress.PollBody))
		if err != nil {
			log.Printf("buffer poll: bad request for dataset %d: %v", ds.ID, err)
			continue
		}
		resp, err := client.Do(req)
		if err != nil {
			log.Printf("buffer poll: http error dataset %d: %v", ds.ID, err)
			continue
		}
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
		resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			log.Printf("buffer poll: status %d dataset %d", resp.StatusCode, ds.ID)
			continue
		}
		sqlDB, err := dbdriver.OpenDataSource(ds.DataSource)
		if err != nil {
			log.Printf("buffer poll: open db %v", err)
			continue
		}
		col := meta.RawColumnOrDefault()
		if err := dbdriver.InsertSingleColumnRow(sqlDB, ds.DataSource.Type, meta.BufferTable, col, b); err != nil {
			log.Printf("buffer poll: insert %v", err)
		}
		sqlDB.Close()
	}
}
