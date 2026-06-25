package tests

import (
	"app-manager/schemasync"
	"path/filepath"
	"runtime"
	"testing"
)

func schemaDir(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	// server/tests -> repo root/schema
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", "schema"))
}

func TestSchemaReconcile_Registry(t *testing.T) {
	results, err := schemasync.ReconcileAll(schemaDir(t))
	if err != nil {
		t.Fatal(err)
	}
	if len(results) > 0 {
		t.Fatalf("schema/models drift:\n%s", schemasync.FormatResults(results))
	}
}
