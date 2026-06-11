// ── Web Push Notifications ────────────────────────────────────────────────────
import { supabase } from './supabase.js';

const VAPID_PUBLIC_KEY = 'BNh-wa4Nr9IOMjrLzE7UF16KtbikcJP5tyyJZ44qFJoBslbtwtZJExev0u5dOms8VvgFC9cHS7NprpSR7lVMMb4';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function getPushPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function subscribePush(userId) {
  if (!isPushSupported()) throw new Error('Web Push não suportado neste browser.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permissão negada pelo usuário.');

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) await existing.unsubscribe();

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const { endpoint, keys } = subscription.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    { onConflict: 'user_id,endpoint' }
  );
  if (error) throw error;
  return subscription;
}

export async function unsubscribePush(userId) {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete()
      .eq('user_id', userId).eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}

export async function isSubscribed() {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return !!sub && Notification.permission === 'granted';
}

// Dispara push via Edge Function (server-side)
export async function sendPushToUser(targetUserId, payload) {
  const { error } = await supabase.functions.invoke('send-push', {
    body: { user_id: targetUserId, ...payload },
  });
  if (error) console.warn('Push invoke error:', error);
}
