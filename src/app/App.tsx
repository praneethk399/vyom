import { useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppEffects } from './AppEffects';
import { AppShell } from './AppShell';
import { AlertOverlays, ToastStack } from '../features/alerts/AlertOverlays';
import { getSession } from '../lib/session';
import { Access } from '../pages/Access';
import { CommandOverview } from '../pages/CommandOverview';
import { SensorTwin } from '../pages/SensorTwin';
import { AiDiagnostics } from '../pages/AiDiagnostics';
import { Maintenance } from '../pages/Maintenance';

function RequireAuth({ children }: { children: ReactNode }) {
  const [session] = useState(() => getSession());
  if (!session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <AppEffects />
      <AlertOverlays />
      <ToastStack />
      <div id="app-root" className="min-h-screen">
        <Routes>
          <Route path="/" element={<Access />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route path="/command" element={<CommandOverview />} />
            <Route path="/sensor" element={<SensorTwin />} />
            <Route path="/diagnostics" element={<AiDiagnostics />} />
            <Route path="/maintenance" element={<Maintenance />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  );
}