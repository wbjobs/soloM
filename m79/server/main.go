package main

import (
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"sync/atomic"

	"gomoku-server/game"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("room")
	if roomID == "" {
		http.Error(w, "Room ID is required", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	room := game.GetRoom(roomID)
	playerID := room.AddPlayer(conn)

	log.Printf("Player %d joined room %s (total players: %d)", playerID, roomID, room.PlayerCount())

	var disconnected int32 = 0

	cleanup := func() {
		if atomic.CompareAndSwapInt32(&disconnected, 0, 1) {
			conn.Close()
			room.RemovePlayer(conn)
			playerCount := room.PlayerCount()
			room.Broadcast(game.Message{
				Type: "playerLeft",
				Data: map[string]interface{}{
					"playerId":    playerID,
					"playerCount": playerCount,
				},
			})
			log.Printf("Player %d left room %s (remaining: %d)", playerID, roomID, playerCount)
		}
	}

	defer cleanup()

	game.SetupHeartbeat(conn, cleanup)

	conn.WriteJSON(game.Message{
		Type: "join",
		Data: map[string]interface{}{
			"playerId":    playerID,
			"board":       room.Game.Board,
			"currentTurn": room.Game.CurrentTurn,
			"history":     room.Game.History,
			"gameOver":    room.Game.GameOver,
			"winner":      room.Game.Winner,
		},
	})

	room.Broadcast(game.Message{
		Type: "playerJoined",
		Data: map[string]interface{}{
			"playerId":    playerID,
			"playerCount": room.PlayerCount(),
		},
	})

	for {
		var msg game.Message
		err := conn.ReadJSON(&msg)
		if err != nil {
			if atomic.LoadInt32(&disconnected) == 0 {
				log.Printf("Read error for player %d: %v", playerID, err)
			}
			break
		}

		if atomic.LoadInt32(&disconnected) == 1 {
			break
		}

		room.HandleMessage(conn, msg)
	}
}

func handleCreateRoom(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	type Request struct {
		RoomID string `json:"roomId"`
	}

	var req Request
	json.NewDecoder(r.Body).Decode(&req)

	if req.RoomID == "" {
		req.RoomID = generateRoomID()
	}

	room := game.GetRoom(req.RoomID)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"roomId": room.ID,
		"success": true,
	})
}

func generateRoomID() string {
	return "room-" + randomString(6)
}

func randomString(n int) string {
	letters := []rune("abcdefghijklmnopqrstuvwxyz0123456789")
	b := make([]rune, n)
	for i := range b {
		b[i] = letters[i%len(letters)]
	}
	return string(b)
}

func main() {
	redisAddr := flag.String("redis", "", "Redis address (e.g. localhost:6379). Leave empty to disable Redis.")
	flag.Parse()

	if *redisAddr != "" {
		if err := game.InitRedis(*redisAddr); err != nil {
			log.Printf("Warning: Redis connection failed (%v), running without Redis persistence", err)
		}
	} else {
		log.Println("Redis not configured, running without persistence (use -redis flag to enable)")
	}

	fs := http.FileServer(http.Dir("../public"))
	http.Handle("/", fs)

	http.HandleFunc("/ws", handleWebSocket)
	http.HandleFunc("/api/create-room", handleCreateRoom)

	log.Println("Server starting on :8080...")
	log.Println("Features enabled:")
	log.Println("  - Heartbeat detection (30s ping, 60s timeout)")
	log.Println("  - Auto cleanup idle rooms (10 min timeout, check every 5 min)")
	log.Println("  - Move pending lock on client")
	log.Println("  - Undo requires opponent confirmation")
	if *redisAddr != "" {
		log.Println("  - Redis persistence for game history")
	}
	log.Fatal(http.ListenAndServe(":8080", nil))
}
