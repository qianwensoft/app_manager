package outbound

import (
	"testing"

	"app-manager/config"
)

func TestBlockedSelfOpenAPIURL(t *testing.T) {
	config.C = &config.Config{
		Server: config.ServerConfig{
			Host:          "0.0.0.0",
			Port:          8080,
			PublicBaseURL: "http://192.168.1.10:8080",
		},
	}

	cases := []struct {
		url     string
		blocked bool
	}{
		{"http://127.0.0.1:8080/api/open/v1/data/foo", true},
		{"http://localhost:8080/api/open/v1/ingress/buffer/x", true},
		{"http://192.168.1.10:8080/api/open/v1/data/foo", true},
		{"https://external.example.com/api/open/v1/data/foo", false},
		{"http://127.0.0.1:8080/api/scada/infos", false},
		{"http://192.168.1.99:8080/api/open/v1/data/foo", false},
	}
	for _, tc := range cases {
		blocked, _ := BlockedSelfOpenAPIURL(tc.url)
		if blocked != tc.blocked {
			t.Fatalf("url %q blocked=%v want %v", tc.url, blocked, tc.blocked)
		}
	}
}
