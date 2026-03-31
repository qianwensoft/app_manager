package agent

import "sync"

// InstalledAppEntry 与 ADB / Web「已安装应用」列表字段一致。
type InstalledAppEntry struct {
	PackageName string `json:"package_name"`
	VersionName string `json:"version_name"`
	VersionCode int    `json:"version_code"`
}

// InstalledAppsReply Web 等待 Agent 返回的已安装应用列表。
type InstalledAppsReply struct {
	Apps []InstalledAppEntry
	Err  string
}

var installedAppsMu sync.Mutex
var installedAppsWaiters = make(map[string]chan InstalledAppsReply)

func RegisterInstalledAppsWait(id string) <-chan InstalledAppsReply {
	ch := make(chan InstalledAppsReply, 1)
	installedAppsMu.Lock()
	installedAppsWaiters[id] = ch
	installedAppsMu.Unlock()
	return ch
}

func ForgetInstalledAppsWait(id string) {
	installedAppsMu.Lock()
	delete(installedAppsWaiters, id)
	installedAppsMu.Unlock()
}

func DeliverInstalledAppsResult(id string, apps []InstalledAppEntry, err string) {
	installedAppsMu.Lock()
	ch, ok := installedAppsWaiters[id]
	if ok {
		delete(installedAppsWaiters, id)
	}
	installedAppsMu.Unlock()
	if !ok {
		return
	}
	select {
	case ch <- InstalledAppsReply{Apps: apps, Err: err}:
	default:
	}
}
