import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "@/lib/authStore";
import Dashboard from "@/pages/Dashboard";
import Dashboards from "@/pages/Dashboards";
import Login from "@/pages/Login";
import Masters from "@/pages/Masters";
import Me from "@/pages/Me";
import Reports from "@/pages/Reports";
import Scheduler from "@/pages/Scheduler";

function RequireAuth({ children }: { children: JSX.Element }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/masters"
        element={
          <RequireAuth>
            <Masters />
          </RequireAuth>
        }
      />
      <Route
        path="/schedule"
        element={
          <RequireAuth>
            <Scheduler />
          </RequireAuth>
        }
      />
      <Route
        path="/dashboards"
        element={
          <RequireAuth>
            <Dashboards />
          </RequireAuth>
        }
      />
      <Route
        path="/reports"
        element={
          <RequireAuth>
            <Reports />
          </RequireAuth>
        }
      />
      <Route
        path="/me"
        element={
          <RequireAuth>
            <Me />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
