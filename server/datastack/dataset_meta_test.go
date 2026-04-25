package datastack

import (
	"testing"
)

func ptr(b bool) *bool { return &b }

func TestValidateDatasetMetaForKind_webhookRequiresTable(t *testing.T) {
	ds := uint(1)
	err := ValidateDatasetMetaForKind("buffer", `{"ingress":{"kind":"http_webhook"},"buffer_table":"evt_buf"}`, &ds)
	if err != nil {
		t.Fatal(err)
	}
	err = ValidateDatasetMetaForKind("buffer", `{"ingress":{"kind":"http_webhook"}}`, &ds)
	if err == nil {
		t.Fatal("expected error without buffer_table")
	}
}

func TestValidateDatasetMetaForKind_pollOptionalTable(t *testing.T) {
	ds := uint(1)
	err := ValidateDatasetMetaForKind("buffer", `{"ingress":{"kind":"http_poll","cache_required":false}}`, &ds)
	if err != nil {
		t.Fatal(err)
	}
}

func TestIngressPhysicalTableRequired_defaults(t *testing.T) {
	if !IngressPhysicalTableRequired("http_webhook", nil) {
		t.Fatal("webhook default true")
	}
	if IngressPhysicalTableRequired("http_poll", nil) {
		t.Fatal("poll default false")
	}
	if !IngressPhysicalTableRequired("http_poll", ptr(true)) {
		t.Fatal("poll explicit true")
	}
	if IngressPhysicalTableRequired("http_poll", ptr(false)) {
		t.Fatal("poll explicit false")
	}
}
