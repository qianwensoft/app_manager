// Package webrtc implements a server-side WebRTC SFU for camera streaming.
//
// Signal flow:
//
//	Agent  →(offer)→  Server  →(offer)→  Browser
//	Agent  ←(answer)← Server  ←(answer)← Browser
//
// Server acts as both answerer (to Agent) and offerer (to Browser).
// When Agent's track arrives, Server creates offers for all waiting browsers.
package webrtc

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/pion/webrtc/v3"
)

type CameraType string

const (
	CameraBack  CameraType = "back"
	CameraFront CameraType = "front"
)

// viewerConn holds a browser subscriber's state.
type viewerConn struct {
	pc     *webrtc.PeerConnection
	track  *webrtc.TrackLocalStaticRTP // local track fed by publisher RTP
	sendFn func(interface{})
}

// DeviceCamera holds all sessions for one (device, camera) pair.
type DeviceCamera struct {
	mu            sync.RWMutex
	publisherPC   *webrtc.PeerConnection
	trackMimeType string                 // set when OnTrack fires; empty means track not yet arrived
	viewers       map[string]*viewerConn // viewerID → conn
}

// Hub manages WebRTC sessions across all devices and cameras.
type Hub struct {
	mu      sync.RWMutex
	cameras map[string]*DeviceCamera
}

var CameraHub = &Hub{cameras: make(map[string]*DeviceCamera)}

func key(deviceID string, camera CameraType) string { return deviceID + ":" + string(camera) }

func (h *Hub) getOrCreate(deviceID string, camera CameraType) *DeviceCamera {
	k := key(deviceID, camera)
	h.mu.Lock()
	defer h.mu.Unlock()
	if dc, ok := h.cameras[k]; ok {
		return dc
	}
	dc := &DeviceCamera{viewers: make(map[string]*viewerConn)}
	h.cameras[k] = dc
	return dc
}

func (h *Hub) get(deviceID string, camera CameraType) (*DeviceCamera, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	dc, ok := h.cameras[key(deviceID, camera)]
	return dc, ok
}

// ─── Publisher (Agent) side ──────────────────────────────────────────────────

// HandleAgentOffer processes SDP offer from Agent.
// After answer is sent, when track arrives it is fanned out to all viewers.
func (h *Hub) HandleAgentOffer(deviceID string, camera CameraType, offerSDP string, sendFn func(interface{})) error {
	dc := h.getOrCreate(deviceID, camera)
	dc.mu.Lock()
	defer dc.mu.Unlock()

	if dc.publisherPC != nil {
		_ = dc.publisherPC.Close()
		dc.publisherPC = nil
	}
	dc.trackMimeType = ""

	pc, err := webrtc.NewPeerConnection(PeerConnectionConfig())
	if err != nil {
		return err
	}

	// Must add recvonly transceiver BEFORE SetRemoteDescription so pion
	// correctly negotiates the incoming video track and fires OnTrack.
	if _, err := pc.AddTransceiverFromKind(webrtc.RTPCodecTypeVideo, webrtc.RTPTransceiverInit{
		Direction: webrtc.RTPTransceiverDirectionRecvonly,
	}); err != nil {
		_ = pc.Close()
		return err
	}

	pc.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c == nil {
			return
		}
		ci := c.ToJSON()
		sendFn(map[string]interface{}{
			"type": "webrtc_ice_candidate", "camera": string(camera), "role": "publisher",
			"candidate": map[string]interface{}{
				"candidate": ci.Candidate, "sdpMid": ci.SDPMid, "sdpMLineIndex": ci.SDPMLineIndex,
			},
		})
	})

	pc.OnConnectionStateChange(func(s webrtc.PeerConnectionState) {
		log.Printf("WebRTC publisher[%s/%s] %s", deviceID, camera, s)
		if s == webrtc.PeerConnectionStateFailed || s == webrtc.PeerConnectionStateClosed {
			h.RemovePublisher(deviceID, camera)
		}
	})

	// When Agent's track arrives, fan-out RTP to all viewer tracks
	pc.OnTrack(func(remote *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		mimeType := remote.Codec().MimeType
		log.Printf("WebRTC: agent track device=%s camera=%s codec=%s", deviceID, camera, mimeType)

		// Store mime type so late-joining viewers can get an offer
		dc.mu.Lock()
		dc.trackMimeType = mimeType
		dc.mu.Unlock()
		publishTrackReady(deviceID, camera, mimeType)

		// Notify all waiting viewers that track is ready — send them offers
		dc.mu.RLock()
		for vid, v := range dc.viewers {
			if v.track == nil {
				go h.sendViewerOffer(deviceID, camera, vid, v, mimeType)
			}
		}
		dc.mu.RUnlock()

		// Fan-out RTP loop
		go func() {
			for {
				pkt, _, err := remote.ReadRTP()
				if err != nil {
					log.Printf("WebRTC: agent track EOF device=%s camera=%s: %v", deviceID, camera, err)
					return
				}
				publishRTPPacket(deviceID, camera, pkt)
				dc.mu.RLock()
				for vid, v := range dc.viewers {
					if v.track != nil {
						if err := v.track.WriteRTP(pkt); err != nil {
							log.Printf("WebRTC: fan-out viewer=%s err: %v", vid, err)
						}
					}
				}
				dc.mu.RUnlock()
			}
		}()
	})

	if err := pc.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: offerSDP}); err != nil {
		_ = pc.Close()
		return err
	}
	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		_ = pc.Close()
		return err
	}
	if err := pc.SetLocalDescription(answer); err != nil {
		_ = pc.Close()
		return err
	}
	dc.publisherPC = pc
	sendFn(map[string]interface{}{"type": "webrtc_answer", "camera": string(camera), "sdp": answer.SDP})
	return nil
}

