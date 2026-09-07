import { Outlet } from 'react-router-dom';
import { HeaderBar } from '../components/HeaderBar';

export function AppShell() {
  return (
    <div className="flex h-screen flex-col" style={{ background: 'var(--bg)' }}>
      <HeaderBar />
      <main className="relative min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}