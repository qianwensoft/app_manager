package api

// GET /ws/scada/stream/:scada_code
// Raw binary WebSocket — pushes msgpack BatchFrame every ~10ms
// No auth for now (same as STOMP scada share — relies on scada_code obscurity)
// or add token query param check later

import (
	"app-manager/scada"

	"github.com/gin-gonic/gin"
)

// ScadaStreamWS upgrades the connection and streams msgpack BatchFrames for the given scada_code.
func ScadaStreamWS(c *gin.Context) {
	scadaCode := c.Param("scada_code")

	conn, err := rawWsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	scada.StreamHub.Subscribe(scadaCode, conn)
	defer scada.StreamHub.Unsubscribe(scadaCode, conn)

	// read loop — detects client disconnect
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
}