// HandleAgentICE adds ICE candidate from Agent.
func (h *Hub) HandleAgentICE(deviceID string, camera CameraType, candidateJSON []byte) error {
	dc, ok := h.get(deviceID, camera)
	if !ok {
		return nil
	}
	dc.mu.RLock()
	pc := dc.publisherPC
	dc.mu.RUnlock()
	if pc == nil {
		return nil
	}
	var ci webrtc.ICECandidateInit
	if err := json.Unmarshal(candidateJSON, &ci); err != nil {
		return err
	}
	return pc.AddICECandidate(ci)
}

// RemovePublisher closes the Agent's publisher session.
func (h *Hub) RemovePublisher(deviceID string, camera CameraType) {
	dc, ok := h.get(deviceID, camera)
	if !ok {
		return
	}
	dc.mu.Lock()
	if dc.publisherPC != nil {
		_ = dc.publisherPC.Close()
		dc.publisherPC = nil
	}
	dc.trackMimeType = ""
	dc.mu.Unlock()
	log.Printf("WebRTC: publisher removed device=%s camera=%s", deviceID, camera)
}

// RemoveAllPublishers closes all publisher sessions for a device.
func (h *Hub) RemoveAllPublishers(deviceID string) {
	h.mu.RLock()
	var keys []string
	prefix := deviceID + ":"
	for k := range h.cameras {
		if len(k) > len(prefix) && k[:len(prefix)] == prefix {
			keys = append(keys, k[len(prefix):])
		}
	}
	h.mu.RUnlock()
	for _, cam := range keys {
		h.RemovePublisher(deviceID, CameraType(cam))
	}
}

// ─── Subscriber (Browser) side ───────────────────────────────────────────────

// RegisterViewer registers a browser viewer and waits for the publisher track.
// If publisher track is already available, immediately sends an offer.
// sendFn delivers signaling messages to the browser over its WebSocket.
func (h *Hub) RegisterViewer(deviceID string, camera CameraType, viewerID string, sendFn func(interface{})) {
	dc := h.getOrCreate(deviceID, camera)

	v := &viewerConn{sendFn: sendFn}

	dc.mu.Lock()
	if old, ok := dc.viewers[viewerID]; ok {
		if old.pc != nil {
			_ = old.pc.Close()
		}
	}
	dc.viewers[viewerID] = v
	// Use trackMimeType as the signal that OnTrack has already fired
	mimeType := dc.trackMimeType
	dc.mu.Unlock()

	if mimeType != "" {
		// Publisher track already arrived — send offer immediately
		log.Printf("WebRTC: viewer=%s registered, publisher track ready device=%s camera=%s", viewerID, deviceID, camera)
		go h.sendViewerOffer(deviceID, camera, viewerID, v, mimeType)
	} else {
		// Publisher not ready yet — viewer will get offer when OnTrack fires
		log.Printf("WebRTC: viewer=%s registered, waiting for publisher device=%s camera=%s", viewerID, deviceID, camera)
	}
}

