package main

import (
	"encoding/json"
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: json-validator <json-string>")
		os.Exit(1)
	}

	jsonStr := os.Args[1]

	fmt.Println("Input string:")
	fmt.Printf("%q\n\n", jsonStr)

	fmt.Println("Attempting to parse as JSON...")
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(jsonStr), &m); err != nil {
		fmt.Printf("❌ JSON parsing failed: %v\n", err)
		fmt.Println("\nDumping bytes:")
		for i, b := range []byte(jsonStr) {
			if b == '\n' {
				fmt.Printf("  [%d]: \\n (newline)\n", i)
			} else if b == '\r' {
				fmt.Printf("  [%d]: \\r (carriage return)\n", i)
			} else if b == '\t' {
				fmt.Printf("  [%d]: \\t (tab)\n", i)
			} else if b == '\\' {
				fmt.Printf("  [%d]: \\\\ (backslash)\n", i)
			} else if b < 32 || b > 126 {
				fmt.Printf("  [%d]: 0x%02x (non-printable)\n", i, b)
			} else {
				fmt.Printf("  [%d]: %c\n", i, b)
			}
		}
		os.Exit(1)
	}

	fmt.Println("✅ JSON is valid!")
	fmt.Println("\nParsed result:")
	pretty, _ := json.MarshalIndent(m, "", "  ")
	fmt.Println(string(pretty))
}
