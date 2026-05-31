package game

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	heartbeatInterval = 30 * time.Second
	pongWait          = 60 * time.Second
	writeWait         = 10 * time.Second
	maxRoomIdleTime   = 10 * time.Minute
	cleanupInterval   = 5 * time.Minute
)

type Room struct {
	ID             string
	Players        map[*websocket.Conn]int
	Game           *Game
	Mutex          sync.Mutex
	lastActivity   time.Time
	pendingUndo    map[int]bool
	redisKey       string
}

type Message struct {
	Type     string      `json:"type"`
	Data     interface{} `json:"data"`
	PlayerID int         `json:"playerId,omitempty"`
}

var (
	Rooms      = make(map[string]*Room)
	roomsMutex sync.RWMutex
	once       sync.Once
	Rdb        RedisClient
)

type RedisClient interface {
	RPush(ctx context.Context, key string, values ...interface{}) error
	LRange(ctx context.Context, key string, start, stop int64) ([]string, error)
	Del(ctx context.Context, keys ...string) error
	LTrim(ctx context.Context, key string, start, stop int64) error
	LLen(ctx context.Context, key string) (int64, error)
}

func InitRedis(addr string) error {
	rdb, err := NewGoRedisClient(addr)
	if err != nil {
		return err
	}
	Rdb = rdb
	log.Println("Redis connected:", addr)
	return nil
}

func initCleanup() {
	once.Do(func() {
		go cleanupEmptyRooms()
	})
}

func NewRoom(id string) *Room {
	initCleanup()
	return &Room{
		ID:           id,
		Players:      make(map[*websocket.Conn]int),
		Game:         NewGame(),
		lastActivity: time.Now(),
		pendingUndo:  make(map[int]bool),
		redisKey:     fmt.Sprintf("gomoku:room:%s:moves", id),
	}
}

func (r *Room) updateActivity() {
	r.lastActivity = time.Now()
}

func (r *Room) AddPlayer(conn *websocket.Conn) int {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	playerID := len(r.Players) + 1
	r.Players[conn] = playerID
	r.updateActivity()
	return playerID
}

func (r *Room) RemovePlayer(conn *websocket.Conn) int {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	playerID := r.Players[conn]
	delete(r.Players, conn)
	delete(r.pendingUndo, playerID)
	r.updateActivity()
	return playerID
}

func (r *Room) PlayerCount() int {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()
	return len(r.Players)
}

func (r *Room) IsIdle() bool {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()
	return len(r.Players) == 0 && time.Since(r.lastActivity) > maxRoomIdleTime
}

func (r *Room) Broadcast(msg Message) {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	for conn := range r.Players {
		err := conn.WriteJSON(msg)
		if err != nil {
			log.Printf("Broadcast error: %v", err)
			conn.Close()
			delete(r.Players, conn)
		}
	}
	r.updateActivity()
}

