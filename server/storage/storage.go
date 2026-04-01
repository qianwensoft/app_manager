package storage

import (
	"app-manager/config"
	"fmt"
	"mime/multipart"
	"os"
	"path/filepath"
	"time"
)

func SaveFile(file *multipart.FileHeader, category string) (string, error) {
	dir := filepath.Join(config.C.Storage.Path, category)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	ext := filepath.Ext(file.Filename)
	name := fmt.Sprintf("%d%s", time.Now().UnixMilli(), ext)
	path := filepath.Join(dir, name)
	src, err := file.Open()
	if err != nil {
		return "", err
	}
	defer src.Close()
	dst, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer dst.Close()
	if _, err := dst.ReadFrom(src); err != nil {
		return "", err
	}
	return path, nil
}
