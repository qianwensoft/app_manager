package outbound

import (
	"reflect"
	"testing"
)

func TestTemplateContextKVList_sortsAndFilters(t *testing.T) {
	vars := map[string]string{
		"{{context.b}}": "2",
		"{{device.id}}": "x",
		"{{context.a}}": "1",
	}
	got := TemplateContextKVList(vars)
	want := []map[string]string{
		{"key": "{{context.a}}", "value": "1"},
		{"key": "{{context.b}}", "value": "2"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v want %#v", got, want)
	}
}

func TestTemplateContextKVList_nilEmpty(t *testing.T) {
	if TemplateContextKVList(nil) != nil {
		t.Fatal("expected nil")
	}
	if TemplateContextKVList(map[string]string{}) != nil {
		t.Fatal("expected nil for no context keys")
	}
}
