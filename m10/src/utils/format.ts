export const formatHash = (hash: string, start = 6, end = 4): string => {
  if (!hash) return '';
  if (hash.length <= start + end) return hash;
  return `${hash.slice(0, start)}...${hash.slice(-end)}`;
};

export const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const formatTimeAgo = (timestamp: number): string => {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return `${diff} 秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
};

export const formatNumber = (num: number | string): string => {
  if (typeof num === 'string') {
    num = parseInt(num.replace(/,/g, '')) || 0;
  }
  return num.toLocaleString('zh-CN');
};

export const formatGasUsed = (gas: number): string => {
  if (gas >= 1000000) {
    return (gas / 1000000).toFixed(2) + ' M';
  }
  if (gas >= 1000) {
    return (gas / 1000).toFixed(2) + ' K';
  }
  return gas.toString();
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};
