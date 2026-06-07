package webrtc

import (
	"log"

	"github.com/pion/rtp"
)

var (
	clusterRTPPublish        func(deviceID string, camera CameraType, pkt []byte)
	clusterTrackReadyPublish func(deviceID string, camera CameraType, mimeType string)
)

// SetClusterRelayHooks wires cross-node RTP and track-ready notifications (optional).
func SetClusterRelayHooks(
	rtpPublish func(deviceID string, camera CameraType, pkt []byte),
	trackReadyPublish func(deviceID string, camera CameraType, mimeType string),
) {
	clusterRTPPublish = rtpPublish
	clusterTrackReadyPublish = trackReadyPublish
}

func publishTrackReady(deviceID string, camera CameraType, mimeType string) {
	if clusterTrackReadyPublish != nil {
		clusterTrackReadyPublish(deviceID, camera, mimeType)
	}
}

func publishRTPPacket(deviceID string, camera CameraType, pkt *rtp.Packet) {
	if clusterRTPPublish == nil || pkt == nil {
		return
	}
	raw, err := pkt.Marshal()
	if err != nil {
		return
	}
	clusterRTPPublish(deviceID, camera, raw)
}

// HandleRemoteTrackReady marks a publisher track available on a remote node and offers waiting viewers.
func (h *Hub) HandleRemoteTrackReady(deviceID string, camera CameraType, mimeType string) {
	if mimeType == "" {
		return
	}
	dc := h.getOrCreate(deviceID, camera)
	dc.mu.Lock()
	dc.trackMimeType = mimeType
	viewers := make(map[string]*viewerConn, len(dc.viewers))
	for id, v := range dc.viewers {
		viewers[id] = v
	}
	dc.mu.Unlock()

	for vid, v := range viewers {
		if v.track == nil {
			go h.sendViewerOffer(deviceID, camera, vid, v, mimeType)
		}
	}
	log.Printf("WebRTC: remote track ready device=%s camera=%s codec=%s", deviceID, camera, mimeType)
}

// WriteRemoteRTP fans out a relayed RTP packet to local browser viewers.
func (h *Hub) WriteRemoteRTP(deviceID string, camera CameraType, raw []byte) {
	if len(raw) == 0 {
		return
	}
	var pkt rtp.Packet
	if err := pkt.Unmarshal(raw); err != nil {
		return
	}
	dc, ok := h.get(deviceID, camera)
	if !ok {
		return
	}
	dc.mu.RLock()
	defer dc.mu.RUnlock()
	for vid, v := range dc.viewers {
		if v.track != nil {
			if err := v.track.WriteRTP(&pkt); err != nil {
				log.Printf("WebRTC: remote fan-out viewer=%s err: %v", vid, err)
			}
		}
	}
}

// HandleRemoteStopCamera clears relayed track state on nodes without the agent publisher.
func (h *Hub) HandleRemoteStopCamera(deviceID string, camera CameraType) {
	dc, ok := h.get(deviceID, camera)
	if !ok {
		return
	}
	dc.mu.Lock()
	dc.trackMimeType = ""
	dc.mu.Unlock()
	h.BroadcastError(deviceID, camera, "camera stopped")
}
