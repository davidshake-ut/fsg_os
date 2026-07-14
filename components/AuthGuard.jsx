'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wifi, Loader2 } from 'lucide-react';
import { useSession } from '@/components/SessionProvider';
import { getSupabase, getInitialAuthHash } from '@/lib/supabase/client';
import { Card, Button, TextInput, Field } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

function Centered({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f7f9] p-4">
      <Card className="w-full max-w-sm p-6">{children}</Card>
    </div>
  );
}

function LoginScreen() {
  const supabase = getSupabase();
  const [mode, setMode] = useState('password'); // 'password' | 'code'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const reset = (next) => {
    setMode(next);
    setErr(null);
    setCodeSent(false);
    setResetSent(false);
    setCode('');
  };

  const signInPassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setErr(error.message);
    // success → onAuthStateChange updates the session
  };

  const sendCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setCodeSent(true);
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setErr(error.message);
    // success → onAuthStateChange updates the session
  };

  const sendReset = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/welcome` : undefined,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setResetSent(true);
  };

  return (
    <Centered>
      <div className="mb-5 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-sm">
          <Wifi size={18} />
        </span>
        <h1 className="text-sm font-semibold text-slate-800">FSG OS</h1>
      </div>

      {mode === 'reset' ? (
        resetSent ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-slate-600">
              If an account exists for <strong>{email}</strong>, a link to reset your password is on
              its way.
            </p>
            <Button variant="outline" className="w-full" onClick={() => reset('password')}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={sendReset} className="space-y-3">
            <p className="text-xs text-slate-500">
              Enter your email and we&apos;ll send a link to set a new password.
            </p>
            <Field label="Email">
              <TextInput
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </Field>
            {err && <p className="text-xs text-red-600">{err}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a reset link'}
            </Button>
            <button
              type="button"
              onClick={() => reset('password')}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-600"
            >
              Back to sign in
            </button>
          </form>
        )
      ) : (
        <>
          <div className="mb-4 flex rounded-lg border border-slate-200 bg-slate-100/80 p-1 text-xs font-medium">
        {[
          ['password', 'Password'],
          ['code', 'Email code'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => reset(id)}
            className={cn(
              'flex-1 rounded-md px-2 py-1.5 transition-all',
              mode === id ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-900/5' : 'text-slate-500'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'password' && (
        <form onSubmit={signInPassword} className="space-y-3">
          <Field label="Email">
            <TextInput
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign In'}
          </Button>
          <button
            type="button"
            onClick={() => reset('reset')}
            className="w-full text-center text-xs text-slate-400 hover:text-slate-600"
          >
            Forgot password?
          </button>
        </form>
      )}

      {mode === 'code' &&
        (codeSent ? (
          <form onSubmit={verifyCode} className="space-y-3">
            <p className="text-xs text-slate-500">
              We sent a login code to <strong>{email}</strong>. Enter it below (or click the link in
              the email).
            </p>
            <Field label="Login code">
              <TextInput
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
              />
            </Field>
            {err && <p className="text-xs text-red-600">{err}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Verifying…' : 'Verify & Sign In'}
            </Button>
            <button
              type="button"
              onClick={() => setCodeSent(false)}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-600"
            >
              Use a different email
            </button>
          </form>
        ) : (
          <form onSubmit={sendCode} className="space-y-3">
            <Field label="Email">
              <TextInput
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </Field>
            {err && <p className="text-xs text-red-600">{err}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a login code'}
            </Button>
          </form>
        ))}
        </>
      )}

      <p className="mt-4 text-center text-xs text-slate-400">
        Access is invite-only. Ask your team admin for an invitation.
      </p>
    </Centered>
  );
}

export default function AuthGuard({ children, requireSuperAdmin = false, requireAdmin = false }) {
  const { configured, loading, session, error, isSuperAdmin, isAdmin, signOut } = useSession();
  const router = useRouter();

  // Invite and password-recovery links are supposed to land on /welcome, but
  // when Supabase's redirect allowlist rejects that URL it falls back to the
  // Site URL and the tokens (or the failed-link error) arrive on whatever
  // page that is. Forward those landings to /welcome so the person always
  // gets the set-password screen — or a clear explanation — instead of being
  // silently dropped into the app.
  useEffect(() => {
    if (/type=(invite|recovery)|error_description=/.test(getInitialAuthHash())) {
      router.replace('/welcome');
    }
  }, [router]);

  // Local mode — no backend configured. Calculator is fully usable.
  if (!configured) return children;

  if (loading) {
    return (
      <Centered>
        <div className="flex items-center justify-center gap-2 text-slate-500">
          <Loader2 className="animate-spin" size={18} /> Loading…
        </div>
      </Centered>
    );
  }

  if (!session) return <LoginScreen />;

  if (error === 'no_team') {
    return (
      <Centered>
        <h2 className="mb-2 text-base font-semibold text-slate-800">You&apos;re not on a team yet</h2>
        <p className="text-sm text-slate-600">
          Your account isn&apos;t assigned to a team. Ask your administrator to add you, then sign in
          again.
        </p>
        <Button variant="outline" className="mt-4 w-full" onClick={signOut}>
          Sign out
        </Button>
      </Centered>
    );
  }

  if (requireSuperAdmin && !isSuperAdmin) {
    return (
      <Centered>
        <h2 className="mb-2 text-base font-semibold text-slate-800">Access Denied</h2>
        <p className="text-sm text-slate-600">This page is restricted to super administrators.</p>
      </Centered>
    );
  }

  if (requireAdmin && !isAdmin) {
    return (
      <Centered>
        <h2 className="mb-2 text-base font-semibold text-slate-800">Access Denied</h2>
        <p className="text-sm text-slate-600">This page is restricted to team administrators.</p>
      </Centered>
    );
  }

  return children;
}
