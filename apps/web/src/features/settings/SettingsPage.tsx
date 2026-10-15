import type { SessionDto } from '@qetodo/contracts';

import type { HttpClient } from '../../api/http.js';
import type { LocalTaskStore } from '../../app/App.js';
import { AccountSettings } from './AccountSettings.js';
import { NotificationSettings } from './NotificationSettings.js';

interface SettingsPageProps {
  client: HttpClient;
  localTaskStore?: LocalTaskStore | undefined;
  session: SessionDto;
  onLoggedOut(): void;
  onSessionExpired(): void;
}

export function SettingsPage(props: SettingsPageProps) {
  return (
    <section className="page">
      <header className="large-title-header">
        <p className="eyebrow">{props.session.username}</p>
        <h1>设置</h1>
      </header>
      <AccountSettings
        client={props.client}
        localTaskStore={props.localTaskStore}
        onLoggedOut={props.onLoggedOut}
        onSessionExpired={props.onSessionExpired}
      />
      <NotificationSettings client={props.client} />
    </section>
  );
}
