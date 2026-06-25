package scada

// UDP ingress: devices send msgpack frames to UDP port (default 9000).
// Single-point frame:  {v:1, code:"x", key:"y", t:1234567890, val:3.14}
// Batch frame:         {v:1, code:"x", points:[{key:"y", t:..., val:...}]}
// On receipt: RecordHistory + aggregatePush (same path as sim engine).

import (
	"log"
	"net"

	"github.com/vmihailenco/msgpack/v5"
)

type udpSingleFrame struct {
	V    int     `msgpack:"v"`
	Code string  `msgpack:"code"`
	Key  string  `msgpack:"key"`
	T    int64   `msgpack:"t"`
	Val  float64 `msgpack:"val"`
}

type udpBatchPoint struct {
	Key string  `msgpack:"key"`
	T   int64   `msgpack:"t"`
	Val float64 `msgpack:"val"`
}

type udpBatchFrame struct {
	V      int             `msgpack:"v"`
	Code   string          `msgpack:"code"`
	Points []udpBatchPoint `msgpack:"points"`
}

// StartUDPIngress starts a goroutine listening for msgpack frames on the given UDP port.
func StartUDPIngress(port int) {
	go func() {
		addr := &net.UDPAddr{Port: port}
		conn, err := net.ListenUDP("udp", addr)
		if err != nil {
			log.Printf("[scada/udp] failed to listen on UDP :%d: %v", port, err)
			return
		}
		defer conn.Close()
		log.Printf("[scada/udp] listening on UDP :%d", port)

		buf := make([]byte, 65535)
		for {
			n, _, err := conn.ReadFromUDP(buf)
			if err != nil {
				log.Printf("[scada/udp] read error: %v", err)
				continue
			}
			handleUDPFrame(buf[:n])
		}
	}()
}

func handleUDPFrame(data []byte) {
	// Try batch first (has "points" field)
	var batch udpBatchFrame
	if err := msgpack.Unmarshal(data, &batch); err == nil && len(batch.Points) > 0 {
		for _, pt := range batch.Points {
			aggregatePush(batch.Code, pt.Key, pt.Val)
		}
		return
	}

	// Fallback to single-point frame
	var single udpSingleFrame
	if err := msgpack.Unmarshal(data, &single); err != nil {
		log.Printf("[scada/udp] failed to decode frame: %v", err)
		return
	}
	if single.Code == "" || single.Key == "" {
		log.Printf("[scada/udp] invalid single frame: missing code or key")
		return
	}
	aggregatePush(single.Code, single.Key, single.Val)
}
