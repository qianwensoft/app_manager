package schemasync

import (
	"reflect"
	"strings"
)

// JSONFieldNames returns wire JSON keys from a struct type (exported fields with json tag != "-").
func JSONFieldNames(sample any) []string {
	t := reflect.TypeOf(sample)
	if t.Kind() == reflect.Ptr {
		t = t.Elem()
	}
	if t.Kind() != reflect.Struct {
		return nil
	}
	out := make([]string, 0, t.NumField())
	for i := 0; i < t.NumField(); i++ {
		f := t.Field(i)
		if f.PkgPath != "" {
			continue
		}
		tag := f.Tag.Get("json")
		if tag == "" || tag == "-" {
			continue
		}
		name := strings.Split(tag, ",")[0]
		if name == "" {
			continue
		}
		out = append(out, name)
	}
	return out
}
