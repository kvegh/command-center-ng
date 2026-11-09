import React, { useRef, useState } from 'react';

export type LoginMode = 'login' | 'setup' | 'operator';
export type SessionInfo = { authenticated: boolean; setupRequired?: boolean; setupAllowed?: boolean };
type Credentials = { password: string; confirmation?: string };
type AuthReply = { authenticated?: boolean; ok?: boolean };
type AuthRequest = (path: 'login' | 'setup', credentials: Credentials) => Promise<AuthReply>;

export function loginMode(session: Pick<SessionInfo, 'setupRequired' | 'setupAllowed'>): LoginMode {
  return session.setupRequired === true ? session.setupAllowed === true ? 'setup' : 'operator' : 'login';
}

export async function submitPassword(mode: LoginMode, password: string, confirmation: string, request: AuthRequest) {
  if (mode === 'operator') throw new Error('Browser password creation is not enabled. Ask the operator to complete setup.');
  if (mode === 'setup') {
    if (password.length < 12 || password.length > 4096 || confirmation.length < 12 || confirmation.length > 4096) throw new Error('Use a password of 12–4096 characters.');
    if (password !== confirmation) throw new Error('The passwords do not match.');
    const result = await request('setup', { password, confirmation });
    if (result.authenticated !== true) throw new Error('Password creation was not confirmed. Check setup before trying again.');
  } else await request('login', { password });
}

export function PasswordFields({ mode, password, confirmation, busy, error, lockIcon, changePassword, changeConfirmation }: {
  mode: 'login' | 'setup'; password: string; confirmation: string; busy: boolean; error: string;
  lockIcon: React.ReactNode; changePassword: (value: string) => void; changeConfirmation: (value: string) => void;
}) {
  const creating = mode === 'setup';
  const describedBy = [creating ? 'password-note' : '', error ? 'password-error' : ''].filter(Boolean).join(' ') || undefined;
  return <>
    <label htmlFor="password">{creating ? 'Choose application password' : 'Application password'}</label>
    <div className="password-input">{lockIcon}<input id="password" type="password" value={password} onChange={event => changePassword(event.target.value)} autoComplete={creating ? 'new-password' : 'current-password'} minLength={creating ? 12 : undefined} maxLength={creating ? 4096 : undefined} aria-describedby={describedBy} aria-invalid={!!error} disabled={busy} required autoFocus /></div>
    {creating && <>
      <label htmlFor="confirmation" className="confirmation-label">Confirm application password</label>
      <div className="password-input">{lockIcon}<input id="confirmation" type="password" value={confirmation} onChange={event => changeConfirmation(event.target.value)} autoComplete="new-password" minLength={12} maxLength={4096} aria-describedby={describedBy} aria-invalid={!!error} disabled={busy} required /></div>
      <p id="password-note" className="field-note password-note">Use 12–4096 characters. This is your CCNG application password.</p>
    </>}
    {error && <p id="password-error" className="error-text" role="alert">{error}</p>}
  </>;
}

export function Login({ mode = 'login', brand, lockIcon, submitIcon, version, notice, request, refreshSession, onLogin }: {
  mode?: LoginMode; brand: React.ReactNode; lockIcon: React.ReactNode; submitIcon: React.ReactNode; version: string;
  notice?: string; request: AuthRequest; refreshSession: () => Promise<void>; onLogin: () => void;
}) {
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const refresh = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await refreshSession(); }
    catch (problem) { setError((problem as Error).message); }
    finally { pending.current = false; setBusy(false); }
  };
  return <main className="login-page"><div className="login-card">{brand}<div className="eyebrow">YOUR WORK, IN FOCUS</div>
    <h1>{mode === 'setup' ? 'Create your password' : mode === 'operator' ? 'Finish application setup' : <>A little less switching.<br />A lot more clarity.</>}</h1>
    <p>{mode === 'setup' ? 'Choose a password to finish this new installation and enter your workspace.' : mode === 'operator' ? 'Browser password creation is not enabled. The operator must configure htpasswd-protected browser setup, or set the application password with the existing command-line tool.' : 'One quiet workspace for your Codex and Claude agents.'}</p>
    {notice && <p className="field-note" role="status">{notice}</p>}
    {mode === 'operator' ? <>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button type="button" className="button subtle" disabled={busy} onClick={() => void refresh()}>{busy ? 'Checking setup…' : 'Check setup again'}</button>
    </> : <form onSubmit={async event => {
      event.preventDefault(); if (pending.current) return;
      pending.current = true; setBusy(true); setError('');
      try { await submitPassword(mode, password, confirmation, request); setPassword(''); setConfirmation(''); onLogin(); }
      catch (problem) {
        const failure = problem as Error & { status?: number };
        setError(failure.message);
        // A second browser or operator may have completed/disabled setup first.
        // Re-read the mode; never turn this failure into another setup attempt.
        if (mode === 'setup' && [403, 409].includes(failure.status || 0)) {
          setPassword(''); setConfirmation('');
          try { await refreshSession(); } catch { /* Keep the original failure visible. */ }
        }
      } finally { pending.current = false; setBusy(false); }
    }}>
      <PasswordFields mode={mode} password={password} confirmation={confirmation} busy={busy} error={error} lockIcon={lockIcon} changePassword={setPassword} changeConfirmation={setConfirmation} />
      <button className="button primary" disabled={busy}>{busy ? mode === 'setup' ? 'Creating password…' : 'Signing in…' : mode === 'setup' ? 'Create password & enter' : 'Enter workspace'}{submitIcon}</button>
    </form>}
    <div className="login-foot">COMMAND CENTER NG <span>v{version}</span></div>
  </div></main>;
}
