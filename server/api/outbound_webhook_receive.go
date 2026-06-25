package api

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/md5"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"app-manager/database"
	"app-manager/models"
	"app-manager/outbound"
	"app-manager/stomp"

	"github.com/dop251/goja"
	"github.com/gin-gonic/gin"
)

// ReceiveOutboundWebhook handles ANY /api/open/v1/outbound/webhooks/receive/:app_code/:token
func ReceiveOutboundWebhook(c *gin.Context) {
	var wh models.OutboundWebhook
	if err := database.DB.
		Joins("JOIN outbound_apps ON outbound_apps.id = outbound_webhooks.app_id").
		Where("outbound_apps.app_code = ? AND outbound_webhooks.receive_token = ?", c.Param("app_code"), c.Param("token")).
		First(&wh).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "webhook not found"})
		return
	}
	if !wh.Enabled {
		c.JSON(http.StatusForbidden, gin.H{"error": "webhook disabled"})
		return
	}
	expectedMethod := wh.Method
	if expectedMethod == "" {
		expectedMethod = "POST"
	}
	if c.Request.Method != expectedMethod {
		c.JSON(http.StatusMethodNotAllowed, gin.H{"error": "method not allowed"})
		return
	}

	rawBody, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot read body"})
		return
	}

	var cfg map[string]interface{}
	_ = json.Unmarshal([]byte(wh.ConfigJSON), &cfg)
	if cfg == nil {
		cfg = map[string]interface{}{}
	}

	// Expand {{app.xxx}} placeholders in config values.
	var app models.OutboundApp
	if err := database.DB.First(&app, wh.AppID).Error; err == nil {
		vars := map[string]string{}
		outbound.MergeAppParamsIntoVars(vars, &app)
		if len(vars) > 0 {
			expanded := make(map[string]interface{}, len(cfg))
			for k, v := range cfg {
				if s, ok := v.(string); ok {
					for ph, val := range vars {
						s = strings.ReplaceAll(s, ph, val)
					}
					expanded[k] = s
				} else {
					expanded[k] = v
				}
			}
			cfg = expanded
		}
	}

	// --- Authentication ---
	if authErr := webhookAuthenticate(c, wh.AuthMethod, cfg, rawBody); authErr != "" {
		pushWebhookDebug(wh.ID, c.Request, rawBody, nil, nil, nil, authErr)
		c.JSON(http.StatusUnauthorized, gin.H{"error": authErr})
		return
	}

	// --- Decryption ---
	var decryptedRaw []byte
	payload := rawBody

	if wh.DecryptMethod != "" && wh.DecryptMethod != "none" {
		keyPath := strings.TrimSpace(wh.DecryptKeyPath)
		log.Printf("[webhook recv] id=%d decrypt_method=%s key_path=%q cfg_keys=%v",
			wh.ID, wh.DecryptMethod, keyPath, cfgKeys(cfg))
		if keyPath != "" {
			merged, decField, decErr := webhookDecryptField(wh.DecryptMethod, cfg, rawBody, keyPath)
			if decErr != "" {
				pushWebhookDebug(wh.ID, c.Request, rawBody, nil, nil, nil, decErr)
				c.JSON(http.StatusBadRequest, gin.H{"error": decErr})
				return
			}
			decryptedRaw = decField
			payload = merged
		} else {
			decrypted, decErr := webhookDecrypt(wh.DecryptMethod, cfg, rawBody)
			if decErr != "" {
				pushWebhookDebug(wh.ID, c.Request, rawBody, nil, nil, nil, decErr)
				c.JSON(http.StatusBadRequest, gin.H{"error": decErr})
				return
			}
			decryptedRaw = decrypted
			payload = decrypted
		}
	}

	// --- JS Transform ---
	var jsConsoleLogs []string
	if js := strings.TrimSpace(wh.ResponseTransformJS); js != "" {
		transformed, consoleLogs, jsErr := webhookRunTransformJS(js, payload)
		jsConsoleLogs = consoleLogs
		if jsErr != "" {
			pushWebhookDebug(wh.ID, c.Request, rawBody, decryptedRaw, nil, jsConsoleLogs, jsErr)
			c.JSON(http.StatusBadRequest, gin.H{"error": jsErr})
			return
		}
		payload = transformed
	}

	pushWebhookDebug(wh.ID, c.Request, rawBody, decryptedRaw, payload, jsConsoleLogs, "")
	// 成功接收后，异步触发关联连接器（trigger_type=http_webhook AND webhook_id=wh.ID）
	go dispatchWebhookConnectors(wh.ID, payload)
	if strings.TrimSpace(wh.ResponseTransformJS) != "" {
		// JS 存在时：若返回对象含 return_data 键，提取该字段作为响应体
		var result interface{}
		d := json.NewDecoder(bytes.NewReader(payload))
		d.UseNumber()
		if err := d.Decode(&result); err == nil {
			if m, ok := result.(map[string]interface{}); ok {
				if rd, has := m["return_data"]; has {
					if b, err := json.Marshal(rd); err == nil {
						payload = b
					}
				}
			}
		}
		log.Printf("[webhook id=%d] response body: %s", wh.ID, payload)
		c.Data(http.StatusOK, "application/json; charset=utf-8", payload)
	} else {
		log.Printf("[webhook id=%d] response body: %s", wh.ID, payload)
		c.JSON(http.StatusOK, gin.H{"ok": true, "return_data": maybeJSON(payload)})
	}
}

