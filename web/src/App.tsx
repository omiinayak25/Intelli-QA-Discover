import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import History from "./pages/History";
import Progress from "./pages/Progress";
import Report from "./pages/Report";
import Projects from "./pages/Projects";
import Project from "./pages/Project";
import Knowledge from "./pages/Knowledge";
import SettingsPage from "./pages/Settings";
import SimpleHome from "./experimental/SimpleHome";
import GuidedReport from "./experimental/GuidedReport";
import { useFlags } from "./experimental/flags";

/**
 * Root gate: when the (opt-in, default-off) experimentalUX flag is on, the home
 * is the simplified Simple Home; otherwise the classic Landing. Every classic
 * route stays registered and reachable — the experiment never replaces them.
 */
function Root() {
  const flags = useFlags();
  return flags.experimentalUX ? <SimpleHome /> : <Landing />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Root />} />
      {/* experimental UX layer (isolated, flag-gated) */}
      <Route path="/x" element={<SimpleHome />} />
      <Route path="/x/discoveries/:id" element={<GuidedReport />} />
      {/* classic app — unchanged */}
      <Route path="/knowledge" element={<Knowledge />} />
      <Route path="/settings" element={<SettingsPage />} />
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
