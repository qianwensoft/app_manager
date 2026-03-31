package stomp

import (
	"bytes"
	"fmt"
	"strings"
)

// DecodeFrame parses one STOMP frame (must end with 0x00).
func DecodeFrame(raw []byte) (command string, headers map[string]string, body []byte, err error) {
	if len(raw) == 0 {
		return "", nil, nil, fmt.Errorf("empty frame")
	}
	if raw[len(raw)-1] != 0 {
		return "", nil, nil, fmt.Errorf("frame must end with null")
	}
	raw = raw[:len(raw)-1]
	raw = bytes.ReplaceAll(raw, []byte("\r\n"), []byte("\n"))
	raw = bytes.ReplaceAll(raw, []byte("\r"), []byte("\n"))
	idx := bytes.IndexByte(raw, '\n')
	if idx < 0 {
		return "", nil, nil, fmt.Errorf("no command line")
	}
	command = string(raw[:idx])
	rest := raw[idx+1:]
	hEnd := bytes.Index(rest, []byte("\n\n"))
	if hEnd < 0 {
		return "", nil, nil, fmt.Errorf("no header/body separator")
	}
	headerLines := rest[:hEnd]
	body = rest[hEnd+2:]
	headers = make(map[string]string)
	for _, line := range bytes.Split(headerLines, []byte("\n")) {
		if len(line) == 0 {
			continue
		}
		colon := bytes.IndexByte(line, ':')
		if colon < 0 {
			continue
		}
		k := strings.TrimSpace(string(line[:colon]))
		v := strings.TrimSpace(string(line[colon+1:]))
		if k != "" {
			headers[k] = v
		}
	}
	return command, headers, body, nil
}

// EncodeFrame builds a STOMP frame with optional body (UTF-8).
func EncodeFrame(command string, headers map[string]string, body string) []byte {
	var b strings.Builder
	b.WriteString(command)
	b.WriteByte('\n')
	for k, v := range headers {
		b.WriteString(k)
		b.WriteByte(':')
		b.WriteString(v)
		b.WriteByte('\n')
	}
	b.WriteByte('\n')
	b.WriteString(body)
	b.WriteByte(0)
	return []byte(b.String())
}

// MessageJSON builds a MESSAGE frame for JSON payload (subscription matches client SUBSCRIBE id).
func MessageJSON(destination, subscriptionID, messageID, jsonBody string) []byte {
	h := map[string]string{
		"destination":    destination,
		"message-id":     messageID,
		"content-type":   "application/json",
		"content-length": fmt.Sprintf("%d", len(jsonBody)),
	}
	if subscriptionID != "" {
		h["subscription"] = subscriptionID
	}
	return EncodeFrame("MESSAGE", h, jsonBody)
}
