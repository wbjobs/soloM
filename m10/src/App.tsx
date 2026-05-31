import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import BlockDetail from '@/pages/BlockDetail';
import GasRanking from '@/pages/GasRanking';
import Sandbox from '@/pages/Sandbox';

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/block/:height" element={<BlockDetail />} />
          <Route path="/gas-ranking" element={<GasRanking />} />
          <Route path="/sandbox" element={<Sandbox />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Layout>
    </Router>
  );
}