// webhookDecryptField extracts the string at dotPath from JSON body, decrypts it,
// and returns (mergedBody, decryptedBytes, errMsg).
func webhookDecryptField(method string, cfg map[string]interface{}, body []byte, dotPath string) ([]byte, []byte, string) {
	var root interface{}
	d := json.NewDecoder(bytes.NewReader(body))
	d.UseNumber()
	if err := d.Decode(&root); err != nil {
		return nil, nil, "body is not valid JSON for key-path decrypt"
	}

	parts := strings.Split(dotPath, ".")
	encStr, getErr := getNestedString(root, parts)
	if getErr != "" {
		return nil, nil, "decrypt_key_path: " + getErr
	}

	// Try hex decode, then base64 variants, then raw bytes
	cipherBytes, err := hex.DecodeString(encStr)
	if err != nil {
		decoded := false
		for _, enc := range []*base64.Encoding{
			base64.StdEncoding,
			base64.RawStdEncoding,
			base64.URLEncoding,
			base64.RawURLEncoding,
		} {
			if b, e := enc.DecodeString(encStr); e == nil {
				cipherBytes = b
				decoded = true
				break
			}
		}
		if !decoded {
			cipherBytes = []byte(encStr)
		}
	}
	log.Printf("[webhook decrypt field] path=%s enc_str_len=%d cipher_bytes_len=%d", dotPath, len(encStr), len(cipherBytes))

	decrypted, decErr := webhookDecrypt(method, cfg, cipherBytes)
	if decErr != "" {
		return nil, nil, decErr
	}

	// Parse decrypted as JSON if possible, else keep as string
	var decVal interface{}
	dd := json.NewDecoder(bytes.NewReader(decrypted))
	dd.UseNumber()
	if err := dd.Decode(&decVal); err != nil {
		decVal = string(decrypted)
	}

	setNested(root, parts, decVal)
	merged, err := json.Marshal(root)
	if err != nil {
		return nil, nil, "failed to re-marshal merged body: " + err.Error()
	}
	return merged, decrypted, ""
}

func getNestedString(v interface{}, parts []string) (string, string) {
	if len(parts) == 0 {
		s, ok := v.(string)
		if !ok {
			return "", "field is not a string"
		}
		return s, ""
	}
	m, ok := v.(map[string]interface{})
	if !ok {
		return "", fmt.Sprintf("field %q is not an object", parts[0])
	}
	child, exists := m[parts[0]]
	if !exists {
		return "", fmt.Sprintf("field %q not found", parts[0])
	}
	return getNestedString(child, parts[1:])
}

