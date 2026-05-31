import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import Editor from "@/pages/Editor";
import Room from "@/pages/Room";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/editor/:docId" element={<Editor />} />
        <Route path="/room" element={<Room />} />
      </Routes>
    </Router>
  );
}
