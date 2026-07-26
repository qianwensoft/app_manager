package api

import "testing"

// canvasWithBindings 构造一个仅含指定 ifaceId / tableInterfaceId 引用的最小画布 JSON。
func canvasWithBindings(ifaceID, tableIfaceID uint) string {
	return `{"canvases":{"1":{"elements":[` +
		`{"pointBinding":{"ifaceId":` + itoa(ifaceID) + `}},` +
		`{"tableDataBinding":{"interfaceId":` + itoa(tableIfaceID) + `}}` +
		`]}}}`
}

func itoa(v uint) string {
	if v == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for v > 0 {
		i--
		b[i] = byte('0' + v%10)
		v /= 10
	}
	return string(b[i:])
}

func TestShareCanvasReferencesInterface(t *testing.T) {
	canvas := canvasWithBindings(42, 77)

	cases := []struct {
		name string
		id   uint
		want bool
	}{
		{"point binding iface allowed", 42, true},
		{"table binding iface allowed", 77, true},
		{"unreferenced iface denied", 99, false},
		{"zero id denied", 0, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := shareCanvasReferencesInterface(canvas, tc.id); got != tc.want {
				t.Fatalf("shareCanvasReferencesInterface(id=%d) = %v, want %v", tc.id, got, tc.want)
			}
		})
	}
}

func TestShareCanvasReferencesInterfaceMalformed(t *testing.T) {
	if shareCanvasReferencesInterface("not-json", 1) {
		t.Fatal("malformed canvas JSON must not authorize any interface")
	}
	if shareCanvasReferencesInterface("", 1) {
		t.Fatal("empty canvas must not authorize any interface")
	}
}
