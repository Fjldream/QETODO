import webPush from 'web-push';

import type { PushSubscriptionRecord } from './push.repository.js';
import type { PushPayload, SchedulerPushSender } from './scheduler.js';

export class PushSender implements SchedulerPushSender {
  constructor(subject: string, publicKey: string, privateKey: string) {
    webPush.setVapidDetails(subject, publicKey, privateKey);
  }

  async send(subscription: PushSubscriptionRecord, payload: PushPayload): Promise<{ status: 'sent' | 'gone' }> {
    try {
      await webPush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify(payload), { TTL: 60 * 60 });
      return { status: 'sent' };
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) return { status: 'gone' };
      throw error;
    }
  }
}
