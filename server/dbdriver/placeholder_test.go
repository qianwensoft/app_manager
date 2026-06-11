package dbdriver

import (
	"strings"
	"testing"
)

func TestRewritePlaceholder_Basic(t *testing.T) {
	out, args, err := RewriteNamedSQLParams("sqlite", "SELECT * FROM t WHERE id = {{id}}", map[string]interface{}{"id": 5})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !strings.Contains(out, "= ?") {
		t.Errorf("expected ? placeholder, got %s", out)
	}
	if len(args) != 1 || args[0] != 5 {
		t.Errorf("args wrong: %v", args)
	}
}

func TestRewritePlaceholder_Postgres(t *testing.T) {
	out, _, err := RewriteNamedSQLParams("postgres", "SELECT * FROM t WHERE a = {{a}} AND b = {{b}}", map[string]interface{}{"a": 1, "b": 2})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !strings.Contains(out, "$1") || !strings.Contains(out, "$2") {
		t.Errorf("expected $1/$2, got %s", out)
	}
}

func TestRewritePlaceholder_Whitespace(t *testing.T) {
	out, args, err := RewriteNamedSQLParams("sqlite", "WHERE x = {{ x }}", map[string]interface{}{"x": 9})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !strings.Contains(out, "= ?") || len(args) != 1 {
		t.Errorf("whitespace placeholder failed: %s %v", out, args)
	}
}

func TestAutoStrip_MissingWhereClause(t *testing.T) {
	sql := "SELECT * FROM t WHERE 1=1 AND status = {{status}} AND age >= {{min_age}} ORDER BY id"
	out, args, err := RewriteNamedSQLParams("sqlite", sql, map[string]interface{}{"status": "active"})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if strings.Contains(out, "age") {
		t.Errorf("missing min_age clause should be stripped: %s", out)
	}
	if !strings.Contains(out, "status = ?") {
		t.Errorf("present clause must remain: %s", out)
	}
	if !strings.Contains(out, "ORDER BY id") {
		t.Errorf("tail must be preserved: %s", out)
	}
	if len(args) != 1 {
		t.Errorf("only status arg expected: %v", args)
	}
}

func TestAutoStrip_AllClausesGone(t *testing.T) {
	sql := "SELECT * FROM t WHERE status = {{status}} ORDER BY id"
	out, _, err := RewriteNamedSQLParams("sqlite", sql, map[string]interface{}{})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if strings.Contains(strings.ToUpper(out), "WHERE") {
		t.Errorf("WHERE should be removed when all clauses stripped: %s", out)
	}
	if !strings.Contains(out, "ORDER BY id") {
		t.Errorf("ORDER BY must remain: %s", out)
	}
}

func TestAutoStrip_FirstClauseMissing(t *testing.T) {
	// first fragment missing, second present → second becomes leading (no dangling AND)
	sql := "SELECT * FROM t WHERE a = {{a}} AND b = {{b}}"
	out, args, err := RewriteNamedSQLParams("sqlite", sql, map[string]interface{}{"b": 2})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if strings.Contains(out, "a =") {
		t.Errorf("missing a clause should be gone: %s", out)
	}
	up := strings.ToUpper(out)
	if strings.Contains(up, "WHERE AND") || strings.Contains(up, "WHERE  AND") {
		t.Errorf("dangling AND after WHERE: %s", out)
	}
	if len(args) != 1 || args[0] != 2 {
		t.Errorf("only b expected: %v", args)
	}
}

func TestAutoStrip_InsertMissingColumn(t *testing.T) {
	sql := "INSERT INTO t (id, name, age) VALUES ({{id}}, {{name}}, {{age}})"
	out, args, err := RewriteNamedSQLParams("sqlite", sql, map[string]interface{}{"name": "x", "age": 3})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if strings.Contains(out, "id") {
		t.Errorf("missing id column should be dropped: %s", out)
	}
	if !strings.Contains(out, "name") || !strings.Contains(out, "age") {
		t.Errorf("present columns must remain: %s", out)
	}
	if len(args) != 2 {
		t.Errorf("2 args expected: %v", args)
	}
}

func TestLegacyOptionalBlockStillWorks(t *testing.T) {
	sql := "SELECT * FROM t WHERE 1=1 /*? AND k = {{k}} ?*/"
	// missing k → block removed
	out, _, err := RewriteNamedSQLParams("sqlite", sql, map[string]interface{}{})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if strings.Contains(out, "k =") {
		t.Errorf("legacy block with missing param should be removed: %s", out)
	}
	// present k → block kept
	out2, args2, err := RewriteNamedSQLParams("sqlite", sql, map[string]interface{}{"k": 7})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !strings.Contains(out2, "k = ?") || len(args2) != 1 {
		t.Errorf("legacy block with present param should bind: %s %v", out2, args2)
	}
}

func TestExtractPlaceholderNames(t *testing.T) {
	names := ExtractPlaceholderNames("WHERE a={{a}} AND b={{ b }} AND a2={{a}}")
	if len(names) != 2 || names[0] != "a" || names[1] != "b" {
		t.Errorf("dedup/order wrong: %v", names)
	}
}

func TestNoPlaceholders_Unchanged(t *testing.T) {
	sql := "SELECT * FROM t WHERE id = 5"
	out, args, err := RewriteNamedSQLParams("sqlite", sql, map[string]interface{}{})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if out != sql || len(args) != 0 {
		t.Errorf("plain SQL must be unchanged: %q args=%v", out, args)
	}
}
