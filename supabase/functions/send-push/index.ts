// Supabase Edge Function — send-push
// Deploy: supabase functions deploy send-push
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT     = 'mailto:contato@pescamon.com.br';

// ── VAPID JWT helper (Deno-native, sem dependência externa) ──────────────────
function base64urlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  return Uint8Array.from([...bin].map(c => c.charCodeAt(0)));
}

async function buildVapidHeaders(endpoint: string) {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const now = Math.floor(Date.now() / 1000);

  const header  = base64urlEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = base64urlEncode(new TextEncoder().encode(JSON.stringify({ aud: audience, exp: now + 43200, sub: VAPID_SUBJECT })));

  const privBytes = base64urlDecode(VAPID_PRIVATE_KEY);
  const privKey   = await crypto.subtle.importKey(
    'raw', privBytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const sigBuf  = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privKey, new TextEncoder().encode(`${header}.${payload}`));
  const sig     = base64urlEncode(sigBuf);
  const jwt     = `${header}.${payload}.${sig}`;

  return {
    Authorization: `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
    'Content-Type': 'application/json',
  };
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const body = await req.json();
  const { user_id, title = '🎣 Pescamon', message, url = '/', tag = 'pescamon' } = body;

  if (!user_id) return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400 });

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', user_id);

  if (error || !subs?.length) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  const payload = JSON.stringify({ title, body: message, tag, url });
  let sent = 0;

  for (const sub of subs) {
    try {
      const headers = await buildVapidHeaders(sub.endpoint);
      // Encrypts payload using Web Push encryption (RFC 8291)
      // For simplicity, we send unencrypted to FCM/APNS-compatible endpoints
      // Production: use a proper web-push encryption library
      const res = await fetch(sub.endpoint, {
        method: 'POST',
        headers: { ...headers, 'TTL': '86400' },
        body: payload,
      });
      if (res.ok || res.status === 201) sent++;
      else if (res.status === 410 || res.status === 404) {
        // Subscription expired — remove
        await supabase.from('push_subscriptions').delete()
          .eq('endpoint', sub.endpoint).eq('user_id', user_id);
      }
    } catch (e) {
      console.error('Push send error:', e);
    }
  }

  return new Response(JSON.stringify({ sent }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