func (r *Room) HandleMessage(conn *websocket.Conn, msg Message) {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	playerID := r.Players[conn]

	switch msg.Type {
	case "move":
		moveData, _ := json.Marshal(msg.Data)
		var move Move
		json.Unmarshal(moveData, &move)

		if r.Game.MakeMove(move.X, move.Y, playerID) {
			r.broadcastWithoutLock(Message{
				Type: "move",
				Data: map[string]interface{}{
					"x":           move.X,
					"y":           move.Y,
					"color":       playerID,
					"gameOver":    r.Game.GameOver,
					"winner":      r.Game.Winner,
					"currentTurn": r.Game.CurrentTurn,
				},
			})

			if Rdb != nil {
				moveJSON, _ := json.Marshal(Move{X: move.X, Y: move.Y, Color: playerID})
				go func() {
					ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
					defer cancel()
					if err := Rdb.RPush(ctx, r.redisKey, string(moveJSON)); err != nil {
						log.Printf("Redis RPUSH error for room %s: %v", r.ID, err)
					}
				}()
			}
		}

	case "undo_request":
		if len(r.Game.History) > 0 && r.Game.History[len(r.Game.History)-1].Color == playerID {
			r.pendingUndo[playerID] = true
			for opponentConn, opponentID := range r.Players {
				if opponentID != playerID {
					opponentConn.WriteJSON(Message{
						Type: "undo_request",
						Data: map[string]interface{}{
							"playerId": playerID,
						},
					})
				}
			}
		}

	case "undo_accept":
		requesterID := 3 - playerID
		if r.pendingUndo[requesterID] {
			delete(r.pendingUndo, requesterID)
			if len(r.Game.History) > 0 {
				r.Game.UndoMove()
				r.broadcastWithoutLock(Message{
					Type: "undo",
					Data: map[string]interface{}{
						"board":       r.Game.Board,
						"currentTurn": r.Game.CurrentTurn,
						"history":     r.Game.History,
					},
				})

				if Rdb != nil {
					go func() {
						ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
						defer cancel()
						len, err := Rdb.LLen(ctx, r.redisKey)
						if err == nil && len > 0 {
							Rdb.LTrim(ctx, r.redisKey, 0, len-2)
						}
					}()
				}
			}
		}

	case "undo_reject":
		requesterID := 3 - playerID
		if r.pendingUndo[requesterID] {
			delete(r.pendingUndo, requesterID)
			for opponentConn, opponentID := range r.Players {
				if opponentID == requesterID {
					opponentConn.WriteJSON(Message{
						Type: "undo_rejected",
						Data: map[string]interface{}{},
					})
				}
			}
		}

	case "restart":
		r.Game.Reset()
		r.pendingUndo = make(map[int]bool)
		r.broadcastWithoutLock(Message{
			Type: "restart",
			Data: map[string]interface{}{
				"board":       r.Game.Board,
				"currentTurn": r.Game.CurrentTurn,
				"history":     r.Game.History,
			},
		})

		if Rdb != nil {
			go func() {
				ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
				defer cancel()
				Rdb.Del(ctx, r.redisKey)
			}()
		}

	case "replay":
		if Rdb != nil {
			go func() {
				ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
				defer cancel()
				results, err := Rdb.LRange(ctx, r.redisKey, 0, -1)
				if err != nil {
					log.Printf("Redis LRANGE error for room %s: %v", r.ID, err)
					return
				}
				var moves []Move
				for _, s := range results {
					var m Move
					if json.Unmarshal([]byte(s), &m) == nil {
						moves = append(moves, m)
					}
				}
				r.Broadcast(Message{
					Type: "replay",
					Data: map[string]interface{}{
						"history": moves,
					},
				})
			}()
		} else {
			r.broadcastWithoutLock(Message{
				Type: "replay",
				Data: map[string]interface{}{
					"history": r.Game.History,
				},
			})
		}

	case "pong":
	}

	r.updateActivity()
}

func (r *Room) broadcastWithoutLock(msg Message) {
	for conn := range r.Players {
		err := conn.WriteJSON(msg)
		if err != nil {
			log.Printf("Broadcast error: %v", err)
			conn.Close()
			delete(r.Players, conn)
		}
	}
}

func GetRoom(id string) *Room {
	roomsMutex.Lock()
	defer roomsMutex.Unlock()

	if room, exists := Rooms[id]; exists {
		room.updateActivity()
		return room
	}
	room := NewRoom(id)
	Rooms[id] = room
	return room
}

func cleanupEmptyRooms() {
	ticker := time.NewTicker(cleanupInterval)
	defer ticker.Stop()

	for range ticker.C {
		roomsMutex.Lock()
		initialCount := len(Rooms)
		for id, room := range Rooms {
			if room.IsIdle() {
				log.Printf("Cleaning up idle room: %s", id)
				if Rdb != nil {
					go func(key string) {
						ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
						defer cancel()
						Rdb.Del(ctx, key)
					}(room.redisKey)
				}
				delete(Rooms, id)
			}
		}
		cleanedCount := initialCount - len(Rooms)
		if cleanedCount > 0 {
			log.Printf("Cleaned up %d idle rooms, remaining: %d", cleanedCount, len(Rooms))
		}
		roomsMutex.Unlock()
	}
}

func SetupHeartbeat(conn *websocket.Conn, onDisconnect func()) {
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	ticker := time.NewTicker(heartbeatInterval)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				conn.SetWriteDeadline(time.Now().Add(writeWait))
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					log.Printf("Heartbeat ping failed, closing connection: %v", err)
					onDisconnect()
					return
				}
			}
		}
	}()
}