// sendViewerOffer creates a PeerConnection for the viewer and sends an SDP offer.
func (h *Hub) sendViewerOffer(deviceID string, camera CameraType, viewerID string, v *viewerConn, mimeType string) {
	localTrack, err := webrtc.NewTrackLocalStaticRTP(
		webrtc.RTPCodecCapability{MimeType: mimeType},
		"video", "cam-"+string(camera)+"-"+viewerID,
	)
	if err != nil {
		log.Printf("WebRTC: NewTrackLocalStaticRTP viewer=%s err: %v", viewerID, err)
		return
	}

	pc, err := webrtc.NewPeerConnection(PeerConnectionConfig())
	if err != nil {
		log.Printf("WebRTC: NewPeerConnection viewer=%s err: %v", viewerID, err)
		return
	}

	if _, err := pc.AddTrack(localTrack); err != nil {
		_ = pc.Close()
		log.Printf("WebRTC: AddTrack viewer=%s err: %v", viewerID, err)
		return
	}

	pc.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c == nil {
			return
		}
		ci := c.ToJSON()
		v.sendFn(map[string]interface{}{
			"type": "webrtc_ice_candidate", "camera": string(camera), "role": "subscriber",
			"candidate": map[string]interface{}{
				"candidate": ci.Candidate, "sdpMid": ci.SDPMid, "sdpMLineIndex": ci.SDPMLineIndex,
			},
		})
	})

	pc.OnConnectionStateChange(func(s webrtc.PeerConnectionState) {
		log.Printf("WebRTC subscriber[%s/%s/%s] %s", deviceID, camera, viewerID, s)
		if s == webrtc.PeerConnectionStateFailed || s == webrtc.PeerConnectionStateClosed {
			h.RemoveViewer(deviceID, viewerID, camera)
		}
	})

	offer, err := pc.CreateOffer(nil)
	if err != nil {
		_ = pc.Close()
		log.Printf("WebRTC: CreateOffer viewer=%s err: %v", viewerID, err)
		return
	}
	if err := pc.SetLocalDescription(offer); err != nil {
		_ = pc.Close()
		log.Printf("WebRTC: SetLocalDescription viewer=%s err: %v", viewerID, err)
		return
	}

	// Store pc and track
	dc, ok := h.get(deviceID, camera)
	if !ok {
		_ = pc.Close()
		return
	}
	dc.mu.Lock()
	v.pc = pc
	v.track = localTrack
	dc.mu.Unlock()

	// Send offer to browser
	v.sendFn(map[string]interface{}{
		"type": "webrtc_offer", "camera": string(camera), "sdp": offer.SDP,
	})
	log.Printf("WebRTC: offer sent to viewer=%s device=%s camera=%s", viewerID, deviceID, camera)
}

// HandleViewerAnswer processes SDP answer from browser.
func (h *Hub) HandleViewerAnswer(deviceID string, camera CameraType, viewerID string, sdp string) error {
	dc, ok := h.get(deviceID, camera)
	if !ok {
		return nil
	}
	dc.mu.RLock()
	v, ok := dc.viewers[viewerID]
	dc.mu.RUnlock()
	if !ok || v.pc == nil {
		return nil
	}
	return v.pc.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeAnswer, SDP: sdp})
}

// HandleViewerICE adds ICE candidate from browser.
func (h *Hub) HandleViewerICE(deviceID string, viewerID string, camera CameraType, candidateJSON []byte) error {
	dc, ok := h.get(deviceID, camera)
	if !ok {
		return nil
	}
	dc.mu.RLock()
	v, ok := dc.viewers[viewerID]
	dc.mu.RUnlock()
	if !ok || v.pc == nil {
		return nil
	}
	var ci webrtc.ICECandidateInit
	if err := json.Unmarshal(candidateJSON, &ci); err != nil {
		return err
	}
	return v.pc.AddICECandidate(ci)
}

// BroadcastError sends an error message to all viewers waiting for a camera.
func (h *Hub) BroadcastError(deviceID string, camera CameraType, message string) {
	dc, ok := h.get(deviceID, camera)
	if !ok {
		return
	}
	dc.mu.RLock()
	defer dc.mu.RUnlock()
	for _, v := range dc.viewers {
		v.sendFn(map[string]interface{}{
			"type":    "error",
			"camera":  string(camera),
			"message": message,
		})
	}
}

// RemoveViewer closes and removes a browser viewer's session.
// Returns the number of remaining viewers.
func (h *Hub) RemoveViewer(deviceID string, viewerID string, camera CameraType) int {
	dc, ok := h.get(deviceID, camera)
	if !ok {
		return 0
	}
	dc.mu.Lock()
	if v, ok := dc.viewers[viewerID]; ok {
		if v.pc != nil {
			_ = v.pc.Close()
		}
		delete(dc.viewers, viewerID)
	}
	remaining := len(dc.viewers)
	dc.mu.Unlock()
	return remaining
}
