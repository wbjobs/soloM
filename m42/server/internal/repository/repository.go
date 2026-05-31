package repository

import (
	"time"

	"github.com/google/uuid"
	"redis-monitor/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) DB() *gorm.DB {
	return r.db
}

func (r *Repository) CreateCluster(cluster *model.Cluster) error {
	return r.db.Create(cluster).Error
}

func (r *Repository) ListClusters() ([]model.Cluster, error) {
	var clusters []model.Cluster
	err := r.db.Find(&clusters).Error
	return clusters, err
}

func (r *Repository) GetCluster(id uuid.UUID) (*model.Cluster, error) {
	var cluster model.Cluster
	err := r.db.Where("id = ?", id).First(&cluster).Error
	return &cluster, err
}

func (r *Repository) DeleteCluster(id uuid.UUID) error {
	return r.db.Where("id = ?", id).Delete(&model.Cluster{}).Error
}

func (r *Repository) UpsertNodes(nodes []model.ClusterNode) error {
	if len(nodes) == 0 {
		return nil
	}
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "cluster_id"}, {Name: "addr"}},
		DoUpdates: clause.AssignmentColumns([]string{"node_id", "role", "slots", "master_id", "status", "memory", "connected_clients", "latency_ms", "updated_at"}),
	}).Create(&nodes).Error
}

func (r *Repository) GetNodesByCluster(clusterID uuid.UUID) ([]model.ClusterNode, error) {
	var nodes []model.ClusterNode
	err := r.db.Where("cluster_id = ?", clusterID).Find(&nodes).Error
	return nodes, err
}

func (r *Repository) CreateSlowlogEntry(entries []model.SlowlogEntry) error {
	if len(entries) == 0 {
		return nil
	}
	return r.db.Create(&entries).Error
}

type SlowlogFilter struct {
	ClusterID   uuid.UUID
	NodeAddr    string
	Command     string
	StartTime   *time.Time
	EndTime     *time.Time
	MinDuration int64
	Page        int
	PageSize    int
}

