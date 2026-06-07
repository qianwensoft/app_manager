package webrtc

import "github.com/pion/webrtc/v3"

// PeerConnectionConfig returns ICE settings suitable for LAN + NAT (phone ↔ server).
func PeerConnectionConfig() webrtc.Configuration {
	return webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{URLs: []string{"stun:stun.l.google.com:19302"}},
		},
	}
}
