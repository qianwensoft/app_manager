package outbound

import (
	"context"
	"log"
	"strings"
	"sync"
	"time"

	"app-manager/database"
	"app-manager/models"

	"gorm.io/gorm"
)

// TriggerManager 管理所有出站连接器的触发器生命周期。
// 同一 sessionKey（相同 URL+topic/destination）的多个连接器共享一个物理连接。
var GlobalTriggerManager *TriggerManager

type TriggerManager struct {
	db       *gorm.DB
	mu       sync.RWMutex
	sessions map[string]*triggerSession // sessionKey -> session
}

type triggerSession struct {
	key    string
	typ    string // websocket | stomp | http_poll | http_webhook
	cfg    TriggerConfig
	cancel context.CancelFunc

	mu           sync.RWMutex
	connectorIDs []uint // 所有注册到本 session 的连接器 ID
}

func (s *triggerSession) addConnector(id uint) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, existing := range s.connectorIDs {
		if existing == id {
			return
		}
	}
	s.connectorIDs = append(s.connectorIDs, id)
}

func (s *triggerSession) removeConnector(id uint) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, existing := range s.connectorIDs {
		if existing == id {
			s.connectorIDs = append(s.connectorIDs[:i], s.connectorIDs[i+1:]...)
			break
		}
	}
	return len(s.connectorIDs) == 0
}

func (s *triggerSession) listConnectors() []uint {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]uint, len(s.connectorIDs))
	copy(out, s.connectorIDs)
	return out
}

// InitTriggerManager 在服务启动时初始化并加载所有 enabled 非 device_event 连接器。
func InitTriggerManager(db *gorm.DB) {
	GlobalTriggerManager = &TriggerManager{
		db:       db,
		sessions: make(map[string]*triggerSession),
	}
	GlobalTriggerManager.loadAll()
}

func (m *TriggerManager) loadAll() {
	var connectors []models.OutboundConnector
	if err := m.db.Where("enabled = ?", true).Find(&connectors).Error; err != nil {
		log.Printf("trigger: load connectors failed: %v", err)
		return
	}
	for _, c := range connectors {
		tt := strings.TrimSpace(c.TriggerType)
		if tt == "" || tt == "device_event" {
			continue
		}
		m.startConnector(c)
	}
}

func sessionKey(triggerType string, cfg TriggerConfig) string {
	switch triggerType {
	case "websocket":
		return "ws:" + cfg.URL
	case "stomp":
		return "stomp:" + cfg.URL + ":" + cfg.Destination
	case "http_webhook":
		return "webhook:" + cfg.Token
	case "http_poll":
		return "poll:" + cfg.URL
	case "data_poll":
		return "data_poll:" + cfg.DataInterfaceCode
	case "channel":
		return "channel:" + cfg.ChannelType + ":" + cfg.ChannelTopic
	default:
		return triggerType + ":" + cfg.URL
	}
}

func (m *TriggerManager) startConnector(c models.OutboundConnector) {
	cfg := parseTriggerConfig(c.TriggerConfigJSON)
	tt := strings.TrimSpace(c.TriggerType)
	key := sessionKey(tt, cfg)

	m.mu.Lock()
	defer m.mu.Unlock()

	if sess, ok := m.sessions[key]; ok {
		sess.addConnector(c.ID)
		log.Printf("trigger: connector %d joined existing session %q", c.ID, key)
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	sess := &triggerSession{
		key:          key,
		typ:          tt,
		cfg:          cfg,
		cancel:       cancel,
		connectorIDs: []uint{c.ID},
	}
	m.sessions[key] = sess

	switch tt {
	case "websocket":
		go runWebSocketTrigger(ctx, m.db, sess)
	case "stomp":
		go runSTOMPTrigger(ctx, m.db, sess)
	case "http_poll":
		go runHTTPPollTrigger(ctx, m.db, sess)
	case "data_poll":
		go runDataPollTrigger(ctx, m.db, sess)
	case "channel":
		go runChannelTrigger(ctx, m.db, sess)
	case "http_webhook":
		// webhook 由 HTTP handler 主动推送，无需 goroutine；注册到 webhookRegistry 即可
		webhookRegistry.register(cfg.Token, key)
		log.Printf("trigger: webhook session %q registered (connector %d)", key, c.ID)
	default:
		log.Printf("trigger: unknown trigger_type %q for connector %d", tt, c.ID)
		cancel()
		delete(m.sessions, key)
		return
	}
	log.Printf("trigger: started session %q (connector %d)", key, c.ID)
}

// StartConnectorTrigger 连接器创建/启用时调用。
func (m *TriggerManager) StartConnectorTrigger(connectorID uint) {
	var c models.OutboundConnector
	if err := m.db.First(&c, connectorID).Error; err != nil {
		return
	}
	if !c.Enabled {
		return
	}
	tt := strings.TrimSpace(c.TriggerType)
	if tt == "" || tt == "device_event" {
		return
	}
	m.startConnector(c)
}

// StopConnectorTrigger 连接器禁用/删除时调用。
func (m *TriggerManager) StopConnectorTrigger(connectorID uint) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for key, sess := range m.sessions {
		empty := sess.removeConnector(connectorID)
		if empty {
			sess.cancel()
			if sess.typ == "http_webhook" {
				webhookRegistry.unregister(sess.cfg.Token)
			}
			delete(m.sessions, key)
			log.Printf("trigger: session %q stopped (last connector %d removed)", key, connectorID)
		}
	}
}

// ReloadConnector 连接器配置更新后调用：先 Stop 再 Start。
func (m *TriggerManager) ReloadConnector(connectorID uint) {
	m.StopConnectorTrigger(connectorID)
	time.Sleep(200 * time.Millisecond)
	m.StartConnectorTrigger(connectorID)
}

// SessionStatus 返回 session 的运行状态（给 API 用）。
func (m *TriggerManager) SessionStatus(connectorID uint) map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, sess := range m.sessions {
		for _, cid := range sess.listConnectors() {
			if cid == connectorID {
				return map[string]interface{}{
					"session_key":   sess.key,
					"trigger_type":  sess.typ,
					"connector_ids": sess.listConnectors(),
					"status":        "running",
				}
			}
		}
	}
	return map[string]interface{}{"status": "stopped"}
}

// DispatchTriggerMessage 由各 trigger session 收到消息后调用，fan-out 到所有匹配连接器。
func DispatchTriggerMessage(db *gorm.DB, sess *triggerSession, rawMsg []byte) {
	cfg := sess.cfg
	eventType := "trigger.message"
	if cfg.TypeField != "" {
		if et := extractJSONField(rawMsg, cfg.TypeField); et != "" {
			eventType = et
		}
	}

	connectorIDs := sess.listConnectors()
	for _, cid := range connectorIDs {
		var c models.OutboundConnector
		if err := db.First(&c, cid).Error; err != nil || !c.Enabled {
			continue
		}
		connCfg := parseTriggerConfig(c.TriggerConfigJSON)
		if !matchesTypeFilter(eventType, connCfg.MatchValues) {
			continue
		}
		rec := models.DeviceEvent{
			ID:        0,
			DeviceID:  0,
			EventType: eventType,
			EventData: string(rawMsg),
			CreatedAt: time.Now(),
		}
		go func(connector models.OutboundConnector, r models.DeviceEvent) {
			if err := database.DB.Create(&r).Error; err != nil {
				log.Printf("trigger: save synthetic event failed: %v", err)
			}
			RunConnectorOutbound(connector, r, nil, nil)
		}(c, rec)
	}
}
