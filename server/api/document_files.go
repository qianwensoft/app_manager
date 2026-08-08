package api

import (
	"app-manager/config"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// readFileString 读取文件全部内容为字符串（文本类文档）。
func readFileString(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// writeDocText 将文本内容落盘到 docs 分类目录，返回路径与字节数。
// 每次保存写入一个新文件（时间戳命名），保留历史版本文件不被覆盖。
func writeDocText(nodeID uint, content string) (string, int64, error) {
	dir := filepath.Join(config.C.Storage.Path, "docs")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", 0, err
	}
	name := fmt.Sprintf("doc-%d-%d.md", nodeID, time.Now().UnixMilli())
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return "", 0, err
	}
	return path, int64(len(content)), nil
}
