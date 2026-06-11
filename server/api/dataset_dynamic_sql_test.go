package api

import (
	"strings"
	"testing"
)

// 新契约：{{name}} 占位符 + 缺失自动剔除；保留对旧 /*? ?*/ 块的兼容。
// api 层 RewriteNamedSQLParams / RewriteNamedSQLParamsOptional 委托至 dbdriver 统一实现。

func TestRewriteNamedSQLParams_Placeholder(t *testing.T) {
	out, args, err := RewriteNamedSQLParams("mysql", "SELECT * FROM users WHERE name = {{name}} AND age > {{min_age}}",
		map[string]interface{}{"name": "张三", "min_age": 18})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !strings.Contains(out, "name = ?") || !strings.Contains(out, "age > ?") {
		t.Errorf("placeholders not bound: %s", out)
	}
	if len(args) != 2 {
		t.Errorf("want 2 args, got %v", args)
	}
}

func TestRewriteNamedSQLParams_AutoStripMissing(t *testing.T) {
	out, args, err := RewriteNamedSQLParams("mysql",
		"SELECT * FROM users WHERE 1=1 AND name = {{name}} AND age > {{min_age}} ORDER BY id LIMIT {{limit}}",
		map[string]interface{}{"name": "张三", "limit": 10})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if strings.Contains(out, "age") {
		t.Errorf("missing min_age clause should be stripped: %s", out)
	}
	if !strings.Contains(out, "name = ?") || !strings.Contains(out, "LIMIT ?") {
		t.Errorf("present clauses must bind: %s", out)
	}
	if len(args) != 2 {
		t.Errorf("want 2 args (name, limit), got %v", args)
	}
}

func TestRewriteNamedSQLParams_InsertDropsMissing(t *testing.T) {
	out, args, err := RewriteNamedSQLParams("mysql",
		"INSERT INTO users (name, age, email) VALUES ({{name}}, {{age}}, {{email}})",
		map[string]interface{}{"name": "王五", "age": 25})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if strings.Contains(out, "email") {
		t.Errorf("missing email column should be dropped: %s", out)
	}
	if len(args) != 2 {
		t.Errorf("want 2 args, got %v", args)
	}
}

func TestRewriteNamedSQLParamsOptional_Delegates(t *testing.T) {
	// optional 版本现等价于自动剔除；缺失 status 子句应消失
	out, args, err := RewriteNamedSQLParamsOptional("postgres",
		"SELECT * FROM users WHERE 1=1 AND name = {{name}} AND status = {{status}}",
		map[string]interface{}{"name": "李四"})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if strings.Contains(out, "status") {
		t.Errorf("missing status clause should be stripped: %s", out)
	}
	if !strings.Contains(out, "$1") || len(args) != 1 {
		t.Errorf("postgres bind failed: %s %v", out, args)
	}
}

func TestStripMissingOptionalBlocks_LegacyCompat(t *testing.T) {
	// 旧 /*? ?*/ 写法仍受支持：块内 {{}} 缺失则整块移除
	got := StripMissingOptionalBlocks(
		"SELECT * FROM users WHERE 1=1 /*? AND name = {{name}} ?*/ /*? AND age > {{min_age}} ?*/",
		map[string]interface{}{"name": "张三"})
	if !strings.Contains(got, "name = {{name}}") {
		t.Errorf("present-param block should be kept: %s", got)
	}
	if strings.Contains(got, "min_age") {
		t.Errorf("missing-param block should be removed: %s", got)
	}
}

func TestExtractSQLNamedParamNames_Placeholder(t *testing.T) {
	names := extractSQLNamedParamNames("SELECT * FROM t WHERE a = {{a}} AND b = {{ b }}")
	if len(names) != 2 || names[0] != "a" || names[1] != "b" {
		t.Errorf("extract wrong: %v", names)
	}
}
