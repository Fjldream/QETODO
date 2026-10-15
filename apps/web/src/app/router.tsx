import type { SessionDto } from '@qetodo/contracts';
import { Navigate, Route, Routes } from 'react-router-dom';

import type { HttpClient } from '../api/http.js';
import { LoginPage } from '../features/auth/LoginPage.js';
import { CalendarPage } from '../features/tasks/CalendarPage.js';
import { TasksPage } from '../features/tasks/TasksPage.js';
import { TodayPage } from '../features/tasks/TodayPage.js';
import { SettingsPage } from '../features/settings/SettingsPage.js';
import type { LocalTaskStore } from './App.js';
import { AppShell } from './AppShell.js';

interface AppRouterProps {
  client: HttpClient;
  localTaskStore?: LocalTaskStore | undefined;
  session: SessionDto | null;
  onAuthenticated(session: SessionDto): void;
  onSessionExpired(): void;
}

export function AppRouter(props: AppRouterProps) {
  if (!props.session) {
    return (
      <Routes>
        <Route
          path="/login"
          element={<LoginPage client={props.client} onAuthenticated={props.onAuthenticated} />}
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/today" element={<TodayPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route
          path="/settings"
          element={
            <SettingsPage
              client={props.client}
              localTaskStore={props.localTaskStore}
              session={props.session}
              onLoggedOut={props.onSessionExpired}
              onSessionExpired={props.onSessionExpired}
            />
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/today" replace />} />
    </Routes>
  );
}
