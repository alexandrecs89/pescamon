import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';

const SW_URL = '/sw.js';
const VAPID_PUBLIC_KEY = 'BNh-wa4Nr9IOMjrLzE7UF16KtbikcJP5tyyJZ44qFJoBslbtwtZJExev0u5dOms8VvgFC9cHS7NprpSR7lVMMb4';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

function getPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export function usePushNotifications(userId = null) {
  const [permission, setPermission] = useState(getPermission);
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(SW_URL).catch(() => {});
  }, []);

  // Verifica se já está subscrito
  useEffect(() => {
    if (!userId || !('PushManager' in window)) return;
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription().then(sub => {
        setSubscribed(!!sub && Notification.permission === 'granted');
      })
    ).catch(() => {});
  }, [userId]);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return 'unsupported';
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  // Subscribe: pede permissão + registra no Supabase
  const subscribe = useCallback(async () => {
    if (!userId) return;
    if (!('PushManager' in window)) return;
    setSubscribing(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const { endpoint, keys } = sub.toJSON();
      await supabase.from('push_subscriptions').upsert(
        { user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
        { onConflict: 'user_id,endpoint' }
      );
      setSubscribed(true);
    } catch (e) {
      console.warn('Push subscribe error:', e);
    } finally {
      setSubscribing(false);
    }
  }, [userId]);

  // Unsubscribe: remove do Supabase e do browser
  const unsubscribe = useCallback(async () => {
    if (!userId) return;
    setSubscribing(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from('push_subscriptions').delete()
          .eq('user_id', userId).eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      console.warn('Push unsubscribe error:', e);
    } finally {
      setSubscribing(false);
    }
  }, [userId]);

  const notify = useCallback(async ({ title, body, tag = 'pescamon', url = '/' }) => {
    if (getPermission() !== 'granted') return;
    const reg = await getRegistration();
    if (reg) {
      reg.active?.postMessage({ type: 'SHOW_NOTIFICATION', title, body, tag, url });
    } else if ('Notification' in window) {
      new Notification(title, { body, icon: '/logo.png' });
    }
  }, []);

  return { permission, subscribed, subscribing, requestPermission, subscribe, unsubscribe, notify };
}
