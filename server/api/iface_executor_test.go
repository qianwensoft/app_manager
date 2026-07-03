package api

import (
	"testing"
)

func TestParseStepsJSON(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    []string
		wantErr bool
	}{
		{
			name:    "简单字符串数组",
			input:   `["SELECT 1", "SELECT 2"]`,
			want:    []string{"SELECT 1", "SELECT 2"},
			wantErr: false,
		},
		{
			name:    "带label的对象数组",
			input:   `[{"sql":"INSERT INTO orders (name) VALUES (:name)","label":"新增"}]`,
			want:    []string{"INSERT INTO orders (name) VALUES (:name)"},
			wantErr: false,
		},
		{
			name:    "多步骤对象数组",
			input:   `[{"sql":"INSERT INTO orders (name) VALUES (:name)","label":"新增"},{"sql":"UPDATE inventory SET stock = stock - 1","label":"扣减库存"}]`,
			want:    []string{"INSERT INTO orders (name) VALUES (:name)", "UPDATE inventory SET stock = stock - 1"},
			wantErr: false,
		},
		{
			name:    "空数组",
			input:   `[]`,
			want:    nil,
			wantErr: false,
		},
		{
			name:    "空字符串",
			input:   ``,
			want:    nil,
			wantErr: false,
		},
		{
			name:    "对象数组中sql为空",
			input:   `[{"sql":"","label":"空SQL"}]`,
			want:    []string{},
			wantErr: false,
		},
		{
			name:    "无效JSON",
			input:   `[invalid json`,
			want:    nil,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseStepsJSON(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("parseStepsJSON() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr {
				if len(got) != len(tt.want) {
					t.Errorf("parseStepsJSON() got %d steps, want %d steps", len(got), len(tt.want))
					return
				}
				for i := range got {
					if got[i] != tt.want[i] {
						t.Errorf("parseStepsJSON() step[%d] = %v, want %v", i, got[i], tt.want[i])
					}
				}
			}
		})
	}
}
