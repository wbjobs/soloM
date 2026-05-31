import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Blocks, Zap, Code2, ChevronLeft, ChevronRight, Copy, Check } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { path: '/', icon: LayoutDashboard, label: '仪表盘' },
  { path: '/gas-ranking', icon: Zap, label: 'Gas 排行' },
  { path: '/sandbox', icon: Code2, label: '合约沙箱' },
];

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  return (
    <div className="flex min-h-screen">
      <aside
        className={`fixed left-0 top-0 h-full bg-block-card/80 backdrop-blur-xl border-r border-block-border transition-all duration-300 z-50 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-block-border">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-block-accent to-block-info rounded-lg flex items-center justify-center">
                <Blocks className="w-5 h-5 text-block-bg" />
              </div>
              <span className="font-display font-bold text-lg text-block-text">BlockScan</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 hover:bg-block-border/50 rounded-lg transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="w-5 h-5 text-block-text-muted" />
            ) : (
              <ChevronLeft className="w-5 h-5 text-block-text-muted" />
            )}
          </button>
        </div>

        <nav className="p-2 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-block-accent text-block-bg font-medium'
                    : 'text-block-text-muted hover:bg-block-border/30 hover:text-block-text'
                }`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="text-sm">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-block-border">
            <div className="text-xs text-block-text-muted">
              <p className="font-medium text-block-text mb-1">区块同步状态</p>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 bg-block-success rounded-full animate-pulse"></span>
                <span>已同步</span>
              </div>
              <p className="font-mono flex items-center gap-1">
                <span>最新高度:</span>
                <span className="text-block-accent cursor-pointer hover:underline" onClick={() => handleCopyHash('19876543')}>
                  #19,876,543
                </span>
                {copiedHash === '19876543' ? (
                  <Check className="w-3 h-3 text-block-success" />
                ) : (
                  <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                )}
              </p>
            </div>
          </div>
        )}
      </aside>

      <main
        className={`flex-1 transition-all duration-300 ${
          collapsed ? 'ml-16' : 'ml-60'
        }`}
      >
        <div className="p-6 min-h-screen">{children}</div>
      </main>
    </div>
  );
}