func setNested(v interface{}, parts []string, val interface{}) {
	if len(parts) == 0 {
		return
	}
	m, ok := v.(map[string]interface{})
	if !ok {
		return
	}
	if len(parts) == 1 {
		m[parts[0]] = val
		return
	}
	setNested(m[parts[0]], parts[1:], val)
}

// sanitizeJS replaces Unicode characters that break goja's ES5 parser.
// It only removes genuine control characters and replaces known lookalikes;
// normal Unicode (CJK, emoji, etc.) is left intact so comments and string
// literals in non-ASCII languages continue to work.
func sanitizeJS(code string) string {
	replacer := strings.NewReplacer(
		"\u2018", "'", // left single quotation mark
		"\u2019", "'", // right single quotation mark
		"\u201C", "\"", // left double quotation mark
		"\u201D", "\"", // right double quotation mark
		"\u2013", "-", // en dash
		"\u2014", "-", // em dash
		"\u00A0", " ", // non-breaking space
		"\u3000", " ", // ideographic space
		"\uFEFF", "", // BOM
		"\u200B", "", // zero-width space
		"\u200C", "", // zero-width non-joiner
		"\u200D", "", // zero-width joiner
		"\u2028", "\n", // line separator — illegal in ES5 string literals
		"\u2029", "\n", // paragraph separator — illegal in ES5 string literals
	)
	code = replacer.Replace(code)

	// Strip C0 control characters (except \t \n \r) and C1 control characters.
	// These are the only code points that are truly illegal in ES5 source text.
	// Do NOT strip non-ASCII Unicode such as CJK — those are valid identifiers/strings.
	var b strings.Builder
	b.Grow(len(code))
	for _, r := range code {
		if r == '\t' || r == '\n' || r == '\r' {
			b.WriteRune(r)
			continue
		}
		if (r >= 0x00 && r <= 0x1F) || (r >= 0x7F && r <= 0x9F) {
			// C0 / DEL / C1 control characters — drop
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

// webhookRunTransformJS runs user JS: function main(payload){ return transformed; }
// Returns (result, consoleLogs, errMsg)
func webhookRunTransformJS(code string, payload []byte) ([]byte, []string, string) {
	original := code
	code = sanitizeJS(code)
	// Debug: log any genuinely illegal control-character rune that survived sanitize
	for i, r := range code {
		if (r >= 0x00 && r <= 0x1F && r != '\t' && r != '\n' && r != '\r') || (r >= 0x7F && r <= 0x9F) {
			log.Printf("[sanitizeJS] residual control rune U+%04X at byte %d", r, i)
		}
	}
	if original != code {
		log.Printf("[sanitizeJS] code changed, len %d -> %d", len(original), len(code))
	}
	// Log line 11 content for diagnosis
	lines := strings.Split(code, "\n")
	if len(lines) >= 11 {
		line11 := lines[10]
		log.Printf("[sanitizeJS] line 11: %q", line11)
		for j, r := range line11 {
			if r > 0x7E || r < 0x20 {
				log.Printf("[sanitizeJS] line11 col %d rune U+%04X", j, r)
			}
		}
	}
	vm := goja.New()
	time.AfterFunc(2*time.Second, func() { vm.Interrupt("timeout") })

	var consoleLogs []string
	console := vm.NewObject()
	_ = console.Set("log", func(c goja.FunctionCall) goja.Value {
		parts := make([]string, 0, len(c.Arguments))
		for _, a := range c.Arguments {
			parts = append(parts, a.String())
		}
		line := strings.Join(parts, " ")
		consoleLogs = append(consoleLogs, line)
		log.Printf("webhook transform_js: %s", line)
		return goja.Undefined()
	})
	_ = vm.Set("console", console)

	var payloadVal interface{}
	dd := json.NewDecoder(bytes.NewReader(payload))
	dd.UseNumber()
	if err := dd.Decode(&payloadVal); err != nil {
		payloadVal = string(payload)
	}
	_ = vm.Set("__payload__", vm.ToValue(payloadVal))

	wrapped := "(function(){\n" + code + "\n" +
		"if(typeof main!=='function'){throw new Error('transform_js: 需定义 function main(payload)');}\n" +
		"return main(__payload__);\n})()"

	result, err := vm.RunString(wrapped)
	if err != nil {
		return nil, consoleLogs, "transform_js error: " + err.Error()
	}

	out, err := json.Marshal(result.Export())
	if err != nil {
		return nil, consoleLogs, "transform_js: cannot marshal result: " + err.Error()
	}
	return out, consoleLogs, ""
}

// webhookAuthenticate returns "" on success, error string on failure.
func webhookAuthenticate(c *gin.Context, method string, cfg map[string]interface{}, body []byte) string {
	switch method {
	case "", "none":
		return ""
	case "hmac_sha256":
		secret, _ := cfg["secret"].(string)
		if secret == "" {
			return "hmac secret not configured"
		}
		sig := strings.TrimPrefix(c.GetHeader("X-Hub-Signature-256"), "sha256=")
		if sig == "" {
			sig = c.GetHeader("X-Signature")
		}
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write(body)
		expected := hex.EncodeToString(mac.Sum(nil))
		if !hmac.Equal([]byte(sig), []byte(expected)) {
			return "hmac signature mismatch"
		}
	case "token_header":
		token, _ := cfg["token"].(string)
		headerName, _ := cfg["header"].(string)
		if headerName == "" {
			headerName = "X-Webhook-Token"
		}
		if token == "" {
			return "token not configured"
		}
		if c.GetHeader(headerName) != token {
			return "invalid token header"
		}
	case "token_query":
		token, _ := cfg["token"].(string)
		paramName, _ := cfg["param"].(string)
		if paramName == "" {
			paramName = "token"
		}
		if token == "" {
			return "token not configured"
		}
		if c.Query(paramName) != token {
			return "invalid token query param"
		}
	}
	return ""
}

// webhookDecrypt returns decrypted bytes or error string.
func webhookDecrypt(method string, cfg map[string]interface{}, data []byte) ([]byte, string) {
	keyStr, _ := cfg["key"].(string)
	if keyStr == "" {
		return nil, "decrypt key not configured"
	}
	// Decode key: try hex first, fall back to raw bytes
	keyBytes, err := hex.DecodeString(keyStr)
	if err != nil {
		keyBytes = []byte(keyStr)
	}
	// key_hash preprocessing: raw(default) / md5 / sha256 / zero_pad
	keyHash, _ := cfg["key_hash"].(string)
	log.Printf("[webhook decrypt] method=%s key_hash=%q key_str_len=%d key_bytes_len=%d data_len=%d",
		method, keyHash, len(keyStr), len(keyBytes), len(data))
	keyBytes, err = preprocessKey(keyBytes, keyHash)
	if err != nil {
		return nil, "key preprocessing failed: " + err.Error()
	}
	log.Printf("[webhook decrypt] after preprocess key_bytes_len=%d key_prefix=%x", len(keyBytes), keyBytes[:min(4, len(keyBytes))])
	block, err := aes.NewCipher(keyBytes)
	if err != nil {
		return nil, "invalid aes key: " + err.Error()
	}
	switch method {
	case "aes_cbc_pkcs7":
		if len(data) < aes.BlockSize || len(data)%aes.BlockSize != 0 {
			return nil, "invalid cbc ciphertext length"
		}
		iv := data[:aes.BlockSize]
		ct := data[aes.BlockSize:]
		mode := cipher.NewCBCDecrypter(block, iv)
		dst := make([]byte, len(ct))
		mode.CryptBlocks(dst, ct)
		return pkcs7Unpad(dst)
	case "aes_ecb_pkcs7":
		if len(data)%aes.BlockSize != 0 {
			return nil, "invalid ecb ciphertext length"
		}
		dst := make([]byte, len(data))
		for i := 0; i < len(data); i += aes.BlockSize {
			block.Decrypt(dst[i:], data[i:])
		}
		return pkcs7Unpad(dst)
	}
	return data, ""
}

// preprocessKey applies key_hash strategy to produce a valid AES key length.
// Supported: raw (default), md5 (→16B), sha256 (→32B), zero_pad (pad to nearest 16/24/32).
func preprocessKey(key []byte, mode string) ([]byte, error) {
	switch mode {
	case "", "raw":
		return key, nil
	case "md5":
		h := md5.Sum(key)
		return h[:], nil
	case "sha256":
		h := sha256.Sum256(key)
		return h[:], nil
	case "zero_pad":
		n := len(key)
		var target int
		switch {
		case n <= 16:
			target = 16
		case n <= 24:
			target = 24
		default:
			target = 32
		}
		if n == target {
			return key, nil
		}
		padded := make([]byte, target)
		copy(padded, key)
		return padded, nil
	default:
		return nil, fmt.Errorf("unknown key_hash mode: %s", mode)
	}
}

// cfgKeys returns config map keys for logging (values omitted for security).
func cfgKeys(cfg map[string]interface{}) []string {
	keys := make([]string, 0, len(cfg))
	for k := range cfg {
		keys = append(keys, k)
	}
	return keys
}

func pkcs7Unpad(b []byte) ([]byte, string) {
	if len(b) == 0 {
		return nil, "empty plaintext"
	}
	pad := int(b[len(b)-1])
	if pad == 0 || pad > aes.BlockSize || pad > len(b) {
		return nil, "invalid pkcs7 padding"
	}
	return b[:len(b)-pad], ""
}

// pushWebhookDebug publishes a debug frame to STOMP.
func pushWebhookDebug(webhookID uint, req *http.Request, rawBody, decryptedRaw, payload []byte, jsLogs []string, errMsg string) {
	headers := make(map[string]string)
	for k, vs := range req.Header {
		headers[k] = strings.Join(vs, ", ")
	}
	frame := map[string]interface{}{
		"webhook_id":    webhookID,
		"ts":            time.Now().UnixMilli(),
		"method":        req.Method,
		"path":          req.URL.Path,
		"query":         req.URL.RawQuery,
		"headers":       headers,
		"raw_body":      string(rawBody),
		"decrypted_raw": maybeJSON(decryptedRaw),
		"payload":       maybeJSON(payload),
		"return_data":   maybeJSON(payload),
		"js_logs":       jsLogs,
		"error":         errMsg,
	}
	b, _ := json.Marshal(frame)
	topic := fmt.Sprintf("/topic/outbound/webhooks/%d/debug", webhookID)
	stomp.DefaultHub.PublishJSON(topic, string(b))

	// Async: extract event type from payload and merge into observed_event_types
	if payload != nil && errMsg == "" {
		go mergeObservedEventType(webhookID, payload)
	}

	// Async: persist log record
	go func() {
		headersB, _ := json.Marshal(frame["headers"])
		jsLogsB, _ := json.Marshal(jsLogs)
		record := models.OutboundWebhookLog{
			WebhookID: webhookID,
			Ts:        frame["ts"].(int64),
			Method:    req.Method,
			Path:      req.URL.Path,
			Query:     req.URL.RawQuery,
			Headers:   string(headersB),
			RawBody:   string(rawBody),
			Error:     errMsg,
			JsLogs:    string(jsLogsB),
		}
		if decryptedRaw != nil {
			record.DecryptedRaw = string(decryptedRaw)
		}
		if payload != nil {
			record.Payload = string(payload)
			record.ReturnData = string(payload)
			// 从 JS 返回值中提取 event_type
			var m map[string]interface{}
			if json.Unmarshal(payload, &m) == nil {
				record.EventType = extractEventType(m)
			}
		}
		database.DB.Create(&record)

		// 成功接收时更新 last_received_at 并推 STOMP 通知列表刷新
		if errMsg == "" {
			now := time.Now()
			database.DB.Model(&models.OutboundWebhook{}).Where("id = ?", webhookID).
				Update("last_received_at", now)
			b, _ := json.Marshal(map[string]interface{}{
				"webhook_id":       webhookID,
				"last_received_at": now.UnixMilli(),
			})
			stomp.DefaultHub.PublishJSON("/topic/outbound/webhooks/list", string(b))
		}
	}()
}

// eventTypeKeys are common field names used by open platforms to indicate message/event type.
var eventTypeKeys = []string{"event_type", "EventType", "msgtype", "MsgType", "msg_type", "type", "Type"}

func mergeObservedEventType(webhookID uint, payload []byte) {
	var m map[string]interface{}
	if err := json.Unmarshal(payload, &m); err != nil {
		return
	}
	// Try top-level keys, then one level deep (e.g. event.event_type)
	et := extractEventType(m)
	if et == "" {
		for _, v := range m {
			if sub, ok := v.(map[string]interface{}); ok {
				et = extractEventType(sub)
				if et != "" {
					break
				}
			}
		}
	}
	if et == "" {
		return
	}

	var wh models.OutboundWebhook
	if err := database.DB.Select("id, observed_event_types").First(&wh, webhookID).Error; err != nil {
		return
	}

	// Update observed_event_types JSON field on the webhook (legacy / fast path).
	var existing []string
	if wh.ObservedEventTypes != "" {
		_ = json.Unmarshal([]byte(wh.ObservedEventTypes), &existing)
	}
	alreadyInList := false
	for _, e := range existing {
		if e == et {
			alreadyInList = true
			break
		}
	}
	if !alreadyInList {
		existing = append(existing, et)
		b, _ := json.Marshal(existing)
		database.DB.Model(&models.OutboundWebhook{}).Where("id = ?", webhookID).
			Update("observed_event_types", string(b))
	}

	// Auto-register in outbound_webhook_event_types table (upsert: skip if already exists).
	var cnt int64
	database.DB.Model(&models.OutboundWebhookEventType{}).
		Where("webhook_id = ? AND event_type = ?", webhookID, et).Count(&cnt)
	if cnt == 0 {
		row := models.OutboundWebhookEventType{
			WebhookID: webhookID,
			EventType: et,
		}
		database.DB.Create(&row)
	}
}

func extractEventType(m map[string]interface{}) string {
	for _, k := range eventTypeKeys {
		if v, ok := m[k]; ok {
			if s, ok := v.(string); ok && s != "" {
				return s
			}
		}
	}
	return ""
}

func maybeJSON(b []byte) interface{} {
	if b == nil {
		return nil
	}
	var v interface{}
	d := json.NewDecoder(bytes.NewReader(b))
	d.UseNumber()
	if err := d.Decode(&v); err == nil {
		return v
	}
	return string(b)
}

// dispatchWebhookConnectors 查询所有与该 webhook 绑定的已启用连接器并异步执行。
// 不推 STOMP 调试帧，不阻塞 HTTP 响应（由调用方以 go 启动）。
func dispatchWebhookConnectors(webhookID uint, payload []byte) {
	var connectors []models.OutboundConnector
	if err := database.DB.
		Where("enabled = ? AND trigger_type = ? AND webhook_id = ?", true, "http_webhook", webhookID).
		Order("priority ASC, id ASC").
		Find(&connectors).Error; err != nil || len(connectors) == 0 {
		return
	}

	eventData := string(payload)
	for _, c := range connectors {
		connector := c
		rec := models.DeviceEvent{
			ID:        0,
			DeviceID:  0,
			EventType: "webhook.received",
			EventData: eventData,
			CreatedAt: time.Now(),
		}
		if err := database.DB.Create(&rec).Error; err != nil {
			log.Printf("[webhook dispatch] save synthetic event failed: %v", err)
			continue
		}
		go outbound.RunConnectorOutbound(connector, rec, nil, nil)
	}
}
