import { CalendarDays, CheckCircle2, ListTodo, Settings } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

import { ConflictStatus, SyncStatus } from '../sync/SyncStatus.js';
import { PwaUpdatePrompt } from './PwaUpdatePrompt.js';

const tabs = [
  { to: '/today', label: '今日', icon: CheckCircle2 },
  { to: '/tasks', label: '任务', icon: ListTodo },
  { to: '/calendar', label: '日历', icon: CalendarDays },
  { to: '/settings', label: '设置', icon: Settings },
] as const;

export function AppShell() {
  return (
    <div className="app-shell">
      <SyncStatus />
      <main className="app-content">
        <Outlet />
      </main>
      <nav className="tab-bar" aria-label="主导航">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            aria-label={label}
            className="tab-item"
          >
            {({ isActive }) => (
              <>
                <Icon aria-hidden="true" size={22} strokeWidth={isActive ? 2.4 : 1.8} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <ConflictStatus />
      <PwaUpdatePrompt />
    </div>
  );
}
