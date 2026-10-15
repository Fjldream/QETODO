import type { SessionDto } from '@qetodo/contracts';
import { useEffect, useState } from 'react';

import { apiClient, type HttpClient } from '../api/http.js';
import { localDb } from '../db/localDb.js';
import '../styles/tokens.css';
import '../styles/base.css';
import { AppRouter } from './router.js';

export interface LocalTaskStore {
  clear(): void;
}

interface AppProps {
  client?: HttpClient;
  localTaskStore?: LocalTaskStore;
}

export function App({ client = apiClient, localTaskStore }: AppProps) {
  const [session, setSession] = useState<SessionDto | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const refresh = () => client.request<SessionDto>('/api/auth/session')
      .then((current) => {
        if (!active) return;
        client.setCsrfToken(current.csrfToken);
        setSession(current);
        void localDb.metadata.put({ key: 'last-session', value: {
          userId: current.userId,
          username: current.username,
          expiresAt: current.expiresAt,
        } });
      })
      .catch(async () => {
        if (!active) return;
        if (!navigator.onLine) {
          const cached = await localDb.metadata.get('last-session');
          const value = cached?.value as Omit<SessionDto, 'csrfToken'> | undefined;
          if (active && value && new Date(value.expiresAt).getTime() > Date.now()) {
            setSession({ ...value, csrfToken: '' });
            return;
          }
        }
        client.clearCsrfToken();
        setSession(null);
      });
    void refresh();
    const reconnect = () => { void refresh(); };
    window.addEventListener('online', reconnect);
    return () => {
      active = false;
      window.removeEventListener('online', reconnect);
    };
  }, [client]);

  if (session === undefined) {
    return <div className="launch-state" role="status" aria-label="正在载入" />;
  }

  const authenticate = (nextSession: SessionDto) => {
    client.setCsrfToken(nextSession.csrfToken);
    setSession(nextSession);
    void localDb.metadata.put({ key: 'last-session', value: {
      userId: nextSession.userId,
      username: nextSession.username,
      expiresAt: nextSession.expiresAt,
    } });
  };
  const expireSession = () => {
    client.clearCsrfToken();
    setSession(null);
    void localDb.metadata.delete('last-session');
  };

  return (
    <AppRouter
      client={client}
      localTaskStore={localTaskStore}
      session={session}
      onAuthenticated={authenticate}
      onSessionExpired={expireSession}
    />
  );
}
