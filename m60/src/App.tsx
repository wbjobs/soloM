import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import Editor from "@/pages/Editor";
import Play from "@/pages/Play";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/editor/:mapId" element={<Editor />} />
        <Route path="/play/:mapId" element={<Play />} />
      </Routes>
    </Router>
  );
}
