package api

import (
	"app-manager/adb"
	"strings"
)

func lookupAdbSerialState(cli *adb.Client, serial string) string {
	serial = strings.TrimSpace(serial)
	if serial == "" {
		return "not_configured"
	}
	states, err := cli.ListDeviceStates()
	if err != nil {
		return "no_device"
	}
	if st, ok := states[serial]; ok && st != "" {
		return strings.TrimSpace(st)
	}
	return "offline"
}
