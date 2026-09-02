'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { validateRegisterInput } from '@/shared/validation';

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '10px',
  border: '1px solid #334',
  background: '#14142b',
  color: '#eee',
  fontSize: '15px',
  boxSizing: 'border-box',
};

const labelStyle = { display: 'block', color: '#aab', fontSize: '13px', margin: '10px 0 4px' };
const errStyle = { color: '#ff6b6b', fontSize: '12px', marginTop: '4px' };

function Field({ label, error, children }) {
  return (
    <label style={labelStyle}>
      {label}
      {children}
      {error ? <div style={errStyle}>{error}</div> : null}
    </label>
  );
}

export default function AuthScreen() {
  const { login, register, sessionError, restoreSession } = useAuth();
  const [mode, setMode] = useState('login'); // login | register
  const [busy, setBusy] = useState(false);
  const [serverMessage, setServerMessage] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [form, setForm] = useState({ username: '', email: '', phone: '', identifier: '', password: '' });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setServerMessage(null);
    setFieldErrors({});
    try {
      if (mode === 'login') {
        if (!form.identifier.trim() || !form.password) {
          setServerMessage('Enter your username/email and password.');
          return;
        }
        await login({ identifier: form.identifier.trim(), password: form.password, deviceName: navigator.userAgent?.slice(0, 60) });
      } else {
        const check = validateRegisterInput(form);
        if (!check.valid) {
          setFieldErrors(check.errors);
          setServerMessage('Please fix the highlighted fields.');
          return;
        }
        await register({
          username: form.username,
          email: form.email,
          phone: form.phone || undefined,
          password: form.password,
          deviceName: navigator.userAgent?.slice(0, 60),
        });
      }
    } catch (err) {
      const message = err?.message || 'Something went wrong. Please try again.';
      setServerMessage(message);
      if (err?.code === 'VALIDATION' && err.fields) setFieldErrors(err.fields);
    } finally {
      setBusy(false);
    }
  }

  const switchMode = (m) => {
    setMode(m);
    setServerMessage(null);
    setFieldErrors({});
  };

  return (
    <div style={{ width: '100%', maxWidth: 380, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <h1 style={{ color: 'white', fontSize: '2.2rem', textShadow: '0 0 14px rgba(255,215,0,.45)', marginBottom: 4 }}>
          🎲 Ludo
        </h1>
        <p style={{ color: '#8899bb', margin: 0 }}>Play the classic board game with friends in real time.</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {['login', 'register'].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            style={{
              flex: 1, padding: '10px', borderRadius: '50px', border: 'none', cursor: 'pointer',
              fontWeight: 'bold', fontSize: '14px',
              background: mode === m ? '#ffd700' : '#2c3e50', color: mode === m ? '#14142b' : '#ccd',
            }}
          >
            {m === 'login' ? 'Log in' : 'Register'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{ background: '#1c1c36', borderRadius: '16px', padding: 20 }}>
        {mode === 'login' ? (
          <>
            <Field label="Username, email or phone">
              <input style={inputStyle} value={form.identifier} onChange={set('identifier')}
                autoComplete="username" placeholder="e.g. player_1 or 0712345678" />
            </Field>
            <Field label="Password">
              <input style={inputStyle} type="password" value={form.password} onChange={set('password')}
                autoComplete="current-password" placeholder="Your password" />
            </Field>
          </>
        ) : (
          <>
            <Field label="Username" error={fieldErrors.username}>
              <input style={inputStyle} value={form.username} onChange={set('username')} autoComplete="username"
                placeholder="3-20 chars: letters, numbers, _" />
            </Field>
            <Field label="Email" error={fieldErrors.email}>
              <input style={inputStyle} type="email" value={form.email} onChange={set('email')} autoComplete="email"
                placeholder="you@example.com" />
            </Field>
            <Field label="Phone (optional, Kenyan mobile)" error={fieldErrors.phone}>
              <input style={inputStyle} value={form.phone} onChange={set('phone')} autoComplete="tel"
                placeholder="0712345678 or +254712345678" />
            </Field>
            <Field label="Password" error={fieldErrors.password}>
              <input style={inputStyle} type="password" value={form.password} onChange={set('password')}
                autoComplete="new-password" placeholder="At least 8 characters" />
            </Field>
          </>
        )}

        {sessionError && !serverMessage ? (
          <div style={{ ...errStyle, background: '#2a1f1f', borderRadius: 8, padding: 10, margin: '10px 0 0' }}>
            {sessionError}
            <button type="button" onClick={() => restoreSession()} style={{ marginLeft: 8, cursor: 'pointer', background: 'none', border: 'none', color: '#ffd700', textDecoration: 'underline' }}>
              Retry
            </button>
          </div>
        ) : null}
        {serverMessage ? (
          <div style={{ ...errStyle, background: '#2a1f1f', borderRadius: 8, padding: 10, margin: '10px 0 0' }}>
            {serverMessage}
          </div>
        ) : null}

        <button type="submit" disabled={busy}
          style={{
            marginTop: 16, width: '100%', padding: '13px', borderRadius: '50px', border: 'none',
            background: busy ? '#7a7' : '#ffd700', color: '#14142b', fontWeight: 'bold', fontSize: '15px', cursor: busy ? 'wait' : 'pointer',
          }}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
