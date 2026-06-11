import { useState } from 'react';
import { X, Mail, Lock, User, Eye, EyeOff, AlertTriangle, Check } from 'lucide-react';
import { signInWithEmail, signUpWithEmail, signInWithProvider, resetPassword } from './supabase.js';


function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="#1877F2" d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
    </svg>
  );
}

const PROVIDERS = [
  { id: 'google',   label: 'Continuar com Google',   Icon: GoogleIcon },
  { id: 'facebook', label: 'Continuar com Facebook', Icon: FacebookIcon },
];

export default function AuthModal({ isOpen, onClose, onSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'reset'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function reset() {
    setName(''); setEmail(''); setPassword('');
    setError(''); setSuccess(''); setLoading(false); setShowPass(false);
  }

  function handleClose() { reset(); setMode('login'); onClose(); }
  function switchMode(m) { reset(); setMode(m); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!email.trim()) return setError('Informe seu e-mail.');
    if (mode !== 'reset' && !password) return setError('Informe sua senha.');
    if (mode === 'register' && password.length < 6) return setError('A senha deve ter ao menos 6 caracteres.');

    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmail(email.trim(), password);
        onSuccess?.();
        handleClose();
      } else if (mode === 'register') {
        await signUpWithEmail(email.trim(), password, name.trim());
        setSuccess('Cadastro realizado! Verifique seu e-mail para confirmar a conta.');
      } else if (mode === 'reset') {
        await resetPassword(email.trim());
        setSuccess('Link de redefinição enviado para seu e-mail.');
      }
    } catch (err) {
      const msg = err?.message || '';
      if (msg.includes('Invalid login')) setError('E-mail ou senha incorretos.');
      else if (msg.includes('already registered')) setError('Este e-mail já está cadastrado.');
      else if (msg.includes('Email not confirmed')) setError('Confirme seu e-mail antes de entrar.');
      else setError(msg || 'Ocorreu um erro. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function handleProvider(provider) {
    setError('');
    try {
      await signInWithProvider(provider);
    } catch (err) {
      const msg = err?.message || '';
      if (msg.includes('provider is not enabled')) setError(`Login com ${provider === 'google' ? 'Google' : 'Facebook'} não está habilitado. Tente e-mail e senha.`);
      else setError(msg || 'Erro ao conectar com provedor.');
    }
  }

  if (!isOpen) return null;

  return (
    <div className="auth-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="auth-modal">
        <div className="auth-header">
          <div className="auth-logo">🎣</div>
          <div>
            <h2 className="auth-title">
              {mode === 'login' ? 'Entrar na sua conta' :
               mode === 'register' ? 'Criar conta' : 'Redefinir senha'}
            </h2>
            <p className="auth-subtitle">Pescamon — Rio Santa Lucía</p>
          </div>
          <button className="auth-close" onClick={handleClose} type="button"><X size={18} /></button>
        </div>

        {/* Social providers — só no login/registro */}
        {mode !== 'reset' && (
          <div className="auth-providers">
            {PROVIDERS.map(({ id, label, Icon }) => (
              <button key={id} type="button" className="auth-provider-btn" onClick={() => handleProvider(id)}>
                <span className="auth-provider-icon"><Icon /></span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}

        {mode !== 'reset' && <div className="auth-divider"><span>ou com e-mail</span></div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="auth-field">
              <User size={15} />
              <input type="text" placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
          )}
          <div className="auth-field">
            <Mail size={15} />
            <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          {mode !== 'reset' && (
            <div className="auth-field">
              <Lock size={15} />
              <input type={showPass ? 'text' : 'password'} placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              <button type="button" className="auth-eye" onClick={() => setShowPass((v) => !v)}>
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          )}

          {error && <div className="auth-error"><AlertTriangle size={13} /> {error}</div>}
          {success && <div className="auth-success"><Check size={13} /> {success}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? 'Aguarde…' :
             mode === 'login' ? 'Entrar' :
             mode === 'register' ? 'Criar conta' : 'Enviar link'}
          </button>
        </form>

        <div className="auth-footer">
          {mode === 'login' && <>
            <button type="button" onClick={() => switchMode('reset')}>Esqueci minha senha</button>
            <span>·</span>
            <button type="button" onClick={() => switchMode('register')}>Criar conta</button>
          </>}
          {mode === 'register' && <>
            <button type="button" onClick={() => switchMode('login')}>Já tenho conta</button>
          </>}
          {mode === 'reset' && <>
            <button type="button" onClick={() => switchMode('login')}>Voltar ao login</button>
          </>}
        </div>
      </div>
    </div>
  );
}
