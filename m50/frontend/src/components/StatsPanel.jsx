import React from 'react';

const StatsPanel = ({ stats }) => {
  if (!stats) return null;

  const statItems = [
    { label: '总用户数', value: stats.total_users, icon: '👥' },
    { label: '总页面浏览', value: stats.total_page_views, icon: '📊' },
    { label: '唯一页面数', value: stats.unique_pages, icon: '📄' },
    { label: '平均路径长度', value: stats.avg_path_length, icon: '🔗' }
  ];

  return (
    <div className="stats-panel">
      {statItems.map((item, index) => (
        <div key={index} className="stat-card">
          <div className="stat-icon">{item.icon}</div>
          <div className="stat-content">
            <div className="stat-label">{item.label}</div>
            <div className="stat-value">{item.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default StatsPanel;
