package outbound

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"gorm.io/gorm"
)

func runChannelTrigger(ctx context.Context, db *gorm.DB, sess *triggerSession) {
	switch strings.ToLower(sess.cfg.ChannelType) {
	case "mqtt":
		runMQTTChannelTrigger(ctx, db, sess)
	case "kafka":
		runKafkaChannelTrigger(ctx, db, sess)
	default:
		log.Printf("trigger[channel] session %q unknown channel_type=%q", sess.key, sess.cfg.ChannelType)
	}
}

// ── MQTT ──────────────────────────────────────────────────────────────────────

func runMQTTChannelTrigger(ctx context.Context, db *gorm.DB, sess *triggerSession) {
	cfg := sess.cfg
	broker := cfg.MQTTBroker
	if broker == "" {
		log.Printf("trigger[channel/mqtt] session %q missing mqtt_broker", sess.key)
		return
	}
	clientID := cfg.MQTTClientID
	if clientID == "" {
		clientID = fmt.Sprintf("kiro-trigger-%s", sess.key)
	}

	opts := mqtt.NewClientOptions()
	opts.AddBroker(broker)
	opts.SetClientID(clientID)
	if cfg.MQTTUsername != "" {
		opts.SetUsername(cfg.MQTTUsername)
		opts.SetPassword(cfg.MQTTPassword)
	}
	opts.SetAutoReconnect(true)
	opts.SetConnectTimeout(10 * time.Second)

	msgCh := make(chan []byte, 256)
	opts.SetDefaultPublishHandler(func(_ mqtt.Client, msg mqtt.Message) {
		b := make([]byte, len(msg.Payload()))
		copy(b, msg.Payload())
		select {
		case msgCh <- b:
		default:
		}
	})

	client := mqtt.NewClient(opts)
	token := client.Connect()
	if token.Wait() && token.Error() != nil {
		log.Printf("trigger[channel/mqtt] session %q connect error: %v", sess.key, token.Error())
		return
	}
	defer client.Disconnect(500)

	topic := cfg.ChannelTopic
	if topic == "" {
		topic = "#"
	}
	qos := cfg.MQTTQOS
	subToken := client.Subscribe(topic, qos, nil)
	if subToken.Wait() && subToken.Error() != nil {
		log.Printf("trigger[channel/mqtt] session %q subscribe error: %v", sess.key, subToken.Error())
		return
	}
	log.Printf("trigger[channel/mqtt] session %q subscribed topic=%q broker=%s", sess.key, topic, broker)

	for {
		select {
		case <-ctx.Done():
			return
		case payload := <-msgCh:
			DispatchTriggerMessage(db, sess, payload)
		}
	}
}

// ── Kafka REST proxy ──────────────────────────────────────────────────────────

func runKafkaChannelTrigger(ctx context.Context, db *gorm.DB, sess *triggerSession) {
	cfg := sess.cfg
	if cfg.KafkaRestProxyURL == "" {
		log.Printf("trigger[channel/kafka] session %q missing kafka_rest_proxy_url", sess.key)
		return
	}
	topic := cfg.ChannelTopic
	if topic == "" {
		log.Printf("trigger[channel/kafka] session %q missing channel_topic", sess.key)
		return
	}
	groupID := cfg.KafkaGroupID
	if groupID == "" {
		groupID = fmt.Sprintf("kiro-trigger-%s", sess.key)
	}
	pollMS := cfg.KafkaPollMS
	if pollMS <= 0 {
		pollMS = 500
	}

	url := fmt.Sprintf("%s/consumers/%s/instances/%s-inst/records",
		strings.TrimRight(cfg.KafkaRestProxyURL, "/"), groupID, groupID)
	httpClient := &http.Client{Timeout: 10 * time.Second}
	log.Printf("trigger[channel/kafka] session %q polling topic=%q url=%s", sess.key, topic, url)

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
		if err != nil {
			time.Sleep(3 * time.Second)
			continue
		}
		req.Header.Set("Accept", "application/vnd.kafka.json.v2+json")
		resp, err := httpClient.Do(req)
		if err != nil {
			time.Sleep(3 * time.Second)
			continue
		}

		var records []struct {
			Topic string          `json:"topic"`
			Value json.RawMessage `json:"value"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&records)
		resp.Body.Close()

		for _, r := range records {
			if r.Topic == topic || r.Topic == "" {
				DispatchTriggerMessage(db, sess, r.Value)
			}
		}

		if len(records) == 0 {
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Duration(pollMS) * time.Millisecond):
			}
		}
	}
}
