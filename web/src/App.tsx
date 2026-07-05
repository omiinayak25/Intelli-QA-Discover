import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import History from "./pages/History";
import Progress from "./pages/Progress";
import Report from "./pages/Report";
import Projects from "./pages/Projects";
import Project from "./pages/Project";
import Knowledge from "./pages/Knowledge";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/knowledge" element={<Knowledge />} />
      <Route path="/projects" element={<Projects />} />
      <Route path="/projects/:pid" element={<Project />} />
      <Route path="/discoveries" element={<History />} />
      <Route path="/discover/:id" element={<Progress />} />
      <Route path="/discoveries/:id" element={<Report />} />
      <Route path="/discoveries/:id/:view" element={<Report />} />
      <Route path="/discoveries/:id/:view/:sub" element={<Report />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
