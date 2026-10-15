import { Bell, BellOff } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { HttpClient } from '../../api/http.js';

interface NotificationRuntime {
  supported: boolean;
  standalone: boolean;
  permission: NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  subscribe(applicationServerKey: Uint8Array): Promise<{ toJSON(): unknown }>;
}

interface NotificationSettingsProps {
  client: HttpClient;
  runtime?: NotificationRuntime;
}

export function NotificationSettings({ client, runtime = browserNotificationRuntime() }: NotificationSettingsProps) {
  const [vapidKey, setVapidKey] = useState('');
  const [digestTime, setDigestTime] = useState('09:00');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    void client.request<{ vapidPublicKey: string; digestTime: string }>('/api/notifications/config')
      .then((config) => {
        if (!active || !config) return;
        setVapidKey(config.vapidPublicKey);
        setDigestTime(config.digestTime);
      })
      .catch(() => { if (active) setMessage('通知配置暂不可用，任务仍会保存在应用内'); });
    return () => { active = false; };
  }, [client]);

  const enable = async () => {
    const permission = await runtime.requestPermission();
    if (permission !== 'granted') { setMessage('通知未开启，逾期任务仍会在应用内显示'); return; }
    const subscription = await runtime.subscribe(urlBase64ToUint8Array(vapidKey));
    await client.request('/api/notifications/subscriptions', { method: 'PUT', body: subscription.toJSON() });
    setMessage('通知已开启');
  };
  const saveDigest = async () => {
    await client.request('/api/notifications/preferences', { method: 'PUT', body: { digestTime, defaultAdvanceMinutes: 0 } });
    setMessage('提醒时间已保存');
  };

  let explanation = '';
  if (!runtime.supported) explanation = '此浏览器不支持推送通知';
  else if (!runtime.standalone) explanation = '请先将应用添加到 iPhone 主屏幕，再开启通知';
  else if (runtime.permission === 'denied') explanation = '通知已被系统拒绝，请到 iPhone 设置中开启';

  return (
    <section aria-labelledby="notification-title">
      <h2 className="section-heading" id="notification-title">通知提醒</h2>
      <div className="settings-group notification-settings">
        {explanation ? <p><BellOff size={19} />{explanation}</p> : (
          <button className="settings-action" type="button" onClick={() => void enable()}><Bell size={19} />开启通知</button>
        )}
        <label className="settings-field" htmlFor="digest-time"><span>每日逾期汇总</span><input id="digest-time" type="time" value={digestTime} onChange={(event) => setDigestTime(event.target.value)} /></label>
        <button className="settings-action" type="button" onClick={() => void saveDigest()}>保存提醒时间</button>
      </div>
      {message ? <p className="form-success" role="status">{message}</p> : null}
    </section>
  );
}

function browserNotificationRuntime(): NotificationRuntime {
  const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  return {
    supported,
    standalone: (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
      || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)),
    permission: supported ? Notification.permission : 'default',
    requestPermission: () => Notification.requestPermission(),
    subscribe: async (applicationServerKey) => {
      const registration = await navigator.serviceWorker.ready;
      return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey as BufferSource });
    },
  };
}

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
