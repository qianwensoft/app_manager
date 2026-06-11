package datastack

import (
	"strings"
	"testing"

	"app-manager/models"
)

func TestParseIfaceShaping_Empty(t *testing.T) {
	sh, err := ParseIfaceShaping(&models.DataInterface{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(sh.Params) != 0 || len(sh.Filters) != 0 || len(sh.Sort) != 0 {
		t.Fatalf("expected empty shaping for empty fields")
	}
}

func TestParseIfaceShaping_All(t *testing.T) {
	iface := &models.DataInterface{
		ParamContractJSON: `[{"name":"id","type":"integer","required":true}]`,
		FieldMappingJSON:  `{"fields":[{"from":"user_name","to":"name"}]}`,
		ExtraFiltersJSON:  `[{"field":"status","operator":"eq","value":"active"}]`,
		SortJSON:          `[{"field":"created_at","desc":true}]`,
		PaginationJSON:    `{"enabled":true,"default_limit":20,"max_limit":100}`,
	}
	sh, err := ParseIfaceShaping(iface)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	if len(sh.Params) != 1 || sh.Params[0].Name != "id" || !sh.Params[0].Required {
		t.Errorf("params parse failed: %+v", sh.Params)
	}
	if len(sh.Projection.Fields) != 1 || sh.Projection.Fields[0].To != "name" {
		t.Errorf("projection parse failed: %+v", sh.Projection)
	}
	if len(sh.Filters) != 1 || sh.Filters[0].Operator != "eq" {
		t.Errorf("filters parse failed: %+v", sh.Filters)
	}
	if !sh.Pagination.Enabled || sh.Pagination.DefaultLimit != 20 || sh.Pagination.MaxLimit != 100 {
		t.Errorf("pagination parse failed: %+v", sh.Pagination)
	}
}

func TestValidateParams_Required(t *testing.T) {
	specs := []ParamSpec{{Name: "id", Type: "integer", Required: true}}
	if err := ValidateParams(specs, map[string]interface{}{}); err == nil {
		t.Error("expected error for missing required")
	}
	if err := ValidateParams(specs, map[string]interface{}{"id": 5}); err != nil {
		t.Errorf("expected ok, got %v", err)
	}
}

func TestValidateParams_Type(t *testing.T) {
	five := float64(5)
	specs := []ParamSpec{{Name: "n", Type: "integer", Min: &five}}
	if err := ValidateParams(specs, map[string]interface{}{"n": "abc"}); err == nil {
		t.Error("expected type error")
	}
	if err := ValidateParams(specs, map[string]interface{}{"n": 3}); err == nil {
		t.Error("expected min error")
	}
	if err := ValidateParams(specs, map[string]interface{}{"n": 5}); err != nil {
		t.Errorf("ok case failed: %v", err)
	}
	if err := ValidateParams(specs, map[string]interface{}{"n": 3.5}); err == nil {
		t.Error("expected non-integer error")
	}
}

func TestValidateParams_Enum(t *testing.T) {
	specs := []ParamSpec{{Name: "status", Enum: []interface{}{"active", "pending"}}}
	if err := ValidateParams(specs, map[string]interface{}{"status": "deleted"}); err == nil {
		t.Error("expected enum error")
	}
	if err := ValidateParams(specs, map[string]interface{}{"status": "active"}); err != nil {
		t.Errorf("ok case failed: %v", err)
	}
}

func TestValidateParams_DefaultSatisfiesRequired(t *testing.T) {
	specs := []ParamSpec{{Name: "x", Required: true, Default: "fallback"}}
	if err := ValidateParams(specs, map[string]interface{}{}); err != nil {
		t.Errorf("required+default should pass: %v", err)
	}
}

func TestApplyParamDefaultsFromContract(t *testing.T) {
	specs := []ParamSpec{
		{Name: "a", Default: 1},
		{Name: "b", Default: "x"},
	}
	params := map[string]interface{}{"b": "explicit"}
	ApplyParamDefaultsFromContract(specs, params)
	if params["a"] != 1 {
		t.Errorf("default a not applied: %v", params)
	}
	if params["b"] != "explicit" {
		t.Errorf("explicit b overwritten: %v", params)
	}
}

func TestResolveLimit_DefaultAndClamp(t *testing.T) {
	sh := IfaceShaping{Pagination: PaginationSpec{Enabled: true, DefaultLimit: 20, MaxLimit: 100}}
	// no request override → use default
	l, _ := ResolveLimit(sh, 0, 0, 1000)
	if l != 20 {
		t.Errorf("default not applied, got %d", l)
	}
	// request override within max
	l, _ = ResolveLimit(sh, 50, 0, 1000)
	if l != 50 {
		t.Errorf("override failed, got %d", l)
	}
	// request override exceeds max → clamp
	l, _ = ResolveLimit(sh, 500, 0, 1000)
	if l != 100 {
		t.Errorf("clamp failed, got %d", l)
	}
	// no shaping → kindDefault
	l, _ = ResolveLimit(IfaceShaping{}, 0, 0, 1000)
	if l != 1000 {
		t.Errorf("kind default failed, got %d", l)
	}
}

func TestBuildShapedSQL_FilterAndSort(t *testing.T) {
	sh := IfaceShaping{
		Filters:    []ShapeFilter{{Field: "status", Operator: "eq", Value: "active"}},
		Sort:       []SortSpec{{Field: "created_at", Desc: true}},
		Pagination: PaginationSpec{Enabled: true},
	}
	params := map[string]interface{}{}
	out := BuildShapedSQL("sqlite", "SELECT * FROM users", sh, params, 10, 5)
	if !strings.Contains(out, "WHERE") {
		t.Errorf("WHERE not added: %s", out)
	}
	if !strings.Contains(out, "ORDER BY") {
		t.Errorf("ORDER BY not added: %s", out)
	}
	if !strings.Contains(out, "LIMIT 10") {
		t.Errorf("LIMIT not added: %s", out)
	}
	if !strings.Contains(out, "OFFSET 5") {
		t.Errorf("OFFSET not added: %s", out)
	}
	if _, ok := params["__shape_filter_0"]; !ok {
		t.Errorf("filter param not set: %v", params)
	}
}

func TestBuildShapedSQL_NoLimitWhenPaginationDisabled(t *testing.T) {
	// Backward-compat: without pagination enabled, SQL must NOT be mutated with LIMIT.
	sh := IfaceShaping{}
	out := BuildShapedSQL("sqlite", "SELECT * FROM users", sh, map[string]interface{}{}, 1000, 0)
	if strings.Contains(strings.ToUpper(out), "LIMIT") {
		t.Errorf("LIMIT must not be injected when pagination disabled: %s", out)
	}
	if strings.TrimSpace(out) != "SELECT * FROM users" {
		t.Errorf("unshaped SQL must be unchanged: %s", out)
	}
}

func TestBuildShapedSQL_RespectExistingOrderBy(t *testing.T) {
	sh := IfaceShaping{Sort: []SortSpec{{Field: "name"}}}
	out := BuildShapedSQL("sqlite", "SELECT * FROM t ORDER BY id", sh, map[string]interface{}{}, 0, 0)
	// Only one ORDER BY (first one preserved, sort not added)
	if strings.Count(strings.ToUpper(out), "ORDER BY") != 1 {
		t.Errorf("expected to keep existing ORDER BY, got %s", out)
	}
}

func TestBuildShapedSQL_DynamicWhereMarker(t *testing.T) {
	sh := IfaceShaping{Filters: []ShapeFilter{{Field: "id", Operator: "eq", Value: 1}}}
	out := BuildShapedSQL("sqlite", "SELECT * FROM t WHERE 1=1 /*__DYNAMIC_WHERE__*/", sh, map[string]interface{}{}, 0, 0)
	if strings.Contains(out, "/*__DYNAMIC_WHERE__*/") {
		t.Errorf("marker not replaced: %s", out)
	}
	if !strings.Contains(out, "{{__shape_filter_0}}") {
		t.Errorf("expected filter clause spliced at marker, got %s", out)
	}
}

func TestBuildShapedSQL_OptionalParamFilter(t *testing.T) {
	sh := IfaceShaping{
		Filters: []ShapeFilter{{Field: "status", Operator: "eq", Param: "status"}},
	}
	// param missing → no clause
	out := BuildShapedSQL("sqlite", "SELECT * FROM t", sh, map[string]interface{}{}, 0, 0)
	if strings.Contains(out, "WHERE") {
		t.Errorf("expected no WHERE when optional param missing: %s", out)
	}
	// param present → clause
	params := map[string]interface{}{"status": "active"}
	out = BuildShapedSQL("sqlite", "SELECT * FROM t", sh, params, 0, 0)
	if !strings.Contains(out, "WHERE") {
		t.Errorf("expected WHERE when optional param present: %s", out)
	}
}

func TestBuildCountSQL(t *testing.T) {
	sh := IfaceShaping{Filters: []ShapeFilter{{Field: "active", Operator: "eq", Value: 1}}}
	out := BuildCountSQL("sqlite", "SELECT * FROM t ORDER BY id LIMIT 10", sh, map[string]interface{}{})
	if !strings.HasPrefix(out, "SELECT COUNT(*)") {
		t.Errorf("missing COUNT prefix: %s", out)
	}
	if !strings.Contains(out, "WHERE") {
		t.Errorf("filter not in count: %s", out)
	}
}

func TestApplyProjection(t *testing.T) {
	rows := []map[string]interface{}{
		{"id": 1, "user_name": "alice", "secret": "x"},
		{"id": 2, "user_name": "bob", "secret": "y"},
	}
	proj := ProjectionSpec{Fields: []FieldMap{
		{From: "id"},
		{From: "user_name", To: "name"},
	}}
	out := ApplyProjection(rows, proj)
	if len(out) != 2 || out[0]["name"] != "alice" {
		t.Errorf("rename failed: %+v", out)
	}
	if _, has := out[0]["secret"]; has {
		t.Errorf("secret should be projected out: %+v", out[0])
	}
}

func TestApplyProjection_Empty(t *testing.T) {
	rows := []map[string]interface{}{{"a": 1}}
	out := ApplyProjection(rows, ProjectionSpec{})
	if len(out) != 1 || out[0]["a"] != 1 {
		t.Errorf("empty projection should pass through: %+v", out)
	}
}

func TestSafetyIdentRejection(t *testing.T) {
	// Field with SQL injection chars must be rejected (no clause emitted)
	sh := IfaceShaping{Filters: []ShapeFilter{{Field: "id; DROP TABLE", Operator: "eq", Value: 1}}}
	params := map[string]interface{}{}
	out := BuildShapedSQL("sqlite", "SELECT * FROM t", sh, params, 0, 0)
	if strings.Contains(out, "DROP") {
		t.Errorf("injection passed through: %s", out)
	}
	if strings.Contains(out, "WHERE") {
		t.Errorf("invalid field should not produce WHERE: %s", out)
	}
}
