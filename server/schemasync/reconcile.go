package schemasync

import (
	"fmt"
	"path/filepath"
	"sort"
	"strings"
)

// Result is one registry entry reconcile outcome.
type Result struct {
	Entry       Entry
	MissingInTS []string
	MissingInGo []string
}

// ReconcileAll compares registry entries against schema files under schemaDir.
func ReconcileAll(schemaDir string) ([]Result, error) {
	var out []Result
	for _, e := range Registry {
		tsPath := filepath.Join(schemaDir, e.TSRelPath)
		goFields := JSONFieldNames(e.Model)
		tsFields, err := ParseInterfaceFields(tsPath, e.TSInterface)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", e.Name, err)
		}
		d := CompareFields(goFields, tsFields, e.AllowGoOnly, e.AllowTSOnly)
		if len(d.MissingInTS) > 0 || len(d.MissingInGo) > 0 {
			sort.Strings(d.MissingInTS)
			sort.Strings(d.MissingInGo)
			out = append(out, Result{Entry: e, MissingInTS: d.MissingInTS, MissingInGo: d.MissingInGo})
		}
	}
	return out, nil
}

func FormatResults(results []Result) string {
	if len(results) == 0 {
		return ""
	}
	var b strings.Builder
	for _, r := range results {
		b.WriteString(fmt.Sprintf("- %s (%s)\n", r.Entry.Name, r.Entry.TSInterface))
		if len(r.MissingInTS) > 0 {
			b.WriteString(fmt.Sprintf("    missing in TS: %s\n", strings.Join(r.MissingInTS, ", ")))
		}
		if len(r.MissingInGo) > 0 {
			b.WriteString(fmt.Sprintf("    missing in Go: %s\n", strings.Join(r.MissingInGo, ", ")))
		}
	}
	return b.String()
}
