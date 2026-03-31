package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server   ServerConfig   `yaml:"server"`
	Database DatabaseConfig `yaml:"database"`
	Storage  StorageConfig  `yaml:"storage"`
	ADB      ADBConfig      `yaml:"adb"`
	FFmpeg   FFmpegConfig   `yaml:"ffmpeg"`
	JWT      JWTConfig      `yaml:"jwt"`
}

type ServerConfig struct {
	Port int    `yaml:"port"`
	Host string `yaml:"host"`
	Mode string `yaml:"mode"`
}

type DatabaseConfig struct {
	Type string `yaml:"type"`
	DSN  string `yaml:"dsn"`
}

type StorageConfig struct {
	Path      string `yaml:"path"`
	MaxSizeMB int64  `yaml:"max_size_mb"`
}

type ADBConfig struct {
	Path    string `yaml:"path"`
	Timeout int    `yaml:"timeout"`
}

// FFmpegConfig 服务器侧录屏合成 MP4 依赖 ffmpeg；path 为空时在 PATH 中查找 "ffmpeg"。
type FFmpegConfig struct {
	Path string `yaml:"path"`
}

type JWTConfig struct {
	Secret     string `yaml:"secret"`
	ExpireHour int    `yaml:"expire_hour"`
}

var C *Config

func Load(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	C = &Config{}
	if err := yaml.Unmarshal(data, C); err != nil {
		return err
	}
	// 环境变量覆盖
	if v := os.Getenv("JWT_SECRET"); v != "" {
		C.JWT.Secret = v
	}
	if v := os.Getenv("ADB_PATH"); v != "" {
		C.ADB.Path = v
	}
	if v := os.Getenv("FFMPEG_PATH"); v != "" {
		C.FFmpeg.Path = v
	}
	return nil
}