func (r *Repository) ListSlowlogEntries(filter SlowlogFilter) ([]model.SlowlogEntry, int64, error) {
	var entries []model.SlowlogEntry
	var total int64

	query := r.db.Model(&model.SlowlogEntry{})

	if filter.ClusterID != uuid.Nil {
		query = query.Where("cluster_id = ?", filter.ClusterID)
	}
	if filter.NodeAddr != "" {
		query = query.Where("node_addr = ?", filter.NodeAddr)
	}
	if filter.Command != "" {
		query = query.Where("command LIKE ?", "%"+filter.Command+"%")
	}
	if filter.StartTime != nil {
		query = query.Where("occurred_at >= ?", filter.StartTime)
	}
	if filter.EndTime != nil {
		query = query.Where("occurred_at <= ?", filter.EndTime)
	}
	if filter.MinDuration > 0 {
		query = query.Where("duration_us >= ?", filter.MinDuration)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	page := filter.Page
	if page < 1 {
		page = 1
	}
	pageSize := filter.PageSize
	if pageSize < 1 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize
	err := query.Order("occurred_at DESC").Offset(offset).Limit(pageSize).Find(&entries).Error
	return entries, total, err
}

type SlowlogStats struct {
	TotalEntries int64   `json:"totalEntries"`
	AvgDuration  float64 `json:"avgDurationUs"`
	MaxDuration  int64   `json:"maxDurationUs"`
	MinDuration  int64   `json:"minDurationUs"`
}

func (r *Repository) GetSlowlogStats(clusterID uuid.UUID) (*SlowlogStats, error) {
	var stats SlowlogStats
	query := r.db.Model(&model.SlowlogEntry{})
	if clusterID != uuid.Nil {
		query = query.Where("cluster_id = ?", clusterID)
	}
	err := query.Select("COUNT(*) as total_entries, COALESCE(AVG(duration_us), 0) as avg_duration, COALESCE(MAX(duration_us), 0) as max_duration, COALESCE(MIN(duration_us), 0) as min_duration").Scan(&stats).Error
	return &stats, err
}

type TrendPoint struct {
	Time  time.Time `json:"time"`
	Count int64     `json:"count"`
	Avg   float64   `json:"avgDuration"`
}

func (r *Repository) GetSlowlogTrend(clusterID uuid.UUID, start, end time.Time, interval string) ([]TrendPoint, error) {
	var points []TrendPoint
	groupExpr := ""
	switch interval {
	case "hour":
		groupExpr = "date_trunc('hour', occurred_at)"
	case "day":
		groupExpr = "date_trunc('day', occurred_at)"
	default:
		groupExpr = "date_trunc('hour', occurred_at)"
	}

	query := r.db.Model(&model.SlowlogEntry{}).
		Select(groupExpr+" as time, COUNT(*) as count, AVG(duration_us) as avg").
		Where("occurred_at >= ? AND occurred_at <= ?", start, end)

	if clusterID != uuid.Nil {
		query = query.Where("cluster_id = ?", clusterID)
	}

	err := query.Group(groupExpr).Order("time ASC").Scan(&points).Error
	return points, err
}

type DistributionPoint struct {
	Range string `json:"range"`
	Count int64  `json:"count"`
}

func (r *Repository) GetSlowlogDistribution(clusterID uuid.UUID) ([]DistributionPoint, error) {
	var points []DistributionPoint
	query := r.db.Model(&model.SlowlogEntry{}).
		Select(`CASE
			WHEN duration_us < 1000 THEN '<1ms'
			WHEN duration_us < 10000 THEN '1-10ms'
			WHEN duration_us < 100000 THEN '10-100ms'
			WHEN duration_us < 1000000 THEN '100ms-1s'
			ELSE '>1s'
		END as range, COUNT(*) as count`)

	if clusterID != uuid.Nil {
		query = query.Where("cluster_id = ?", clusterID)
	}

	err := query.Group("range").Scan(&points).Error
	return points, err
}

type CommandStat struct {
	Command string  `json:"command"`
	Count   int64   `json:"count"`
	Avg     float64 `json:"avgDuration"`
	Max     int64   `json:"maxDuration"`
}

func (r *Repository) GetSlowlogCommands(clusterID uuid.UUID, limit int) ([]CommandStat, error) {
	var stats []CommandStat
	if limit < 1 {
		limit = 10
	}

	query := r.db.Model(&model.SlowlogEntry{}).
		Select("command, COUNT(*) as count, AVG(duration_us) as avg, MAX(duration_us) as max")

	if clusterID != uuid.Nil {
		query = query.Where("cluster_id = ?", clusterID)
	}

	err := query.Group("command").Order("count DESC").Limit(limit).Scan(&stats).Error
	return stats, err
}

type FingerprintStat struct {
	Fingerprint   string  `json:"fingerprint"`
	Count         int64   `json:"count"`
	TotalDuration int64   `json:"totalDurationUs"`
	AvgDuration   float64 `json:"avgDurationUs"`
	MaxDuration   int64   `json:"maxDurationUs"`
	Percentage    float64 `json:"percentage"`
}

func (r *Repository) GetSlowlogFingerprints(clusterID uuid.UUID, limit int) ([]FingerprintStat, error) {
	var stats []FingerprintStat
	if limit < 1 {
		limit = 15
	}

	var totalDuration int64
	totalQuery := r.db.Model(&model.SlowlogEntry{}).Select("COALESCE(SUM(duration_us), 0)")
	if clusterID != uuid.Nil {
		totalQuery = totalQuery.Where("cluster_id = ?", clusterID)
	}
	totalQuery.Scan(&totalDuration)

	if totalDuration == 0 {
		totalDuration = 1
	}

	query := r.db.Model(&model.SlowlogEntry{}).
		Select(`
			command_fingerprint as fingerprint,
			COUNT(*) as count,
			SUM(duration_us) as total_duration,
			AVG(duration_us) as avg_duration,
			MAX(duration_us) as max_duration
		`)

	if clusterID != uuid.Nil {
		query = query.Where("cluster_id = ?", clusterID)
	}

	err := query.Group("command_fingerprint").Order("total_duration DESC").Limit(limit).Scan(&stats).Error
	if err != nil {
		return nil, err
	}

	for i := range stats {
		stats[i].Percentage = float64(stats[i].TotalDuration) / float64(totalDuration) * 100
	}

	return stats, nil
}

type DashboardOverview struct {
	TotalClusters   int64 `json:"clusterCount"`
	OnlineClusters  int64 `json:"onlineClusters"`
	TotalNodes      int64 `json:"totalNodes"`
	OnlineNodes     int64 `json:"onlineNodes"`
	SlowlogToday    int64 `json:"slowlogCount24h"`
	SlowlogLastHour int64 `json:"slowlogLastHour"`
}

func (r *Repository) GetDashboardOverview() (*DashboardOverview, error) {
	var overview DashboardOverview

	r.db.Model(&model.Cluster{}).Count(&overview.TotalClusters)
	r.db.Model(&model.Cluster{}).Where("status = ?", "online").Count(&overview.OnlineClusters)
	r.db.Model(&model.ClusterNode{}).Count(&overview.TotalNodes)
	r.db.Model(&model.ClusterNode{}).Where("status = ?", "online").Count(&overview.OnlineNodes)

	today := time.Now().Truncate(24 * time.Hour)
	r.db.Model(&model.SlowlogEntry{}).Where("occurred_at >= ?", today).Count(&overview.SlowlogToday)

	lastHour := time.Now().Add(-1 * time.Hour)
	r.db.Model(&model.SlowlogEntry{}).Where("occurred_at >= ?", lastHour).Count(&overview.SlowlogLastHour)

	return &overview, nil
}

func (r *Repository) GetRecentSlowlogs(limit int) ([]model.SlowlogEntry, error) {
	var entries []model.SlowlogEntry
	if limit < 1 {
		limit = 20
	}
	err := r.db.Order("occurred_at DESC").Limit(limit).Find(&entries).Error
	return entries, err
}

func (r *Repository) GetMaxSlowlogID(clusterID uuid.UUID, nodeAddr string) (int64, error) {
	var maxID *int64
	err := r.db.Model(&model.SlowlogEntry{}).
		Select("MAX(slowlog_id)").
		Where("cluster_id = ? AND node_addr = ?", clusterID, nodeAddr).
		Scan(&maxID).Error
	if maxID == nil {
		return 0, err
	}
	return *maxID, err
}
