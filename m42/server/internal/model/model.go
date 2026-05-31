package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Cluster struct {
	ID        uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name      string         `gorm:"size:255;not null" json:"name"`
	Mode      string         `gorm:"size:20;not null;default:'standalone'" json:"mode"`
	Addrs     StringArray    `gorm:"type:jsonb;not null" json:"addrs"`
	Password  string         `gorm:"size:255" json:"-"`
	Status    string         `gorm:"size:20;not null;default:'offline'" json:"status"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (c *Cluster) BeforeCreate(tx *gorm.DB) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	return nil
}

type StringArray []string

func (s StringArray) Value() (interface{}, error) {
	return json.Marshal(s)
}

func (s *StringArray) Scan(value interface{}) error {
	if value == nil {
		*s = StringArray{}
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, s)
}

type ClusterNode struct {
	ID               uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	ClusterID        uuid.UUID `gorm:"type:uuid;not null;index" json:"clusterId"`
	NodeID           string    `gorm:"size:64" json:"nodeId"`
	Addr             string    `gorm:"size:255;not null" json:"addr"`
	Role             string    `gorm:"size:20;not null;default:'slave'" json:"role"`
	Slots            string    `gorm:"type:text" json:"slots"`
	MasterID         string    `gorm:"size:64" json:"masterId"`
	Status           string    `gorm:"size:20;not null;default:'offline'" json:"status"`
	Memory           int64     `json:"memory"`
	ConnectedClients int       `json:"connectedClients"`
	LatencyMs        float64   `json:"latencyMs"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

func (n *ClusterNode) BeforeCreate(tx *gorm.DB) error {
	if n.ID == uuid.Nil {
		n.ID = uuid.New()
	}
	return nil
}

type SlowlogEntry struct {
	ID                 int64     `gorm:"bigserial;primaryKey" json:"id"`
	ClusterID          uuid.UUID `gorm:"type:uuid;not null;index" json:"clusterId"`
	NodeAddr         string    `gorm:"size:255;not null;index" json:"nodeAddr"`
	SlowlogID        int64     `gorm:"not null" json:"slowlogId"`
	Command          string    `gorm:"size:500;not null;index" json:"command"`
	CommandFingerprint string `gorm:"size:500;index" json:"commandFingerprint"`
	DurationUs       int64     `gorm:"not null" json:"durationUs"`
	OccurredAt       time.Time `gorm:"not null;index" json:"timestamp"`
	Args             string    `gorm:"type:text" json:"args"`
	CreatedAt        time.Time `json:"createdAt"`
}
