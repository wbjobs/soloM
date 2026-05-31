import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Upload, FileText, BarChart3, Shield, Lock } from 'lucide-react';
import UploadPage from './pages/UploadPage.tsx';
import FilesPage from './pages/FilesPage.tsx';
import FileDetailPage from './pages/FileDetailPage.tsx';
import AdminPage from './pages/AdminPage.tsx';
import SharePage from './pages/SharePage.tsx';
import './App.css';

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isSharePage = location.pathname.startsWith('/share/');

  if (isSharePage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="flex">
        <aside className="w-64 min-h-screen bg-slate-900/50 border-r border-slate-700/50 backdrop-blur-xl p-6">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">SecureVault</h1>
              <p className="text-slate-400 text-xs">端到端加密存储</p>
            </div>
          </div>

          <nav className="space-y-2">
            <Link
              to="/"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-slate-800/50 hover:text-white transition-all group"
            >
              <Upload className="w-5 h-5 group-hover:text-teal-400 transition-colors" />
              <span>上传文件</span>
            </Link>
            <Link
              to="/files"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-slate-800/50 hover:text-white transition-all group"
            >
              <FileText className="w-5 h-5 group-hover:text-teal-400 transition-colors" />
              <span>我的文件</span>
            </Link>
            <Link
              to="/admin"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-slate-800/50 hover:text-white transition-all group"
            >
              <BarChart3 className="w-5 h-5 group-hover:text-teal-400 transition-colors" />
              <span>存储监控</span>
            </Link>
          </nav>

          <div className="absolute bottom-6 left-6 right-6">
            <div className="p-4 bg-gradient-to-br from-teal-900/30 to-cyan-900/30 rounded-xl border border-teal-700/30">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-4 h-4 text-teal-400" />
                <span className="text-teal-300 text-sm font-medium">安全状态</span>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed">
                所有文件均在浏览器端使用 AES-GCM 256位 加密后上传，服务端无法解密
              </p>
            </div>
          </div>
        </aside>

        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/files/:id" element={<FileDetailPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/share/:id" element={<SharePage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
