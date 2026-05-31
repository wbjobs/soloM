import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Blocks, ArrowUpRight, Activity, DollarSign, Gauge, Clock, Copy, Check, ChevronRight } from 'lucide-react';
import { useBlockStore } from '@/store/useBlockStore';
import { formatHash, formatTimeAgo, formatNumber, copyToClipboard } from '@/utils/format';
import { useState } from 'react';

export default function Home() {
  const navigate = useNavigate();
  const { blocks, latestHeight, loading, fetchBlocks } = useBlockStore();
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  useEffect(() => {
    fetchBlocks(10);
    const interval = setInterval(() => fetchBlocks(10), 30000);
    return () => clearInterval(interval);
  }, [fetchBlocks]);

  const handleCopy = async (text: string, id: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedHash(id);
      setTimeout(() => setCopiedHash(null), 2000);
    }
  };

  const stats = [
    {
      label: '最新区块高度',
      value: `#${formatNumber(latestHeight)}`,
      icon: Blocks,
      gradient: 'from-block-accent to-block-info',
      change: '+1',
    },
    {
      label: '24h 交易量',
      value: '1,234,567',
      icon: Activity,
      gradient: 'from-block-success to-emerald-400',
      change: '+12.5%',
    },
    {
      label: '平均 Gas 价格',
      value: '23.5 Gwei',
      icon: Gauge,
      gradient: 'from-block-warning to-orange-400',
      change: '-3.2%',
    },
    {
      label: '总交易费用',
      value: '1,234.56 ETH',
      icon: DollarSign,
      gradient: 'from-block-danger to-rose-400',
      change: '+8.7%',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-block-text">区块浏览器</h1>
          <p className="text-block-text-muted mt-1">实时监控以太坊链上数据</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-block-text-muted">
          <Clock className="w-4 h-4" />
          <span>每 30 秒自动刷新</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className="stat-card"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-block-text-muted mb-1">{stat.label}</p>
                <p className="text-2xl font-display font-bold text-block-text animate-count">
                  {stat.value}
                </p>
                <p className={`text-xs mt-1 ${
                  stat.change.startsWith('+') ? 'text-block-success' : 'text-block-danger'
                }`}>
                  {stat.change}
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
        <div className="p-4 border-b border-block-border flex items-center justify-between">
          <h2 className="font-display font-semibold text-block-text flex items-center gap-2">
            <Blocks className="w-5 h-5 text-block-accent" />
            最新区块
          </h2>
          <span className="text-xs text-block-text-muted">显示最近 10 个区块</span>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-pulse space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-block-border/30 rounded-lg"></div>
              ))}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>区块高度</th>
                  <th>区块哈希</th>
                  <th>时间</th>
                  <th>交易数</th>
                  <th>Gas 消耗</th>
                  <th>矿工</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((block, index) => (
                  <tr
                    key={block.height}
                    className="cursor-pointer group animate-slide-in"
                    style={{ animationDelay: `${index * 30}ms` }}
                    onClick={() => navigate(`/block/${block.height}`)}
                  >
                    <td className="font-mono text-block-accent font-medium">
                      #{formatNumber(block.height)}
                    </td>
                    <td className="group">
                      <div className="flex items-center gap-2">
                        <span
                          className="hash-text"
                          title={block.hash}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(block.hash, block.hash);
                          }}
                        >
                          {formatHash(block.hash)}
                        </span>
                        {copiedHash === block.hash ? (
                          <Check className="w-3 h-3 text-block-success" />
                        ) : (
                          <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 text-block-text-muted" />
                        )}
                      </div>
                    </td>
                    <td className="text-block-text-muted">
                      {formatTimeAgo(block.timestamp)}
                    </td>
                    <td className="text-block-text">{block.transactions}</td>
                    <td className="text-block-text">{block.gasUsed}</td>
                    <td className="hash-text" title={block.miner}>
                      {formatHash(block.miner)}
                    </td>
                    <td className="text-right">
                      <ChevronRight className="w-4 h-4 text-block-text-muted opacity-0 group-hover:opacity-100 group-hover:text-block-accent transition-all" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="glass-card p-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-block-accent to-block-info rounded-xl flex items-center justify-center">
            <ArrowUpRight className="w-6 h-6 text-block-bg" />
          </div>
          <div className="flex-1">
            <h3 className="font-display font-semibold text-block-text">探索更多功能</h3>
            <p className="text-sm text-block-text-muted mt-0.5">
              查看 Gas 消耗排行榜，或使用合约沙箱进行 Solidity 静态分析
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="btn-secondary"
              onClick={() => navigate('/gas-ranking')}
            >
              Gas 排行
            </button>
            <button
              className="btn-primary"
              onClick={() => navigate('/sandbox')}
            >
              合约分析
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
