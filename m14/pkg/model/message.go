package model

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
)

type MessageType string

const (
	MessageTypePing      MessageType = "ping"
	MessageTypePong      MessageType = "pong"
	MessageTypeAuth      MessageType = "auth"
	MessageTypeAuthAck   MessageType = "auth_ack"
	MessageTypePush      MessageType = "push"
	MessageTypeBroadcast MessageType = "broadcast"
	MessageTypeACK       MessageType = "ack"
	MessageTypeNAK       MessageType = "nak"
)

type Message struct {
	Type    MessageType `json:"type"`
	MsgID   string      `json:"msg_id,omitempty"`
	UserID  string      `json:"user_id,omitempty"`
	Payload interface{} `json:"payload,omitempty"`
}

type PushMessage struct {
	UserIDs   []string    `json:"user_ids"`
	Payload   interface{} `json:"payload"`
	Timestamp int64       `json:"timestamp"`
}

type PubSubMessage struct {
	MsgID     string      `json:"msg_id,omitempty"`
	GatewayID string      `json:"gateway_id,omitempty"`
	UserIDs   []string    `json:"user_ids,omitempty"`
	Payload   interface{} `json:"payload"`
	Action    string      `json:"action"`
	Timestamp int64       `json:"timestamp"`
	Retry     int         `json:"retry,omitempty"`
}

type AuthRequest struct {
	Token  string `json:"token"`
	UserID string `json:"user_id"`
}

type PushRequest struct {
	UserIDs []string    `json:"user_ids" binding:"required"`
	Payload interface{} `json:"payload" binding:"required"`
}

type PushResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
}

type ACKMessage struct {
	MsgID string `json:"msg_id"`
}

type PendingMessage struct {
	MsgID     string      `json:"msg_id"`
	UserID    string      `json:"user_id"`
	Payload   interface{} `json:"payload"`
	Retry     int         `json:"retry"`
	MaxRetry  int         `json:"max_retry"`
	RetryAt   int64       `json:"retry_at"`
	CreatedAt int64       `json:"created_at"`
}

type HistoryMessage struct {
	MsgID     string      `json:"msg_id"`
	Payload   interface{} `json:"payload"`
	Timestamp int64       `json:"timestamp"`
	Status    string      `json:"status"`
}

type HistoryRequest struct {
	UserID  string `form:"user_id" binding:"required"`
	Limit   int64  `form:"limit,default=50"`
	Offset  int64  `form:"offset,default=0"`
}

func GenerateMsgID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func (m *Message) ToJSON() ([]byte, error) {
	return json.Marshal(m)
}

func (m *PushMessage) ToJSON() ([]byte, error) {
	return json.Marshal(m)
}

func (m *PubSubMessage) ToJSON() ([]byte, error) {
	return json.Marshal(m)
}

func ParsePubSubMessage(data []byte) (*PubSubMessage, error) {
	var msg PubSubMessage
	err := json.Unmarshal(data, &msg)
	if err != nil {
		return nil, err
	}
	return &msg, nil
}

func ParseMessage(data []byte) (*Message, error) {
	var msg Message
	err := json.Unmarshal(data, &msg)
	if err != nil {
		return nil, err
	}
	return &msg, nil
}

func ParseACKMessage(data []byte) (*ACKMessage, error) {
	var ack ACKMessage
	err := json.Unmarshal(data, &ack)
	if err != nil {
		return nil, err
	}
	return &ack, nil
}

func (pm *PendingMessage) ToJSON() ([]byte, error) {
	return json.Marshal(pm)
}

func ParsePendingMessage(data []byte) (*PendingMessage, error) {
	var pm PendingMessage
	err := json.Unmarshal(data, &pm)
	if err != nil {
		return nil, err
	}
	return &pm, nil
}
