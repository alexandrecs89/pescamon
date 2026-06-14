import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, MessageCircle, Bell, BellOff } from 'lucide-react';
import { supabase, getDeviceId } from './supabase.js';
import { usePushNotifications } from './usePushNotifications.js';

const CHAT_TABLE = 'river_chat';

export default function RiverChat({ segmentName, authSession }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const deviceId = getDeviceId();
  const userName = authSession?.user?.email?.split('@')[0] || `Pescador ${deviceId.slice(-4)}`;
  const { permission, requestPermission, notify } = usePushNotifications();
  const isFirstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;
    isFirstLoad.current = true;

    supabase
      .from(CHAT_TABLE)
      .select('*')
      .eq('segment', segmentName)
      .order('created_at', { ascending: true })
      .limit(50)
      .then(({ data }) => {
        if (!cancelled && data) setMessages(data);
        isFirstLoad.current = false;
      });

    const channel = supabase
      .channel(`chat-${segmentName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: CHAT_TABLE, filter: `segment=eq.${segmentName}` }, (payload) => {
        if (!payload.new) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === payload.new.id)) return prev;
          const isFromMe = payload.new.device_id === deviceId;
          if (!isFromMe && !isFirstLoad.current && document.visibilityState !== 'visible') {
            notify({
              title: `💬 ${payload.new.user_name || 'Pescador'} no chat`,
              body: payload.new.message,
              tag: `chat-${segmentName}`,
            });
          }
          return [...prev, payload.new];
        });
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [segmentName]);

  useEffect(() => {
    if (!bottomRef.current) return;
    const rect = bottomRef.current.closest('.chat-card')?.getBoundingClientRect();
    if (rect && rect.top < window.innerHeight && rect.bottom > 0) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    setLoading(true);
    setInput('');

    const msg = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      segment: segmentName,
      device_id: deviceId,
      user_name: userName,
      message: text,
      created_at: new Date().toISOString()
    };

    const optimistic = [...messages, msg];
    setMessages(optimistic);

    await supabase.from(CHAT_TABLE).insert(msg);
    setLoading(false);
  }, [input, segmentName, deviceId, userName, messages]);

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function timeAgo(iso) {
    const diff = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (diff < 1) return 'agora';
    if (diff < 60) return `${diff}min`;
    if (diff < 1440) return `${Math.round(diff / 60)}h`;
    return `${Math.round(diff / 1440)}d`;
  }

  return (
    <div className="river-chat">
      <div className="chat-header">
        <MessageCircle size={13} />
        <span>{segmentName}</span>
        <small>{messages.length} msg</small>
        {permission === 'unsupported' ? null : (
          <button
            type="button"
            className={`chat-bell-btn${permission === 'granted' ? ' active' : ''}`}
            onClick={requestPermission}
            title={permission === 'granted' ? 'Notificações ativas' : 'Ativar notificações'}
          >
            {permission === 'granted' ? <Bell size={12} /> : <BellOff size={12} />}
          </button>
        )}
      </div>

      <div className="chat-messages">
        {messages.length === 0 && <p className="chat-empty">Sem mensagens neste trecho. Seja o primeiro!</p>}
        {messages.map((m) => {
          const isMe = m.device_id === deviceId;
          return (
            <div key={m.id} className={`chat-msg${isMe ? ' me' : ''}`}>
              <div className="chat-msg-header">
                <span className="chat-author">{isMe ? 'Você' : m.user_name}</span>
                <span className="chat-time">{timeAgo(m.created_at)}</span>
              </div>
              <p>{m.message}</p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Mensagem..."
          maxLength={280}
          disabled={loading}
        />
        <button onClick={sendMessage} disabled={!input.trim() || loading} type="button">
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
