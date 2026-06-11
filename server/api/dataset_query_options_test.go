package api

import (
	"testing"
)

func TestApplyQueryOptions(t *testing.T) {
	tests := []struct {
		name    string
		sql     string
		opts    QueryOptions
		dialect string
		want    string
		wantErr bool
	}{
		{
			name:    "添加分页",
			sql:     "SELECT * FROM users WHERE status = 1",
			opts:    QueryOptions{Page: 2, PageSize: 20},
			dialect: "mysql",
			want:    "SELECT * FROM users WHERE status = 1\nLIMIT 20 OFFSET 20",
		},
		{
			name:    "添加单字段排序",
			sql:     "SELECT * FROM orders WHERE total > 100",
			opts:    QueryOptions{OrderBy: "created_at", OrderDir: "DESC"},
			dialect: "mysql",
			want:    "SELECT * FROM orders WHERE total > 100\nORDER BY created_at DESC",
		},
		{
			name: "添加多字段排序",
			sql:  "SELECT * FROM products",
			opts: QueryOptions{
				MultiOrder: []struct {
					Field string `json:"field"`
					Dir   string `json:"dir"`
				}{
					{Field: "category_id", Dir: "ASC"},
					{Field: "price", Dir: "DESC"},
					{Field: "created_at", Dir: "DESC"},
				},
			},
			dialect: "mysql",
			want:    "SELECT * FROM products\nORDER BY category_id ASC, price DESC, created_at DESC",
		},
		{
			name:    "单条查询",
			sql:     "SELECT * FROM users WHERE email = 'test@example.com'",
			opts:    QueryOptions{FetchOne: true},
			dialect: "mysql",
			want:    "SELECT * FROM users WHERE email = 'test@example.com'\nLIMIT 1",
		},
		{
			name:    "分页 + 排序",
			sql:     "SELECT * FROM logs",
			opts:    QueryOptions{Page: 1, PageSize: 50, OrderBy: "timestamp", OrderDir: "DESC"},
			dialect: "postgres",
			want:    "SELECT * FROM logs\nORDER BY timestamp DESC\nLIMIT 50 OFFSET 0",
		},
		{
			name:    "直接 LIMIT + OFFSET",
			sql:     "SELECT * FROM events",
			opts:    QueryOptions{Limit: 100, Offset: 200},
			dialect: "mysql",
			want:    "SELECT * FROM events\nLIMIT 100 OFFSET 200",
		},
		{
			name:    "已有 ORDER BY 不重复添加",
			sql:     "SELECT * FROM users ORDER BY name ASC",
			opts:    QueryOptions{Page: 1, PageSize: 10},
			dialect: "mysql",
			want:    "SELECT * FROM users ORDER BY name ASC\nLIMIT 10 OFFSET 0",
		},
		{
			name:    "已有 LIMIT 不重复添加",
			sql:     "SELECT * FROM users LIMIT 5",
			opts:    QueryOptions{OrderBy: "id", OrderDir: "DESC"},
			dialect: "mysql",
			want:    "SELECT * FROM users LIMIT 5\nORDER BY id DESC",
		},
		{
			name:    "无选项不修改",
			sql:     "SELECT * FROM users",
			opts:    QueryOptions{},
			dialect: "mysql",
			want:    "SELECT * FROM users",
		},
		{
			name:    "表名.列名格式",
			sql:     "SELECT * FROM orders o JOIN users u ON o.user_id = u.id",
			opts:    QueryOptions{OrderBy: "o.created_at", OrderDir: "DESC"},
			dialect: "mysql",
			want:    "SELECT * FROM orders o JOIN users u ON o.user_id = u.id\nORDER BY o.created_at DESC",
		},
		{
			name:    "无效列名应报错",
			sql:     "SELECT * FROM users",
			opts:    QueryOptions{OrderBy: "id; DROP TABLE users--", OrderDir: "ASC"},
			dialect: "mysql",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ApplyQueryOptions(tt.sql, tt.opts, tt.dialect)
			if tt.wantErr {
				if err == nil {
					t.Errorf("ApplyQueryOptions() error = nil, wantErr %v", tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Errorf("ApplyQueryOptions() unexpected error = %v", err)
				return
			}
			if got != tt.want {
				t.Errorf("ApplyQueryOptions() got:\n%s\n\nwant:\n%s", got, tt.want)
			}
		})
	}
}

func TestIsValidColumnName(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  bool
	}{
		{"简单列名", "id", true},
		{"下划线列名", "user_id", true},
		{"数字结尾", "column1", true},
		{"表名.列名", "users.id", true},
		{"表名.带下划线列名", "orders.created_at", true},
		{"大写字母", "UserID", true},
		{"数字开头", "1column", false},
		{"SQL 注入尝试", "id; DROP TABLE", false},
		{"空格", "id name", false},
		{"特殊字符", "id-name", false},
		{"星号", "*", false},
		{"括号", "COUNT(*)", false},
		{"多个点号", "db.table.column", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isValidColumnName(tt.input)
			if got != tt.want {
				t.Errorf("isValidColumnName(%q) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}

func TestParseQueryOptions(t *testing.T) {
	tests := []struct {
		name    string
		json    string
		want    QueryOptions
		wantErr bool
	}{
		{
			name: "分页参数",
			json: `{"page": 2, "page_size": 30}`,
			want: QueryOptions{Page: 2, PageSize: 30},
		},
		{
			name: "排序参数",
			json: `{"order_by": "created_at", "order_dir": "DESC"}`,
			want: QueryOptions{OrderBy: "created_at", OrderDir: "DESC"},
		},
		{
			name: "单条查询",
			json: `{"fetch_one": true}`,
			want: QueryOptions{FetchOne: true},
		},
		{
			name: "多字段排序",
			json: `{"multi_order": [{"field": "status", "dir": "ASC"}, {"field": "id", "dir": "DESC"}]}`,
			want: QueryOptions{
				MultiOrder: []struct {
					Field string `json:"field"`
					Dir   string `json:"dir"`
				}{
					{Field: "status", Dir: "ASC"},
					{Field: "id", Dir: "DESC"},
				},
			},
		},
		{
			name: "空 JSON",
			json: `null`,
			want: QueryOptions{},
		},
		{
			name: "默认分页大小",
			json: `{"page": 1}`,
			want: QueryOptions{Page: 1, PageSize: 20},
		},
		{
			name: "超大分页限制",
			json: `{"page": 1, "page_size": 10000}`,
			want: QueryOptions{Page: 1, PageSize: 5000},
		},
		{
			name: "超大 LIMIT 限制",
			json: `{"limit": 10000}`,
			want: QueryOptions{Limit: 5000},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseQueryOptions([]byte(tt.json))
			if tt.wantErr {
				if err == nil {
					t.Errorf("ParseQueryOptions() error = nil, wantErr %v", tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Errorf("ParseQueryOptions() unexpected error = %v", err)
				return
			}

			if got.Page != tt.want.Page {
				t.Errorf("Page = %v, want %v", got.Page, tt.want.Page)
			}
			if got.PageSize != tt.want.PageSize {
				t.Errorf("PageSize = %v, want %v", got.PageSize, tt.want.PageSize)
			}
			if got.OrderBy != tt.want.OrderBy {
				t.Errorf("OrderBy = %v, want %v", got.OrderBy, tt.want.OrderBy)
			}
			if got.FetchOne != tt.want.FetchOne {
				t.Errorf("FetchOne = %v, want %v", got.FetchOne, tt.want.FetchOne)
			}
		})
	}
}
