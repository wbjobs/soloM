import { useEffect, useState } from 'react';
import { Zap, TrendingUp, Copy, Check, Clock, Hash, ArrowRight } from 'lucide-react';
import { useBlockStore } from '@/store/useBlockStore';
import { formatHash, formatGasUsed, formatTimeAgo, formatNumber, copyToClipboard } from '@/utils/format';
import type { GasRankingItem } from '../../shared/types';

export default function GasRanking() {
  const { gasRanking, loading, fetchGasRanking } = useBlockStore();
  const [copied, setCopied] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'gasUsed' | 'fee'>('gasUsed');

  useEffect(() => {
    fetchGasRanking(20);
  }, [fetchGasRanking]);

  const handleCopy = async (text: string, id: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const maxGasUsed = Math.max(...gasRanking.map(item => item.gasUsed), 1);

  const sortedRanking = [...gasRanking].sort((a, b) => {
    if (sortBy === 'gasUsed') {
      return b.gasUsed - a.gasUsed;
    }
    return parseFloat(b.fee) - parseFloat(a.fee);
  });

  const getRankBadge = (rank: number) => {
    const colors = {
      1: 'bg-gradient-to-br from-yellow-400 to-orange-500 text-block-bg',
      2: 'bg-gradient-to-br from-gray-300 to-gray-400 text-block-bg',
      3: 'bg-gradient-to-br from-amber-600 to-amber-700 text-white',
    };
    return colors[rank as keyof typeof colors] || 'bg-block-border text-block-text-muted';
  };

  const summaryStats = [
    {
      label: '最高 Gas 消耗',
      value: sortedRanking.length > 0 ? formatGasUsed(sortedRanking[0].gasUsed) : '-',
      icon: Zap,
      gradient: 'from-block-danger to-rose-400',
    },
    {
      label: '平均 Gas 消耗',
      value: sortedRanking.length > 0
        ? formatGasUsed(Math.floor(sortedRanking.reduce((sum, item) => sum + item.gasUsed, 0) / sortedRanking.length))
        : '-',
      icon: TrendingUp,
      gradient: 'from-block-warning to-orange-400',
    },
    {
      label: '最高交易费用',
      value: sortedRanking.length > 0 ? `${Math.max(...sortedRanking.map(i => parseFloat(i.fee))).toFixed(4)} ETH` : '-',
      icon: ArrowRight,
      gradient: 'from-block-accent to-block-info',
    },
    {
      label: '交易数',
      value: formatNumber(sortedRanking.length),
      icon: Hash,
      gradient: 'from-block-success to-emerald-400',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-block-text">Gas 消耗排行</h1>
          <p className="text-block-text-muted mt-1">查看最近消耗 Gas 最多的交易</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-block-text-muted">排序：</span>
          <div className="flex bg-block-card border border-block-border rounded-lg p-1">
            <button
              className={`px-3 py-1.5 text-sm rounded-md transition-all ${
                sortBy === 'gasUsed'
                  ? 'bg-block-accent text-block-bg font-medium'
                  : 'text-block-text-muted hover:text-block-text'
              }`}
              onClick={() => setSortBy('gasUsed')}
            >
              Gas 消耗量
            </button>
            <button
              className={`px-3 py-1.5 text-sm rounded-md transition-all ${
                sortBy === 'fee'
                  ? 'bg-block-accent text-block-bg font-medium'
                  : 'text-block-text-muted hover:text-block-text'
              }`}
              onClick={() => setSortBy('fee')}
            >
              交易费用
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryStats.map((stat, index) => (
          <div key={stat.label} className="stat-card" style={{ animationDelay: `${index * 50}ms` }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-block-text-muted mb-1">{stat.label}</p>
                <p className="text-2xl font-display font-bold text-block-text">
                  {stat.value}
                </p>
              </div>
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.gradient} flex items-center justify-center`}>
                <stat.icon className="w-5 h-5 text-block-bg" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-block-border flex items-center gap-2">
          <Zap className="w-5 h-5 text-block-accent" />
          <h2 className="font-display font-semibold text-block-text">
            Gas 消耗排行榜
          </h2>
        </div>

        {loading ? (
          <div className="p-8">
            <div className="animate-pulse space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-block-border/30 rounded-lg"></div>
              ))}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-block-border/50">
            {sortedRanking.map((item: GasRankingItem, index) => (
              <div
                key={item.hash}
                className="p-4 hover:bg-block-accent/5 transition-colors group animate-slide-in"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${getRankBadge(item.rank)}`}>
                    {item.rank}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="hash-text font-medium cursor-pointer"
                        title={item.hash}
                        onClick={() => handleCopy(item.hash, `hash-${item.hash}`)}
                      >
                        {formatHash(item.hash)}
                      </span>
                      {copied === `hash-${item.hash}` ? (
                        <Check className="w-3.5 h-3.5 text-block-success" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-block-text-muted" />
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-block-text-muted">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimeAgo(item.timestamp)}
                      </span>
                      <span>
                        从 <span className="font-mono">{formatHash(item.from)}</span>
                      </span>
                      <span>
                        到 <span className="font-mono">{formatHash(item.to)}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-medium text-block-text">{formatNumber(item.gasUsed)}</p>
                      <p className="text-xs text-block-text-muted">Gas 消耗</p>
                    </div>

                    <div className="w-48 hidden lg:block">
                      <div className="h-2 bg-block-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-block-accent to-block-info rounded-full transition-all duration-500"
                          style={{ width: `${(item.gasUsed / maxGasUsed) * 100}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-medium text-block-accent">{item.gasPrice}</p>
                      <p className="text-xs text-block-text-muted">Gas 价格</p>
                    </div>

                    <div className="text-right w-28">
                      <p className="text-sm font-bold text-block-warning">{item.fee} ETH</p>
                      <p className="text-xs text-block-text-muted">交易费用</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
