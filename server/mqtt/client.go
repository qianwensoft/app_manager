package mqtt

import (
	"app-manager/config"
	"encoding/json"
	"log"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

var client mqtt.Client

func Init() error {
	if !config.C.MQTT.Enabled {
		return nil
	}
	opts := mqtt.NewClientOptions()
	opts.AddBroker(config.C.MQTT.Broker)
	opts.SetClientID(config.C.MQTT.ClientID)
	if config.C.MQTT.Username != "" {
		opts.SetUsername(config.C.MQTT.Username)
		opts.SetPassword(config.C.MQTT.Password)
	}
	opts.SetAutoReconnect(true)
	opts.SetConnectTimeout(10 * time.Second)
	client = mqtt.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		return token.Error()
	}
	log.Println("MQTT client connected")
	return nil
}

func Publish(topic string, payload interface{}) error {
	if !config.C.MQTT.Enabled || client == nil || !client.IsConnected() {
		return nil
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	token := client.Publish(topic, config.C.MQTT.QoS, false, data)
	token.Wait()
	return token.Error()
}

func Close() {
	if client != nil && client.IsConnected() {
		client.Disconnect(250)
	}
}
