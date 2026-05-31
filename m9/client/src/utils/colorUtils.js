export const PIPE_TYPE_COLORS = {
  water: '#1E90FF',
  sewage: '#556B2F',
  gas: '#FF6347',
  electric: '#FFD700',
  telecom: '#9370DB',
  heating: '#FF4500'
};

export const PIPE_TYPE_NAMES = {
  water: '给水管道',
  sewage: '污水管道',
  gas: '燃气管道',
  electric: '电力管线',
  telecom: '通信管线',
  heating: '热力管道'
};

export const PIPE_TYPE_ICONS = {
  water: '💧',
  sewage: '🚰',
  gas: '🔥',
  electric: '⚡',
  telecom: '📡',
  heating: '🌡️'
};

export const PIPE_MATERIAL_NAMES = {
  concrete: '混凝土',
  steel: '钢材',
  pvc: 'PVC',
  cast_iron: '铸铁',
  copper: '铜'
};

export const PIPE_STATUS_NAMES = {
  normal: '正常',
  maintenance: '维护中',
  damaged: '损坏',
  abandoned: '废弃'
};

export const BUILDING_TYPE_NAMES = {
  commercial: '商业建筑',
  residential: '住宅建筑',
  industrial: '工业建筑',
  public: '公共建筑'
};

export const BUILDING_TYPE_COLORS = {
  commercial: '#3B82F6',
  residential: '#10B981',
  industrial: '#F59E0B',
  public: '#8B5CF6'
};

export function getHeightColor(height, maxHeight = 150) {
  const ratio = Math.min(height / maxHeight, 1);
  
  if (ratio < 0.2) {
    return [34, 197, 94, 200];
  } else if (ratio < 0.4) {
    return [132, 204, 22, 200];
  } else if (ratio < 0.6) {
    return [234, 179, 8, 200];
  } else if (ratio < 0.8) {
    return [249, 115, 22, 200];
  } else if (ratio < 0.95) {
    return [239, 68, 68, 200];
  } else {
    return [124, 58, 237, 200];
  }
}

export function getHeightColorHex(height, maxHeight = 150) {
  const ratio = Math.min(height / maxHeight, 1);
  
  if (ratio < 0.2) {
    return '#22c55e';
  } else if (ratio < 0.4) {
    return '#84cc16';
  } else if (ratio < 0.6) {
    return '#eab308';
  } else if (ratio < 0.8) {
    return '#f97316';
  } else if (ratio < 0.95) {
    return '#ef4444';
  } else {
    return '#7c3aed';
  }
}

export function hexToRgb(hex, alpha = 255) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
    alpha
  ] : [128, 128, 128, alpha];
}

export function getStatusBadgeClass(status) {
  const classes = {
    normal: 'badge-normal',
    maintenance: 'badge-maintenance',
    damaged: 'badge-damaged',
    abandoned: 'badge-abandoned'
  };
  return classes[status] || 'badge-normal';
}

export function formatNumber(num, decimals = 0) {
  if (num === null || num === undefined) return '-';
  return Number(num).toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}
