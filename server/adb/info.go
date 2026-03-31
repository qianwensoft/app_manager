package adb

import (
	"strconv"
	"strings"
)

type DeviceInfo struct {
	Serial       string `json:"serial"`
	Model        string `json:"model"`
	Brand        string `json:"brand"`
	OSVersion    string `json:"os_version"`
	SDKVersion   int    `json:"sdk_version"`
	CPUInfo      string `json:"cpu_info"`
	TotalMemory  int64  `json:"total_memory"`
	TotalStorage int64  `json:"total_storage"`
	Resolution   string `json:"resolution"`
	IPAddress    string `json:"ip_address"`
}

type PackageInfo struct {
	PackageName string `json:"package_name"`
	VersionName string `json:"version_name"`
	VersionCode int    `json:"version_code"`
}

func (c *Client) GetDeviceInfo(serial string) (*DeviceInfo, error) {
	info := &DeviceInfo{Serial: serial}

	info.Model, _ = c.GetProp(serial, "ro.product.model")
	info.Brand, _ = c.GetProp(serial, "ro.product.brand")
	info.OSVersion, _ = c.GetProp(serial, "ro.build.version.release")
	sdkStr, _ := c.GetProp(serial, "ro.build.version.sdk")
	info.SDKVersion, _ = strconv.Atoi(strings.TrimSpace(sdkStr))

	// CPU
	cpuOut, _ := c.Shell(serial, "cat /proc/cpuinfo | grep Hardware | head -1")
	if idx := strings.Index(cpuOut, ":"); idx >= 0 {
		info.CPUInfo = strings.TrimSpace(cpuOut[idx+1:])
	}

	// 内存 (MB)
	memOut, _ := c.Shell(serial, "cat /proc/meminfo | grep MemTotal")
	for _, f := range strings.Fields(memOut) {
		if kb, err := strconv.ParseInt(f, 10, 64); err == nil {
			info.TotalMemory = kb / 1024
			break
		}
	}

	// 存储 (MB)
	dfOut, _ := c.Shell(serial, "df /data | tail -1")
	fields := strings.Fields(dfOut)
	if len(fields) >= 2 {
		if kb, err := strconv.ParseInt(fields[1], 10, 64); err == nil {
			info.TotalStorage = kb / 1024
		}
	}

	// 分辨率
	wmOut, _ := c.Shell(serial, "wm size")
	if idx := strings.Index(wmOut, ":"); idx >= 0 {
		info.Resolution = strings.TrimSpace(wmOut[idx+1:])
	}

	// IP
	ipOut, _ := c.Shell(serial, "ip route | grep src | awk '{print $NF}' | head -1")
	info.IPAddress = strings.TrimSpace(ipOut)

	return info, nil
}

func (c *Client) ListPackages(serial string) ([]PackageInfo, error) {
	out, err := c.Shell(serial, "pm list packages -3")
	if err != nil {
		return nil, err
	}

	var packages []PackageInfo
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "package:") {
			continue
		}
		pkg := strings.TrimPrefix(line, "package:")

		// 获取版本
		dumpOut, _ := c.Shell(serial, "dumpsys package "+pkg+" | grep versionName | head -1")
		versionName := ""
		if idx := strings.Index(dumpOut, "versionName="); idx >= 0 {
			rest := dumpOut[idx+len("versionName="):]
			versionName = strings.Fields(rest)[0]
		}

		packages = append(packages, PackageInfo{
			PackageName: pkg,
			VersionName: versionName,
		})
	}
	return packages, nil
}
