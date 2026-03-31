package adb

import (
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"strings"

	goapk "github.com/shogo82148/androidbinary/apk"
)

// ParseAPKWithAapt 解析 APK 包名与版本：优先 aapt/aapt2（若在 PATH），否则用纯 Go 读二进制 AndroidManifest（不依赖 Android SDK）。
func ParseAPKWithAapt(apkPath string) (*APKInfo, error) {
	for _, tool := range []string{"aapt2", "aapt"} {
		path, err := exec.LookPath(tool)
		if err != nil {
			continue
		}
		out, err := exec.Command(path, "dump", "badging", apkPath).Output()
		if err != nil {
			continue
		}
		info := parseAaptOutput(string(out))
		if info.PackageName != "" {
			return info, nil
		}
	}
	if info, err := parseAPKWithAndroidBinary(apkPath); err == nil && info.PackageName != "" {
		return info, nil
	}
	// 末级：zip 内明文 Manifest（几乎仅测试包有效）
	return ParseAPK(apkPath)
}

func parseAPKWithAndroidBinary(apkPath string) (*APKInfo, error) {
	k, err := goapk.OpenFile(apkPath)
	if err != nil {
		return nil, err
	}
	defer k.Close()
	info := &APKInfo{}
	info.PackageName = k.PackageName()
	if info.PackageName == "" {
		return info, fmt.Errorf("androidbinary: empty package")
	}
	m := k.Manifest()
	if s, err := m.VersionName.String(); err == nil {
		info.VersionName = s
	}
	if vc, err := m.VersionCode.Int32(); err == nil {
		info.VersionCode = int(vc)
	}
	return info, nil
}

var (
	rePkg     = regexp.MustCompile(`package: name='([^']+)'`)
	reVName   = regexp.MustCompile(`versionName='([^']+)'`)
	reVCode   = regexp.MustCompile(`versionCode='([^']+)'`)
	reLabel   = regexp.MustCompile(`application-label(?:-en)?:'([^']+)'`)
)

func parseAaptOutput(out string) *APKInfo {
	info := &APKInfo{}
	if m := rePkg.FindStringSubmatch(out); len(m) > 1 {
		info.PackageName = m[1]
	}
	if m := reVName.FindStringSubmatch(out); len(m) > 1 {
		info.VersionName = m[1]
	}
	if m := reVCode.FindStringSubmatch(out); len(m) > 1 {
		info.VersionCode, _ = strconv.Atoi(m[1])
	}
	if m := reLabel.FindStringSubmatch(out); len(m) > 1 {
		info.Label = strings.Trim(m[1], "'")
	}
	return info
}

// FormatSize formats bytes to human readable
func FormatSize(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}
