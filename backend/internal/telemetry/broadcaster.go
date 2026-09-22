package telemetry

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
)

// Event represents a server-sent event payload.
type Event struct {
	Type    string      `json:"type"` // e.g. "alert_created", "alert_resolved", "alert_acknowledged", "telemetry_cycle"
	Payload interface{} `json:"payload"`
}

// Broadcaster manages active SSE client connections.
type Broadcaster struct {
	mu      sync.RWMutex
	clients map[chan Event]struct{}
}

// NewBroadcaster initializes the SSE event hub.
func NewBroadcaster() *Broadcaster {
	return &Broadcaster{
		clients: make(map[chan Event]struct{}),
	}
}

// Subscribe registers a new SSE client channel.
func (b *Broadcaster) Subscribe() chan Event {
	b.mu.Lock()
	defer b.mu.Unlock()

	ch := make(chan Event, 16)
	b.clients[ch] = struct{}{}
	return ch
}

// Unsubscribe removes an SSE client channel.
func (b *Broadcaster) Unsubscribe(ch chan Event) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if _, ok := b.clients[ch]; ok {
		delete(b.clients, ch)
		close(ch)
	}
}

// Broadcast sends an event to all connected clients.
func (b *Broadcaster) Broadcast(eventType string, payload interface{}) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	ev := Event{
		Type:    eventType,
		Payload: payload,
	}

	for ch := range b.clients {
		select {
		case ch <- ev:
		default:
			// Non-blocking drop if client buffer is full
		}
	}
}

// ServeHTTP handles the SSE streaming endpoint.
func (b *Broadcaster) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	clientChan := b.Subscribe()
	defer b.Unsubscribe(clientChan)

	// Send initial ping/connected event
	fmt.Fprintf(w, "event: connected\ndata: {\"status\":\"connected\"}\n\n")
	flusher.Flush()

	notify := r.Context().Done()

	for {
		select {
		case <-notify:
			return
		case event, ok := <-clientChan:
			if !ok {
				return
			}
			data, err := json.Marshal(event)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Type, data)
			flusher.Flush()
		}
	}
}
