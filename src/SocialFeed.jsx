import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase.js';
import {
  Heart, MessageCircle, Share2, Plus, X, ChevronLeft,
  Users, Globe, Lock, Camera, MapPin, Fish, Trophy,
  UserPlus, UserCheck, Send, MoreHorizontal, Search,
  Image, Loader, Bell, AtSign
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts)) / 1000;
  if (diff < 60)   return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function Avatar({ url, name, size = 40 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return url
    ? <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    : <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #0d47a0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{initials}</div>;
}

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function fetchFeedPosts({ page = 0, followingIds = [] } = {}) {
  let q = supabase
    .from('social_posts')
    .select('*')
    .order('created_at', { ascending: false })
    .range(page * 10, page * 10 + 9);
  if (followingIds.length > 0) q = q.in('user_id', followingIds);
  const { data, error } = await q;
  if (error) throw error;
  const posts = data || [];
  return await enrichPostsWithProfiles(posts);
}

async function enrichPostsWithProfiles(posts) {
  if (posts.length === 0) return posts;
  const userIds = [...new Set(posts.map(p => p.user_id))];
  const { data: profiles } = await supabase.from('social_profiles').select('id, display_name, username, avatar_url').in('id', userIds);
  const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
  return posts.map(p => ({ ...p, profile: profileMap[p.user_id] || null }));
}

async function fetchProfile(userId) {
  const { data } = await supabase.from('social_profiles').select('*').eq('id', userId).single();
  return data;
}

async function upsertProfile(userId, updates) {
  const { data, error } = await supabase.from('social_profiles').upsert({ id: userId, ...updates }, { onConflict: 'id' }).select().single();
  if (error) throw error;
  return data;
}

async function fetchUserPosts(userId) {
  const { data } = await supabase.from('social_posts')
    .select('*')
    .eq('user_id', userId).order('created_at', { ascending: false });
  return await enrichPostsWithProfiles(data || []);
}

async function createPost(payload) {
  const { data, error } = await supabase.from('social_posts').insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function toggleLike(postId, userId) {
  const { data: existing } = await supabase.from('social_likes').select('id').eq('post_id', postId).eq('user_id', userId).single();
  if (existing) {
    await supabase.from('social_likes').delete().eq('id', existing.id);
    return false;
  } else {
    await supabase.from('social_likes').insert({ post_id: postId, user_id: userId });
    return true;
  }
}

async function fetchLikedPostIds(userId) {
  if (!userId) return new Set();
  const { data } = await supabase.from('social_likes').select('post_id').eq('user_id', userId);
  return new Set((data || []).map(r => r.post_id));
}

async function fetchComments(postId) {
  const { data } = await supabase.from('social_comments')
    .select('*')
    .eq('post_id', postId).order('created_at', { ascending: true });
  const comments = data || [];
  if (comments.length === 0) return comments;
  const userIds = [...new Set(comments.map(c => c.user_id))];
  const { data: profiles } = await supabase.from('social_profiles').select('id, display_name, username, avatar_url').in('id', userIds);
  const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
  return comments.map(c => ({ ...c, profile: profileMap[c.user_id] || null }));
}

async function addComment(postId, userId, content) {
  const { data, error } = await supabase.from('social_comments').insert({ post_id: postId, user_id: userId, content }).select().single();
  if (error) throw error;
  return data;
}

async function toggleFollow(followerId, followingId) {
  const { data: existing } = await supabase.from('social_follows').select('id').eq('follower_id', followerId).eq('following_id', followingId).single();
  if (existing) {
    await supabase.from('social_follows').delete().eq('id', existing.id);
    return false;
  } else {
    await supabase.from('social_follows').insert({ follower_id: followerId, following_id: followingId });
    return true;
  }
}

async function fetchFollowingIds(userId) {
  if (!userId) return [];
  const { data } = await supabase.from('social_follows').select('following_id').eq('follower_id', userId);
  return (data || []).map(r => r.following_id);
}

async function fetchFollowers(userId) {
  const { data } = await supabase.from('social_follows').select('follower_id').eq('following_id', userId);
  const ids = (data || []).map(r => r.follower_id);
  if (ids.length === 0) return [];
  const { data: profiles } = await supabase.from('social_profiles').select('id, display_name, username, avatar_url').in('id', ids);
  return profiles || [];
}

// ── Notifications helpers ────────────────────────────────────────────────────
async function fetchNotifications(userId) {
  if (!userId) return [];
  const { data } = await supabase
    .from('social_notifications')
    .select('*, actor:actor_id(id, display_name, username, avatar_url)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);
  return data || [];
}

async function markAllRead(userId) {
  if (!userId) return;
  await supabase
    .from('social_notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
}

async function fetchFollowing(userId) {
  const { data } = await supabase.from('social_follows').select('following_id').eq('follower_id', userId);
  const ids = (data || []).map(r => r.following_id);
  if (ids.length === 0) return [];
  const { data: profiles } = await supabase.from('social_profiles').select('id, display_name, username, avatar_url').in('id', ids);
  return profiles || [];
}

async function fetchGroups() {
  const { data } = await supabase.from('fishing_groups').select('*').order('created_at', { ascending: false });
  const groups = data || [];
  if (groups.length === 0) return groups;
  const ownerIds = [...new Set(groups.map(g => g.owner_id))];
  const { data: profiles } = await supabase.from('social_profiles').select('id, display_name, avatar_url').in('id', ownerIds);
  const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
  return groups.map(g => ({ ...g, owner: profileMap[g.owner_id] || null }));
}

async function createGroup(payload) {
  const { data, error } = await supabase.from('fishing_groups').insert(payload).select().single();
  if (error) throw error;
  await supabase.from('group_members').insert({ group_id: data.id, user_id: payload.owner_id, role: 'owner' });
  return data;
}

async function fetchMyGroupIds(userId) {
  if (!userId) return new Set();
  const { data } = await supabase.from('group_members').select('group_id').eq('user_id', userId);
  return new Set((data || []).map(r => r.group_id));
}

async function toggleGroupMembership(groupId, userId) {
  const { data: existing } = await supabase.from('group_members').select('id').eq('group_id', groupId).eq('user_id', userId).single();
  if (existing) {
    await supabase.from('group_members').delete().eq('id', existing.id);
    return false;
  } else {
    await supabase.from('group_members').insert({ group_id: groupId, user_id: userId });
    return true;
  }
}

async function searchProfiles(query) {
  const { data } = await supabase.from('social_profiles')
    .select('id, display_name, username, avatar_url, bio')
    .or(`display_name.ilike.%${query}%,username.ilike.%${query}%`)
    .limit(20);
  return data || [];
}

// ── NotificationsPanel ───────────────────────────────────────────────────────
function NotificationsPanel({ userId, onClose, onProfileOpen }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications(userId).then(data => { setItems(data); setLoading(false); });
    markAllRead(userId);
  }, [userId]);

  function typeLabel(n) {
    if (n.type === 'like')    return 'curtiu sua postagem';
    if (n.type === 'follow')  return 'começou a te seguir';
    if (n.type === 'comment') return 'comentou na sua postagem';
    if (n.type === 'mention') return 'mencionou você em um comentário';
    return '';
  }
  function typeIcon(type) {
    if (type === 'like')    return <Heart size={14} style={{ color: '#ef4444' }} />;
    if (type === 'follow')  return <UserPlus size={14} style={{ color: 'var(--accent-light)' }} />;
    if (type === 'comment') return <MessageCircle size={14} style={{ color: '#22c55e' }} />;
    if (type === 'mention') return <AtSign size={14} style={{ color: '#f59e0b' }} />;
  }

  return (
    <div className="sf-notif-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sf-notif-panel">
        <div className="sf-notif-header">
          <span className="sf-notif-title"><Bell size={16} /> Notificações</span>
          <button className="sf-notif-close" onClick={onClose}><X size={18} /></button>
        </div>
        {loading && <div className="sf-loading"><Loader size={20} className="sf-spin" /></div>}
        {!loading && items.length === 0 && (
          <p className="sf-empty" style={{ padding: '24px 16px' }}>Nenhuma notificação ainda.</p>
        )}
        <div className="sf-notif-list">
          {items.map(n => (
            <button key={n.id} className={`sf-notif-item${n.is_read ? '' : ' unread'}`}
              onClick={() => { onProfileOpen(n.actor_id); onClose(); }}>
              <div className="sf-notif-avatar">
                <Avatar url={n.actor?.avatar_url} name={n.actor?.display_name} size={38} />
                <span className="sf-notif-type-icon">{typeIcon(n.type)}</span>
              </div>
              <div className="sf-notif-body">
                <span className="sf-notif-actor">{n.actor?.display_name || 'Alguém'}</span>
                {' '}{typeLabel(n)}
                <div className="sf-notif-time">{timeAgo(n.created_at)}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── PostImage — detecta orientação e ajusta object-fit ───────────────────────
function PostImage({ src, single }) {
  const [portrait, setPortrait] = useState(false);
  function handleLoad(e) {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setPortrait(naturalHeight > naturalWidth);
  }
  return (
    <img
      src={src}
      alt="captura"
      className={`sf-post-img${portrait ? ' portrait' : ''}`}
      loading="lazy"
      onLoad={handleLoad}
    />
  );
}

// ── PostCard ──────────────────────────────────────────────────────────────────
function PostCard({ post, currentUserId, liked, onLikeToggle, onCommentOpen, onProfileOpen, onRequestLogin }) {
  const profile = post.profile;
  const [localLiked, setLocalLiked] = useState(liked);
  const [localLikes, setLocalLikes] = useState(post.likes_count || 0);
  const [liking, setLiking] = useState(false);

  useEffect(() => { setLocalLiked(liked); }, [liked]);

  async function handleLike() {
    if (!currentUserId) { onRequestLogin?.(); return; }
    if (liking) return;
    setLiking(true);
    const nowLiked = !localLiked;
    setLocalLiked(nowLiked);
    setLocalLikes(n => nowLiked ? n + 1 : n - 1);
    try { await onLikeToggle(post.id); } catch { setLocalLiked(!nowLiked); setLocalLikes(n => nowLiked ? n - 1 : n + 1); }
    setLiking(false);
  }

  return (
    <article className="sf-post-card">
      {/* Header */}
      <div className="sf-post-header">
        <button className="sf-post-author" onClick={() => onProfileOpen(post.user_id)}>
          <Avatar url={profile?.avatar_url} name={profile?.display_name} size={40} />
          <div>
            <div className="sf-author-name">{profile?.display_name || 'Pescador'}</div>
            <div className="sf-author-meta">
              @{profile?.username || '—'}
              {post.location_name && <> · <MapPin size={11} style={{ display: 'inline', marginBottom: -1 }} /> {post.location_name}</>}
              · {timeAgo(post.created_at)}
            </div>
          </div>
        </button>
      </div>

      {/* Content */}
      {post.content && <p className="sf-post-content">{post.content}</p>}

      {/* Fish catch badge */}
      {post.species_name && (
        <div className="sf-catch-badge">
          <Fish size={14} />
          <span>{post.species_name}</span>
          {post.weight_kg && <><span className="sf-catch-sep">·</span><Trophy size={12} /><span>{post.weight_kg} kg</span></>}
        </div>
      )}

      {/* Images */}
      {(() => {
        const urls = post.image_urls?.length ? post.image_urls : (post.image_url ? [post.image_url] : []);
        if (!urls.length) return null;
        const single = urls.length === 1;
        return (
          <div className={single ? 'sf-post-img-wrap' : 'sf-post-img-grid'}>
            {urls.map((url, i) => (
              <PostImage key={i} src={url} single={single} />
            ))}
          </div>
        );
      })()}

      {/* Actions */}
      <div className="sf-post-actions">
        <button className={`sf-action-btn${localLiked ? ' liked' : ''}`} onClick={handleLike}>
          <Heart size={20} fill={localLiked ? 'currentColor' : 'none'} />
          <span>{localLikes > 0 ? localLikes : ''}</span>
        </button>
        <button className="sf-action-btn" onClick={() => { if (!currentUserId) { onRequestLogin?.(); return; } onCommentOpen(post); }}>
          <MessageCircle size={20} />
          <span>{post.comments_count > 0 ? post.comments_count : ''}</span>
        </button>
        <button className="sf-action-btn" onClick={() => navigator.share?.({ title: 'Pescamon', text: post.content, url: window.location.href }).catch(() => {})}>
          <Share2 size={18} />
        </button>
      </div>
    </article>
  );
}

// ── renderCommentText — destaca @menções ────────────────────────────────────
function renderCommentText(text) {
  const parts = text.split(/(@\w+)/g);
  return parts.map((p, i) =>
    /^@\w+$/.test(p)
      ? <span key={i} className="sf-mention">{p}</span>
      : p
  );
}

// ── CommentModal ──────────────────────────────────────────────────────────────
function CommentModal({ post, currentUserId, onClose }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const mentionDebounce = useRef(null);

  useEffect(() => {
    fetchComments(post.id).then(c => { setComments(c); setLoading(false); });
  }, [post.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [comments]);

  function handleTextChange(e) {
    const val = e.target.value;
    setText(val);
    // Detecta @query no cursor
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const match = before.match(/@(\w*)$/);
    if (match) {
      const q = match[1];
      setMentionQuery(q);
      setMentionOpen(true);
      clearTimeout(mentionDebounce.current);
      mentionDebounce.current = setTimeout(async () => {
        const results = await searchProfiles(q || ' ');
        setMentionResults(results.slice(0, 5));
      }, 250);
    } else {
      setMentionOpen(false);
      setMentionResults([]);
    }
  }

  function handleMentionSelect(user) {
    const cursor = inputRef.current?.selectionStart || text.length;
    const before = text.slice(0, cursor);
    const after = text.slice(cursor);
    const replaced = before.replace(/@\w*$/, `@${user.username} `);
    setText(replaced + after);
    setMentionOpen(false);
    setMentionResults([]);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function handleSend() {
    if (!text.trim() || !currentUserId || sending) return;
    setSending(true);
    try {
      const content = text.trim();
      const c = await addComment(post.id, currentUserId, content);
      setComments(prev => [...prev, c]);
      setText('');
      setMentionOpen(false);
      // Notificar @mentions (exclui o próprio autor)
      const handles = [...new Set((content.match(/@(\w+)/g) || []).map(m => m.slice(1)))];
      if (handles.length > 0) {
        const { data: mentioned } = await supabase
          .from('social_profiles')
          .select('id, username')
          .in('username', handles);
        const notifs = (mentioned || [])
          .filter(u => u.id !== currentUserId)
          .map(u => ({ user_id: u.id, actor_id: currentUserId, type: 'mention', post_id: post.id, is_read: false }));
        if (notifs.length > 0) {
          await supabase.from('social_notifications').insert(notifs);
        }
      }
    } finally { setSending(false); }
  }

  return (
    <div className="sf-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sf-modal">
        <div className="sf-modal-header">
          <span>Comentários</span>
          <button className="sf-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="sf-comments-list">
          {loading && <div className="sf-loading"><Loader size={20} className="sf-spin" /></div>}
          {!loading && comments.length === 0 && <p className="sf-empty">Seja o primeiro a comentar.</p>}
          {comments.map(c => (
            <div key={c.id} className="sf-comment">
              <Avatar url={c.profile?.avatar_url} name={c.profile?.display_name} size={32} />
              <div className="sf-comment-body">
                <span className="sf-comment-author">{c.profile?.display_name || 'Pescador'}</span>
                <span className="sf-comment-text">{renderCommentText(c.content)}</span>
                <span className="sf-comment-time">{timeAgo(c.created_at)}</span>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        {currentUserId && (
          <div className="sf-comment-input-wrap">
            {mentionOpen && mentionResults.length > 0 && (
              <div className="sf-mention-dropdown">
                {mentionResults.map(u => (
                  <button key={u.id} className="sf-mention-item" onMouseDown={e => { e.preventDefault(); handleMentionSelect(u); }}>
                    <Avatar url={u.avatar_url} name={u.display_name} size={28} />
                    <span className="sf-mention-name">{u.display_name}</span>
                    <span className="sf-mention-username">@{u.username}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="sf-comment-input-row">
              <input
                ref={inputRef}
                className="sf-comment-input"
                value={text}
                onChange={handleTextChange}
                onKeyDown={e => {
                  if (e.key === 'Escape') { setMentionOpen(false); return; }
                  if (e.key === 'Enter' && !e.shiftKey && !mentionOpen) handleSend();
                }}
                placeholder="Adicionar comentário... (@nome para mencionar)"
                maxLength={500}
              />
              <button className="sf-send-btn" onClick={handleSend} disabled={!text.trim() || sending}>
                <Send size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── NewPostModal ──────────────────────────────────────────────────────────────
const BUCKET = 'social-images';
const MAX_PHOTOS = 4;
const MAX_SIZE_MB = 5;

async function resizeImage(file, maxPx = 1200) {
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => resolve(new File([blob], file.name, { type: 'image/jpeg' })), 'image/jpeg', 0.85);
    };
    img.src = url;
  });
}

function NewPostModal({ currentUserId, onClose, onPosted, speciesList = [] }) {
  const [content, setContent] = useState('');
  const [speciesId, setSpeciesId] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [locationName, setLocationName] = useState('');
  const [imageFiles, setImageFiles] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [posting, setPosting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [postError, setPostError] = useState('');
  const fileRef = useRef(null);

  function handleImages(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = MAX_PHOTOS - imageFiles.length;
    const toAdd = files.slice(0, remaining);
    const oversized = toAdd.filter(f => f.size > MAX_SIZE_MB * 1024 * 1024);
    if (oversized.length) { setPostError(`Cada foto deve ter no máximo ${MAX_SIZE_MB}MB.`); return; }
    setPostError('');
    toAdd.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setImagePreviews(p => [...p, ev.target.result]);
      reader.readAsDataURL(file);
    });
    setImageFiles(p => [...p, ...toAdd]);
    e.target.value = '';
  }

  function removeImage(idx) {
    setImageFiles(p => p.filter((_, i) => i !== idx));
    setImagePreviews(p => p.filter((_, i) => i !== idx));
  }

  async function handlePost() {
    if (!content.trim() && imageFiles.length === 0) return;
    setPosting(true); setPostError('');
    try {
      const imageUrls = [];
      for (let i = 0; i < imageFiles.length; i++) {
        setUploadProgress(`Enviando foto ${i + 1}/${imageFiles.length}…`);
        const compressed = await resizeImage(imageFiles[i]);
        const path = `${currentUserId}/${Date.now()}-${i}.jpg`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, compressed, { upsert: true, contentType: 'image/jpeg' });
        if (upErr) throw new Error(`Falha no upload da foto ${i + 1}: ${upErr.message}`);
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
        imageUrls.push(urlData.publicUrl);
      }
      setUploadProgress('');
      const sp = speciesList.find(s => s.id === speciesId);
      await createPost({
        user_id: currentUserId,
        content: content.trim(),
        image_url: imageUrls[0] || null,
        image_urls: imageUrls.length > 0 ? imageUrls : null,
        species_id: speciesId || null,
        species_name: sp?.name || sp?.namePt || null,
        weight_kg: weightKg ? parseFloat(weightKg) : null,
        location_name: locationName.trim() || null,
      });
      onPosted?.();
      onClose();
    } catch (err) {
      setPostError(err.message || 'Erro ao publicar.');
    } finally { setPosting(false); setUploadProgress(''); }
  }

  return (
    <div className="sf-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sf-modal sf-modal-post">
        <div className="sf-modal-header">
          <span>Nova postagem</span>
          <button className="sf-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="sf-modal-body">
          <textarea
            className="sf-post-textarea"
            placeholder="O que você pescou hoje? Compartilhe com a comunidade..."
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={4}
            maxLength={1000}
          />

          {imagePreviews.length > 0 && (
            <div className="sf-img-preview-grid">
              {imagePreviews.map((src, idx) => (
                <div key={idx} className="sf-img-preview-wrap">
                  <img src={src} alt="" className="sf-img-preview" />
                  <button className="sf-img-remove" onClick={() => removeImage(idx)}><X size={14} /></button>
                </div>
              ))}
            </div>
          )}

          <div className="sf-post-fields">
            <select className="sf-field-input" value={speciesId} onChange={e => setSpeciesId(e.target.value)}>
              <option value="">🐟 Espécie (opcional)</option>
              {speciesList.map(s => <option key={s.id} value={s.id}>{s.name || s.namePt}</option>)}
            </select>
            <input className="sf-field-input" type="number" placeholder="Peso (kg)" min="0" step="0.1" value={weightKg} onChange={e => setWeightKg(e.target.value)} />
            <input className="sf-field-input" type="text" placeholder="📍 Local" value={locationName} onChange={e => setLocationName(e.target.value)} maxLength={80} />
          </div>

          {postError && <p style={{ color: '#ef4444', fontSize: '0.8rem', margin: '6px 0 0' }}>{postError}</p>}
          {uploadProgress && <p style={{ color: 'var(--accent-light)', fontSize: '0.8rem', margin: '6px 0 0' }}>{uploadProgress}</p>}
        </div>
        <div className="sf-modal-footer">
          {imageFiles.length < MAX_PHOTOS && (
            <button className="sf-icon-btn" onClick={() => fileRef.current?.click()} title={`Adicionar foto (${imageFiles.length}/${MAX_PHOTOS})`}>
              <Camera size={20} />
              {imageFiles.length > 0 && <span style={{ fontSize: '0.7rem', marginLeft: 3 }}>{imageFiles.length}/{MAX_PHOTOS}</span>}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleImages} />
          <span style={{ flex: 1 }} />
          <button className="sf-post-btn" onClick={handlePost} disabled={posting || (!content.trim() && imageFiles.length === 0)}>
            {posting ? <Loader size={16} className="sf-spin" /> : 'Publicar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ProfileView ───────────────────────────────────────────────────────────────
function ProfileView({ userId, currentUserId, onBack, onProfileOpen, onRequestLogin }) {
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [tab, setTab] = useState('posts'); // posts | followers | following
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const [likedIds, setLikedIds] = useState(new Set());
  const [commentPost, setCommentPost] = useState(null);

  const isOwn = userId === currentUserId;

  useEffect(() => {
    fetchProfile(userId).then(p => { setProfile(p); setEditData({ display_name: p?.display_name || '', bio: p?.bio || '', location: p?.location || '' }); });
    fetchUserPosts(userId).then(setPosts);
    fetchFollowers(userId).then(setFollowers);
    fetchFollowing(userId).then(setFollowing);
    fetchLikedPostIds(currentUserId).then(setLikedIds);
    if (currentUserId && !isOwn) {
      fetchFollowingIds(currentUserId).then(ids => setIsFollowing(ids.includes(userId)));
    }
  }, [userId, currentUserId]);

  async function handleFollowToggle() {
    if (!currentUserId) { onRequestLogin?.(); return; }
    const nowFollowing = !isFollowing;
    setIsFollowing(nowFollowing);
    // Optimistic update nos counters do perfil
    setProfile(p => p ? { ...p, followers_count: Math.max(0, (p.followers_count || 0) + (nowFollowing ? 1 : -1)) } : p);
    await toggleFollow(currentUserId, userId);
    // Recarrega perfil para sincronizar com o valor real do banco
    fetchProfile(userId).then(setProfile);
    fetchFollowers(userId).then(setFollowers);
    fetchFollowing(userId).then(setFollowing);
  }

  async function handleSaveProfile() {
    setSaving(true);
    try {
      const updated = await upsertProfile(currentUserId, editData);
      setProfile(updated);
      setEditing(false);
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  }

  if (!profile) return <div className="sf-loading"><Loader size={24} className="sf-spin" /></div>;

  return (
    <div className="sf-profile-view">
      {onBack && (
        <button className="sf-back-btn" onClick={onBack}><ChevronLeft size={20} /> Voltar</button>
      )}

      {/* Cover / Header */}
      <div className="sf-profile-header">
        <div className="sf-profile-avatar-wrap">
          <Avatar url={profile.avatar_url} name={profile.display_name} size={80} />
        </div>
        <div className="sf-profile-info">
          {editing ? (
            <div className="sf-edit-form">
              <input className="sf-field-input" value={editData.display_name} onChange={e => setEditData(d => ({ ...d, display_name: e.target.value }))} placeholder="Nome" />
              <input className="sf-field-input" value={editData.bio} onChange={e => setEditData(d => ({ ...d, bio: e.target.value }))} placeholder="Bio" maxLength={160} />
              <input className="sf-field-input" value={editData.location} onChange={e => setEditData(d => ({ ...d, location: e.target.value }))} placeholder="Localização" maxLength={80} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="sf-btn-secondary" onClick={() => setEditing(false)}>Cancelar</button>
                <button className="sf-post-btn" onClick={handleSaveProfile} disabled={saving}>{saving ? '...' : 'Salvar'}</button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="sf-profile-name">{profile.display_name || 'Pescador'}</h2>
              <p className="sf-profile-username">@{profile.username}</p>
              {profile.bio && <p className="sf-profile-bio">{profile.bio}</p>}
              {profile.location && <p className="sf-profile-location"><MapPin size={13} /> {profile.location}</p>}
              <div className="sf-profile-stats">
                <span><strong>{profile.posts_count ?? posts.length}</strong> posts</span>
                <span><strong>{profile.followers_count ?? followers.length}</strong> seguidores</span>
                <span><strong>{profile.following_count ?? following.length}</strong> seguindo</span>
              </div>
              {isOwn
                ? <button className="sf-btn-secondary" onClick={() => setEditing(true)}>Editar perfil</button>
                : currentUserId && (
                    <button className={`sf-follow-btn${isFollowing ? ' following' : ''}`} onClick={handleFollowToggle}>
                      {isFollowing ? <><UserCheck size={15} /> Seguindo</> : <><UserPlus size={15} /> Seguir</>}
                    </button>
                  )
              }
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="sf-profile-tabs">
        {['posts', 'followers', 'following'].map(t => (
          <button key={t} className={`sf-tab-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'posts' ? 'Posts' : t === 'followers' ? `Seguidores (${profile?.followers_count ?? followers.length})` : `Seguindo (${profile?.following_count ?? following.length})`}
          </button>
        ))}
      </div>

      {tab === 'posts' && (
        <div className="sf-profile-posts">
          {posts.length === 0 && <p className="sf-empty">Nenhum post ainda.</p>}
          {posts.map(p => (
            <PostCard key={p.id} post={p} currentUserId={currentUserId} liked={likedIds.has(p.id)}
              onLikeToggle={async (id) => { await toggleLike(id, currentUserId); setLikedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; }); }}
              onCommentOpen={setCommentPost}
              onProfileOpen={onProfileOpen}
            />
          ))}
        </div>
      )}

      {(tab === 'followers' || tab === 'following') && (
        <div className="sf-user-list">
          {(tab === 'followers' ? followers : following).map(u => (
            <button key={u.id} className="sf-user-row" onClick={() => onProfileOpen(u.id)}>
              <Avatar url={u.avatar_url} name={u.display_name} size={44} />
              <div>
                <div className="sf-author-name">{u.display_name}</div>
                <div className="sf-author-meta">@{u.username}</div>
              </div>
            </button>
          ))}
          {(tab === 'followers' ? followers : following).length === 0 && <p className="sf-empty">Nenhum usuário ainda.</p>}
        </div>
      )}

      {commentPost && <CommentModal post={commentPost} currentUserId={currentUserId} onClose={() => setCommentPost(null)} />}
    </div>
  );
}

// ── GroupsView ────────────────────────────────────────────────────────────────
function GroupsView({ currentUserId, onRequestLogin }) {
  const [groups, setGroups] = useState([]);
  const [myGroupIds, setMyGroupIds] = useState(new Set());
  const [creating, setCreating] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', description: '', is_public: true });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchGroups().then(setGroups);
    fetchMyGroupIds(currentUserId).then(setMyGroupIds);
  }, [currentUserId]);

  async function handleCreate() {
    if (!newGroup.name.trim()) return;
    if (!currentUserId) { onRequestLogin?.(); return; }
    setSaving(true);
    try {
      const g = await createGroup({ ...newGroup, owner_id: currentUserId });
      setGroups(prev => [g, ...prev]);
      setMyGroupIds(prev => new Set([...prev, g.id]));
      setCreating(false);
      setNewGroup({ name: '', description: '', is_public: true });
    } catch (err) { alert(err.message); }
    finally { setSaving(false); }
  }

  async function handleJoinToggle(groupId) {
    if (!currentUserId) { onRequestLogin?.(); return; }
    const isMember = myGroupIds.has(groupId);
    const nowMember = !isMember;
    setMyGroupIds(prev => { const s = new Set(prev); nowMember ? s.add(groupId) : s.delete(groupId); return s; });
    await toggleGroupMembership(groupId, currentUserId);
    fetchGroups().then(setGroups);
  }

  const filtered = groups.filter(g =>
    !search.trim() || g.name.toLowerCase().includes(search.toLowerCase()) || (g.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="sf-groups-view">
      <div className="sf-section-header">
        <h3 className="sf-section-title"><Users size={18} /> Grupos de Pesca</h3>
        <button className="sf-post-btn sf-btn-sm" onClick={() => { if (!currentUserId) { onRequestLogin?.(); return; } setCreating(true); }}>
          <Plus size={15} /> Criar grupo
        </button>
      </div>

      <div className="sf-search-wrap">
        <Search size={15} className="sf-search-icon" />
        <input className="sf-search-input" placeholder="Buscar grupos..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {creating && (
        <div className="sf-create-group-card">
          <input className="sf-field-input" placeholder="Nome do grupo" value={newGroup.name} onChange={e => setNewGroup(d => ({ ...d, name: e.target.value }))} maxLength={60} />
          <textarea className="sf-field-input" placeholder="Descrição (opcional)" value={newGroup.description} onChange={e => setNewGroup(d => ({ ...d, description: e.target.value }))} rows={2} maxLength={300} />
          <label className="sf-toggle-row">
            <input type="checkbox" checked={newGroup.is_public} onChange={e => setNewGroup(d => ({ ...d, is_public: e.target.checked }))} />
            <Globe size={14} /> Grupo público
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="sf-btn-secondary" onClick={() => setCreating(false)}>Cancelar</button>
            <button className="sf-post-btn" onClick={handleCreate} disabled={saving || !newGroup.name.trim()}>{saving ? '...' : 'Criar'}</button>
          </div>
        </div>
      )}

      <div className="sf-groups-list">
        {filtered.length === 0 && <p className="sf-empty">Nenhum grupo encontrado.</p>}
        {filtered.map(g => {
          const isMember = myGroupIds.has(g.id);
          return (
            <div key={g.id} className="sf-group-card">
              <div className="sf-group-avatar">
                {g.avatar_url ? <img src={g.avatar_url} alt={g.name} className="sf-group-img" /> : <span className="sf-group-emoji">🎣</span>}
              </div>
              <div className="sf-group-info">
                <div className="sf-group-name">
                  {g.name}
                  {g.is_public ? <Globe size={12} className="sf-group-badge" /> : <Lock size={12} className="sf-group-badge" />}
                </div>
                {g.description && <p className="sf-group-desc">{g.description}</p>}
                <div className="sf-group-meta">
                  <Users size={12} /> {g.members_count} membros
                  {g.owner && <> · por {g.owner.display_name}</>}
                </div>
              </div>
              <button className={`sf-join-btn${isMember ? ' member' : ''}`} onClick={() => handleJoinToggle(g.id)}>
                {isMember ? 'Sair' : 'Entrar'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── SearchView ────────────────────────────────────────────────────────────────
function SearchView({ currentUserId, onProfileOpen, followingIds }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  function handleSearch(q) {
    setQuery(q);
    clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const data = await searchProfiles(q);
      setResults(data);
      setSearching(false);
    }, 400);
  }

  return (
    <div className="sf-search-view">
      <div className="sf-search-wrap sf-search-big">
        <Search size={16} className="sf-search-icon" />
        <input className="sf-search-input" placeholder="Buscar pescadores..." value={query} onChange={e => handleSearch(e.target.value)} autoFocus />
      </div>
      {searching && <div className="sf-loading"><Loader size={20} className="sf-spin" /></div>}
      {!searching && results.length === 0 && query.trim() && <p className="sf-empty">Nenhum pescador encontrado.</p>}
      <div className="sf-user-list">
        {results.map(u => (
          <button key={u.id} className="sf-user-row" onClick={() => onProfileOpen(u.id)}>
            <Avatar url={u.avatar_url} name={u.display_name} size={46} />
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div className="sf-author-name">{u.display_name}</div>
              <div className="sf-author-meta">@{u.username}{u.bio ? ` · ${u.bio.slice(0, 50)}` : ''}</div>
            </div>
            {followingIds.includes(u.id) && <span className="sf-following-chip"><UserCheck size={13} /> Seguindo</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main SocialFeed ───────────────────────────────────────────────────────────
export default function SocialFeed({ authSession, speciesList = [], onRequestLogin }) {
  const currentUserId = authSession?.user?.id || null;

  const [tab, setTab] = useState('feed'); // feed | search | groups | profile
  const [posts, setPosts] = useState([]);
  const [likedIds, setLikedIds] = useState(new Set());
  const [followingIds, setFollowingIds] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [newPost, setNewPost] = useState(false);
  const [commentPost, setCommentPost] = useState(null);
  const [profileUserId, setProfileUserId] = useState(currentUserId);
  const [profileStack, setProfileStack] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [liveNotif, setLiveNotif] = useState(null);
  const liveNotifTimer = useRef(null);
  const loaderRef = useRef(null);
  const scrollRef = useRef(null);

  const loadPosts = useCallback(async (pg = 0, following = []) => {
    const batch = await fetchFeedPosts({ page: pg, followingIds: following });
    if (pg === 0) setPosts(batch);
    else setPosts(prev => [...prev, ...batch]);
    setHasMore(batch.length === 10);
    setLoading(false);
    setLoadingMore(false);
  }, []);

  useEffect(() => {
    fetchFollowingIds(currentUserId).then(ids => {
      setFollowingIds(ids);
      loadPosts(0, ids);
    });
    fetchLikedPostIds(currentUserId).then(setLikedIds);
  }, [currentUserId]);

  // Contagem de não lidas
  useEffect(() => {
    if (!currentUserId) return;
    fetchNotifications(currentUserId).then(data => {
      setUnreadCount(data.filter(n => !n.is_read).length);
    });
  }, [currentUserId]);

  // Realtime: novas notificações + toast in-app
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel('notif-' + currentUserId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'social_notifications',
        filter: `user_id=eq.${currentUserId}`,
      }, async (payload) => {
        setUnreadCount(c => c + 1);
        // Busca actor para exibir toast
        const newNotif = payload.new;
        if (newNotif?.actor_id) {
          const { data: actor } = await supabase
            .from('social_profiles')
            .select('display_name, avatar_url')
            .eq('id', newNotif.actor_id)
            .single();
          const typeMsg =
            newNotif.type === 'like'    ? 'curtiu sua postagem' :
            newNotif.type === 'follow'  ? 'começou a te seguir' :
            newNotif.type === 'comment' ? 'comentou na sua postagem' :
            newNotif.type === 'mention' ? 'mencionou você em um comentário' : '';
          setLiveNotif({ actor, typeMsg, id: newNotif.id });
          clearTimeout(liveNotifTimer.current);
          liveNotifTimer.current = setTimeout(() => setLiveNotif(null), 4000);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); clearTimeout(liveNotifTimer.current); };
  }, [currentUserId]);

  // Infinite scroll
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) {
        setLoadingMore(true);
        const nextPage = page + 1;
        setPage(nextPage);
        loadPosts(nextPage, followingIds);
      }
    }, { threshold: 0.1, root: scrollRef.current });
    if (loaderRef.current) obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, page, followingIds, loadPosts]);

  function handleProfileOpen(userId) {
    setProfileStack(prev => [...prev, { tab, profileUserId }]);
    setProfileUserId(userId);
    setTab('profile');
  }

  function handleProfileBack() {
    const prev = profileStack[profileStack.length - 1];
    if (prev) {
      setTab(prev.tab);
      setProfileUserId(prev.profileUserId);
      setProfileStack(s => s.slice(0, -1));
    } else {
      setTab('feed');
    }
  }

  async function handleLikeToggle(postId) {
    if (!currentUserId) { onRequestLogin?.(); return; }
    await toggleLike(postId, currentUserId);
    setLikedIds(prev => {
      const s = new Set(prev);
      const wasLiked = s.has(postId);
      wasLiked ? s.delete(postId) : s.add(postId);
      setPosts(posts => posts.map(p => p.id === postId
        ? { ...p, likes_count: Math.max(0, p.likes_count + (wasLiked ? -1 : 1)) }
        : p));
      return s;
    });
  }

  return (
    <div className="sf-root">
      {/* Top Nav */}
      <div className="sf-topnav">
        <span className="sf-brand">🎣 Comunidade</span>
        <div className="sf-topnav-tabs">
          {[
            { id: 'feed', label: 'Feed' },
            { id: 'search', label: 'Buscar' },
            { id: 'groups', label: 'Grupos' },
          ].map(t => (
            <button key={t.id} className={`sf-topnav-btn${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
          {currentUserId && (
            <button className={`sf-topnav-btn${tab === 'profile' && profileUserId === currentUserId ? ' active' : ''}`}
              onClick={() => handleProfileOpen(currentUserId)}>
              Meu perfil
            </button>
          )}
        </div>
        {currentUserId && (
          <button className="sf-bell-btn" onClick={() => { setShowNotifs(true); setUnreadCount(0); }} title="Notificações">
            <Bell size={18} />
            {unreadCount > 0 && <span className="sf-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
        )}
        {tab === 'feed' && (
          <button className="sf-fab-topbar" onClick={() => { if (!currentUserId) { onRequestLogin?.(); return; } setNewPost(true); }} title="Nova postagem">
            <Plus size={18} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="sf-content-scroll" ref={scrollRef}>
      <div className="sf-content">
        {tab === 'feed' && (
          <>
            {loading && <div className="sf-loading sf-loading-center"><Loader size={28} className="sf-spin" /></div>}
            {!loading && posts.length === 0 && (
              <div className="sf-empty-feed">
                <Fish size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
                <p>Nenhuma postagem ainda.</p>
                {currentUserId
                  ? <p style={{ fontSize: '0.82rem', opacity: 0.6 }}>Seja o primeiro a compartilhar uma captura!</p>
                  : <p style={{ fontSize: '0.82rem', opacity: 0.6 }}>Entre na sua conta para ver o feed personalizado.</p>}
              </div>
            )}
            {posts.map(p => (
              <PostCard key={p.id} post={p} currentUserId={currentUserId}
                liked={likedIds.has(p.id)}
                onLikeToggle={handleLikeToggle}
                onCommentOpen={setCommentPost}
                onProfileOpen={handleProfileOpen}
                onRequestLogin={onRequestLogin}
              />
            ))}
            {hasMore && <div ref={loaderRef} className="sf-load-more">{loadingMore && <Loader size={18} className="sf-spin" />}</div>}
          </>
        )}

        {tab === 'search' && (
          <SearchView currentUserId={currentUserId} onProfileOpen={handleProfileOpen} followingIds={followingIds} />
        )}

        {tab === 'groups' && (
          <GroupsView currentUserId={currentUserId} onRequestLogin={onRequestLogin} />
        )}

        {tab === 'profile' && (
          <ProfileView
            userId={profileUserId || currentUserId}
            currentUserId={currentUserId}
            onBack={profileStack.length > 0 ? handleProfileBack : null}
            onProfileOpen={handleProfileOpen}
            onRequestLogin={onRequestLogin}
          />
        )}
      </div>
      </div>

      {/* Modals */}
      {newPost && (
        <NewPostModal
          currentUserId={currentUserId}
          speciesList={speciesList}
          onClose={() => setNewPost(false)}
          onPosted={() => { setPage(0); setLoading(true); fetchFollowingIds(currentUserId).then(ids => { setFollowingIds(ids); loadPosts(0, ids); }); }}
        />
      )}
      {commentPost && (
        <CommentModal post={commentPost} currentUserId={currentUserId} onClose={() => setCommentPost(null)} />
      )}
      {showNotifs && currentUserId && (
        <NotificationsPanel
          userId={currentUserId}
          onClose={() => setShowNotifs(false)}
          onProfileOpen={(id) => { handleProfileOpen(id); setShowNotifs(false); }}
        />
      )}

      {/* Toast in-app de notificação em tempo real */}
      {liveNotif && (
        <div
          style={{
            position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
            background: '#0f2233', border: '1px solid rgba(34,211,238,0.3)',
            borderRadius: 14, padding: '10px 16px', display: 'flex', alignItems: 'center',
            gap: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 99999,
            maxWidth: 340, width: '90%', animation: 'sf-toast-in 0.25s ease',
          }}
        >
          <Avatar url={liveNotif.actor?.avatar_url} name={liveNotif.actor?.display_name} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: '0.83rem', color: '#e5f6ff' }}>
              {liveNotif.actor?.display_name || 'Alguém'}
            </span>
            <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}> {liveNotif.typeMsg}</span>
          </div>
          <button onClick={() => setLiveNotif(null)}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
