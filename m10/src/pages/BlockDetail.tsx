import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Blocks, Hash, Clock, User, Cpu, HardDrive, Fuel, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useBlockStore } from '@/store/useBlockStore';
import { formatHash, formatTimestamp, formatNumber, copyToClipboard } from '@/utils/format';

export default function BlockDetail() {
  const { height } = useParams<{ height: string }>();
  const navigate = useNavigate();
  const { blockDetail, loading, fetchBlockDetail } = useBlockStore();
  const [copied, setCopied] = useState<string | null>(null);
  const [showAllTransactions, setShowAllTransactions] = useState(false);

  useEffect(() => {
    if (height) {
      fetchBlockDetail(parseInt(height));
    }
  }, [height, fetchBlockDetail]);

  const handleCopy = async (text: string, id: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const displayedTransactions = showAllTransactions
    ? blockDetail?.transactionList
    : blockDetail?.transactionList.slice(0, 10);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-block-border/30 rounded"></div>
          <div className="h-32 bg-block-border/30 rounded-xl"></div>
          <div className="h-64 bg-block-border/30 rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (!blockDetail) {
    return (
      <div className="text-center py-12">
        <p className="text-block-text-muted">区块不存在</p>
        <button className="btn-primary mt-4" onClick={() => navigate('/')}>
          返回首页
        </button>
      </div>
    );
  }

  const blockInfo = [
    { label: '区块高度', value: `#${formatNumber(blockDetail.height)}`, icon: Blocks, highlight: true },
    { label: '区块哈希', value: blockDetail.hash, icon: Hash, copyable: true },
    { label: '时间戳', value: formatTimestamp(blockDetail.timestamp), icon: Clock },
    { label: '矿工地址', value: blockDetail.miner, icon: User, copyable: true },
    { label: '难度', value: blockDetail.difficulty, icon: Cpu },
    { label: '大小', value: `${blockDetail.size} KB`, icon: HardDrive },
    { label: 'Gas 消耗', value: blockDetail.gasUsed, icon: Fuel },
    { label: 'Gas 上限', value: blockDetail.gasLimit, icon: Fuel },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <button
        className="flex items-center gap-2 text-block-text-muted hover:text-block-accent transition-colors"
        onClick={() => navigate('/')}
      >
        <ArrowLeft className="w-4 h-4" />
        <span>返回区块列表</span>
      </button>

      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-gradient-to-br from-block-accent to-block-info rounded-xl flex items-center justify-center">
            <Blocks className="w-6 h-6 text-block-bg" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-block-text">
              区块 #{formatNumber(blockDetail.height)}
            </h1>
            <p className="text-sm text-block-text-muted">
              包含 {blockDetail.transactions} 笔交易
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {blockInfo.map((info, index) => (
            <div
              key={info.label}
              className={`flex items-start gap-3 p-4 rounded-lg ${
                info.highlight ? 'bg-block-accent/10 border border-block-accent/30' : 'bg-block-bg/30'
              }`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                info.highlight ? 'bg-block-accent text-block-bg' : 'bg-block-border text-block-text-muted'
              }`}>
                <info.icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-block-text-muted mb-1">{info.label}</p>
                <div className="flex items-center gap-2 group">
                  <p className={`font-mono text-sm truncate ${
                    info.highlight ? 'text-block-accent font-semibold' : 'text-block-text'
                  }`} title={info.value}>
                    {info.value}
                  </p>
                  {info.copyable && (
                    <button
                      onClick={() => handleCopy(info.value, info.label)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {copied === info.label ? (
                        <Check className="w-3.5 h-3.5 text-block-success" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-block-text-muted hover:text-block-accent" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-block-border flex items-center justify-between">
          <h2 className="font-display font-semibold text-block-text flex items-center gap-2">
            <Hash className="w-5 h-5 text-block-accent" />
            交易列表
          </h2>
          <span className="text-xs text-block-text-muted">
            共 {blockDetail.transactionList.length} 笔交易
          </span>
        </div>

        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="data-table">
            <thead className="sticky top-0 bg-block-card">
              <tr>
                <th>交易哈希</th>
                <th>发送方</th>
                <th>接收方</th>
                <th>金额 (ETH)</th>
                <th>Gas 价格</th>
                <th>Gas 消耗</th>
              </tr>
            </thead>
            <tbody>
              {displayedTransactions?.map((tx, index) => (
                <tr key={tx.hash} className="group animate-slide-in" style={{ animationDelay: `${index * 20}ms` }}>
                  <td className="group">
                    <div className="flex items-center gap-2">
                      <span
                        className="hash-text cursor-pointer"
                        title={tx.hash}
                        onClick={() => handleCopy(tx.hash, `tx-${tx.hash}`)}
                      >
                        {formatHash(tx.hash)}
                      </span>
                      {copied === `tx-${tx.hash}` ? (
                        <Check className="w-3 h-3 text-block-success" />
                      ) : (
                        <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 text-block-text-muted" />
                      )}
                    </div>
                  </td>
                  <td className="group">
                    <div className="flex items-center gap-2">
                      <span
                        className="hash-text cursor-pointer"
                        title={tx.from}
                        onClick={() => handleCopy(tx.from, `from-${tx.hash}`)}
                      >
                        {formatHash(tx.from)}
                      </span>
                      {copied === `from-${tx.hash}` && (
                        <Check className="w-3 h-3 text-block-success" />
                      )}
                    </div>
                  </td>
                  <td className="group">
                    <div className="flex items-center gap-2">
                      <span
                        className="hash-text cursor-pointer"
                        title={tx.to}
                        onClick={() => handleCopy(tx.to, `to-${tx.hash}`)}
                      >
                        {formatHash(tx.to)}
                      </span>
                      {copied === `to-${tx.hash}` && (
                        <Check className="w-3 h-3 text-block-success" />
                      )}
                    </div>
                  </td>
                  <td className="text-block-accent font-medium">{tx.value}</td>
                  <td className="text-block-text">{tx.gasPrice}</td>
                  <td className="text-block-text">{formatNumber(tx.gasUsed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {blockDetail.transactionList.length > 10 && (
          <div className="p-4 border-t border-block-border">
            <button
              className="w-full btn-secondary flex items-center justify-center gap-2"
              onClick={() => setShowAllTransactions(!showAllTransactions)}
            >
              {showAllTransactions ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  收起交易列表
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  查看全部 {blockDetail.transactionList.length} 笔交易
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
