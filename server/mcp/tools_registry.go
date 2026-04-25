package mcp

import "encoding/json"

func listComponents(_ json.RawMessage) (any, *RPCError) {
	return map[string]any{"components": ComponentRegistry}, nil
}
