package schemasync

import (
	"fmt"
	"os"
	"regexp"
	"strings"
)

var (
	tsInterfaceHead = regexp.MustCompile(`^export\s+(interface|type)\s+([A-Za-z0-9_]+)\s*(=\s*)?\{?\s*$`)
	tsFieldLine     = regexp.MustCompile(`^([a-zA-Z_][a-zA-Z0-9_]*)\??\s*:`)
)

// ParseInterfaceFields reads a TypeScript file and returns property names for export interface/type Name.
func ParseInterfaceFields(filePath, interfaceName string) ([]string, error) {
	b, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}
	lines := strings.Split(string(b), "\n")
	inBlock := false
	var depth int
	var fields []string
	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "//") || strings.HasPrefix(line, "/*") || strings.HasPrefix(line, "*") {
			continue
		}
		if !inBlock {
			m := tsInterfaceHead.FindStringSubmatch(line)
			if len(m) >= 3 && m[2] == interfaceName {
				inBlock = true
				if strings.Contains(line, "{") {
					depth = 1
				} else {
					depth = 0
				}
			}
			continue
		}
		if depth == 0 && strings.HasPrefix(line, "{") {
			depth = 1
			continue
		}
		open := strings.Count(line, "{")
		close := strings.Count(line, "}")
		if depth > 0 {
			if fm := tsFieldLine.FindStringSubmatch(line); len(fm) == 2 {
				fields = append(fields, fm[1])
			}
		}
		depth += open - close
		if depth <= 0 {
			break
		}
	}
	if !inBlock {
		return nil, fmt.Errorf("interface %q not found in %s", interfaceName, filePath)
	}
	return fields, nil
}
