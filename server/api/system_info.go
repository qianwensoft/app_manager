package api

import (
	"app-manager/config"
	"app-manager/database"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

var startTime time.Time
var configMu sync.Mutex

func SetStartTime(t time.Time) {
	startTime = t
}

func maskDSN(dsn string) string {
	re := regexp.MustCompile(`:[^@]+@`)
	return re.ReplaceAllString(dsn, ":****@")
}

func checkToolInfo(toolPath string, toolName string, versionArg string) (available bool, version string, resolvedPath string) {
	path := toolPath
	if path == "" {
		p, err := exec.LookPath(toolName)
		if err != nil {
			return false, "", ""
		}
		path = p
	}
	out, err := exec.Command(path, versionArg).CombinedOutput()
	if err != nil {
		return false, "", path
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) > 0 {
		return true, lines[0], path
	}
	return true, "", path
}

func GetSystemInfo(c *gin.Context) {
	hostname, _ := os.Hostname()
	uptime := time.Since(startTime).Seconds()

	serverInfo := gin.H{
		"go_version":      runtime.Version(),
		"os":              runtime.GOOS,
		"arch":            runtime.GOARCH,
		"pid":             os.Getpid(),
		"hostname":        hostname,
		"uptime_seconds":  int64(uptime),
		"port":            config.C.Server.Port,
		"host":            config.C.Server.Host,
		"public_base_url": config.C.Server.PublicBaseURL,
	}

	dbType := "unknown"
	dsnMasked := ""
	pingOK := false
	poolInfo := gin.H{}

	if database.DB != nil {
		dbType = database.DB.Dialector.Name()
		dsnMasked = maskDSN(config.C.Database.DSN)
		if dbType == "sqlite" && dsnMasked == "" {
			dsnMasked = "./data/app-manager.db"
		}
		sqlDB, err := database.DB.DB()
		if err == nil {
			pingOK = sqlDB.Ping() == nil
			stats := sqlDB.Stats()
			poolInfo = gin.H{
				"max_open":            stats.MaxOpenConnections,
				"open":                stats.OpenConnections,
				"in_use":              stats.InUse,
				"idle":                stats.Idle,
				"wait_count":          stats.WaitCount,
				"wait_duration":       stats.WaitDuration.Milliseconds(),
				"max_idle_closed":     stats.MaxIdleClosed,
				"max_lifetime_closed": stats.MaxLifetimeClosed,
			}
		}
	}

	ffmpegAvail, ffmpegVer, ffmpegPath := checkToolInfo(config.C.FFmpeg.Path, "ffmpeg", "-version")
	adbAvail, adbVer, adbPath := checkToolInfo(config.C.ADB.Path, "adb", "version")

	c.JSON(http.StatusOK, gin.H{
		"server":      serverInfo,
		"database":    gin.H{"type": dbType, "dsn_masked": dsnMasked, "ping_ok": pingOK, "pool": poolInfo},
		"ffmpeg":      gin.H{"path": ffmpegPath, "available": ffmpegAvail, "version": ffmpegVer},
		"adb":         gin.H{"path": adbPath, "available": adbAvail, "version": adbVer},
		"storage":     gin.H{"path": config.C.Storage.Path, "max_size_mb": config.C.Storage.MaxSizeMB},
		"config_path": config.ConfigPath,
	})
}

type EnvUpdateReq struct {
	FFmpegPath       string `json:"ffmpeg_path"`
	ADBPath          string `json:"adb_path"`
	StoragePath      string `json:"storage_path"`
	StorageMaxSizeMB int64  `json:"storage_max_size_mb"`
	PublicBaseURL    string `json:"public_base_url"`
}

func UpdateEnvSettings(c *gin.Context) {
	var req EnvUpdateReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	configMu.Lock()
	defer configMu.Unlock()

	if req.FFmpegPath != "" {
		config.C.FFmpeg.Path = req.FFmpegPath
	}
	if req.ADBPath != "" {
		config.C.ADB.Path = req.ADBPath
	}
	if req.StoragePath != "" {
		config.C.Storage.Path = req.StoragePath
		os.MkdirAll(config.C.Storage.Path, 0755)
	}
	if req.StorageMaxSizeMB > 0 {
		config.C.Storage.MaxSizeMB = req.StorageMaxSizeMB
	}
	if req.PublicBaseURL != "" {
		config.C.Server.PublicBaseURL = req.PublicBaseURL
	}

	if err := config.Write(config.ConfigPath, config.C); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "写入配置失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":             "更新成功，配置已持久化",
		"ffmpeg_path":         config.C.FFmpeg.Path,
		"adb_path":            config.C.ADB.Path,
		"storage_path":        config.C.Storage.Path,
		"storage_max_size_mb": config.C.Storage.MaxSizeMB,
		"public_base_url":     config.C.Server.PublicBaseURL,
	})
}

