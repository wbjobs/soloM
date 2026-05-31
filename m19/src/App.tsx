import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Upload from "@/pages/Upload";
import Library from "@/pages/Library";
import Leaderboard from "@/pages/Leaderboard";

export default function App() {
  return (
    <Router>
      <div className="min-h-screen" style={{ backgroundColor: '#0f0f23' }}>
        <Navbar />
        <Routes>
          <Route path="/" element={<Upload />} />
          <Route path="/library" element={<Library />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
        </Routes>
      </div>
    </Router>
  );
}
