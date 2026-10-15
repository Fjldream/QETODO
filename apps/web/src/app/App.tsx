import type { SessionDto } from '@qetodo/contracts';
import { useEffect, useState } from 'react';

import { apiClient, type HttpClient } from '../api/http.js';
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
    void client
      .request<SessionDto>('/api/auth/session')
      .then((current) => {
        if (!active) return;
        client.setCsrfToken(current.csrfToken);
        setSession(current);
      })
      .catch(() => {
        if (!active) return;
        client.clearCsrfToken();
        setSession(null);
      });
    return () => {
      active = false;
    };
  }, [client]);

  if (session === undefined) {
    return <div className="launch-state" role="status" aria-label="正在载入" />;
  }

  const authenticate = (nextSession: SessionDto) => {
    client.setCsrfToken(nextSession.csrfToken);
    setSession(nextSession);
  };
  const expireSession = () => {
    client.clearCsrfToken();
    setSession(null);
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
