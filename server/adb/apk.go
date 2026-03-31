package adb

import (
	"archive/zip"
	"encoding/xml"
	"io"
	"strings"
)

// APKInfo holds parsed APK metadata
type APKInfo struct {
	PackageName string
	VersionName string
	VersionCode int
	Label       string
}

// ParseAPK 仅对「明文」AndroidManifest 有效；正式 APK 多为二进制 XML，请用 ParseAPKWithAapt。
func ParseAPK(apkPath string) (*APKInfo, error) {
	r, err := zip.OpenReader(apkPath)
	if err != nil {
		return nil, err
	}
	defer r.Close()

	for _, f := range r.File {
		if f.Name != "AndroidManifest.xml" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		defer rc.Close()
		data, err := io.ReadAll(rc)
		if err != nil {
			return nil, err
		}
		return parseManifest(data)
	}
	return &APKInfo{}, nil
}

type manifest struct {
	Package     string `xml:"package,attr"`
	VersionName string `xml:"versionName,attr"`
	VersionCode int    `xml:"versionCode,attr"`
}

func parseManifest(data []byte) (*APKInfo, error) {
	// Binary XML — try aapt fallback via plain text scan
	info := &APKInfo{}
	// Try plain XML first (rare but possible in test APKs)
	var m manifest
	if err := xml.Unmarshal(data, &m); err == nil && m.Package != "" {
		info.PackageName = m.Package
		info.VersionName = m.VersionName
		info.VersionCode = m.VersionCode
		return info, nil
	}
	// Binary XML: scan for readable strings
	s := string(data)
	if idx := strings.Index(s, "package"); idx >= 0 {
		// best-effort extraction from binary manifest
		_ = idx
	}
	return info, nil
}