func CheckFFmpeg(c *gin.Context) {
	avail, ver, path := checkToolInfo(config.C.FFmpeg.Path, "ffmpeg", "-version")
	c.JSON(http.StatusOK, gin.H{
		"available": avail,
		"version":   ver,
		"path":      path,
	})
}

func InstallFFmpeg(c *gin.Context) {
	if runtime.GOOS == "darwin" {
		c.JSON(http.StatusOK, gin.H{
			"installed": false,
			"message":   "macOS 建议使用 Homebrew 安装: brew install ffmpeg",
			"suggest":   "brew install ffmpeg",
		})
		return
	}
	if runtime.GOOS == "windows" {
		c.JSON(http.StatusBadRequest, gin.H{
			"installed": false,
			"message":   "Windows 暂不支持自动安装 ffmpeg，请手动下载",
		})
		return
	}

	// Linux: download johnvansickle.com static build
	downloadArch := "amd64"
	if runtime.GOARCH == "arm64" {
		downloadArch = "arm64"
	}

	downloadURL := "https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-" + downloadArch + "-static.tar.xz"
	tmpDir := filepath.Join("./data", "tools")
	os.MkdirAll(tmpDir, 0755)
	tmpFile := filepath.Join(tmpDir, "ffmpeg-download.tar.xz")

	resp, err := http.Get(downloadURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"installed": false, "message": "下载 ffmpeg 失败: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		c.JSON(http.StatusInternalServerError, gin.H{"installed": false, "message": fmt.Sprintf("下载失败，HTTP 状态: %d", resp.StatusCode)})
		return
	}

	f, err := os.Create(tmpFile)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"installed": false, "message": "创建临时文件失败: " + err.Error()})
		return
	}
	written, err := io.Copy(f, resp.Body)
	f.Close()
	if err != nil {
		os.Remove(tmpFile)
		c.JSON(http.StatusInternalServerError, gin.H{"installed": false, "message": "写入下载文件失败: " + err.Error()})
		return
	}

	// Extract using system xz + tar
	ffmpegBinPath := filepath.Join(tmpDir, "ffmpeg")
	extractCmd := exec.Command("sh", "-c", fmt.Sprintf("xzcat '%s' | tar -xf - -C '%s' --strip-components=1", tmpFile, tmpDir))
	if _, err := extractCmd.CombinedOutput(); err != nil {
		// Try tar with built-in xz support
		cmd2 := exec.Command("tar", "-xf", tmpFile, "-C", tmpDir, "--strip-components=1", "-J")
		if _, err2 := cmd2.CombinedOutput(); err2 != nil {
			os.Remove(tmpFile)
			c.JSON(http.StatusInternalServerError, gin.H{"installed": false, "message": fmt.Sprintf("解压失败: %v; fallback: %v", err, err2)})
			return
		}
	}
	os.Remove(tmpFile)

	os.Chmod(ffmpegBinPath, 0755)

	configMu.Lock()
	config.C.FFmpeg.Path = ffmpegBinPath
	config.Write(config.ConfigPath, config.C)
	configMu.Unlock()

	avail, ver, _ := checkToolInfo(ffmpegBinPath, "ffmpeg", "-version")
	c.JSON(http.StatusOK, gin.H{
		"installed": true,
		"message":   fmt.Sprintf("ffmpeg 已安装 (%d bytes downloaded)", written),
		"path":      ffmpegBinPath,
		"available": avail,
		"version":   ver,
	})
}
