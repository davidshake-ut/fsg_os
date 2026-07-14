'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wifi, Loader2, CheckCircle2 } from 'lucide-react';
import { getSupabase, getInitialAuthHash } from '@/lib/supabase/client';
import { Card, Button, TextInput, Field } from '@/components/ui/primitives';

// Landing page for invite (and password-recovery) links. The link establishes a
// session via the token in the URL; here the user sets a password, then enters
// the app. After this they can sign in with email+password or an email code.
export default function WelcomePage() {
  const supabase = getSupabase();
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // When a link fails (expired, already used), Supabase reports why in the
  // URL hash — surface the reason instead of only the generic message. The
  // hash is fixed for the life of the page, so this derives on render (it
  // only shows inside the post-hydration !hasSession branch).
  const linkError = (() => {
    const h = getInitialAuthHash() || (typeof window !== 'undefined' ? window.location.hash : '');
    const m = /error_description=([^&]+)/.exec(h);
    if (!m) return null;
    try {
      return decodeURIComponent(m[1].replace(/\+/g, ' '));
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setHasSession(!!data.session);
      setEmail(data.session?.user?.email || '');
      setReady(true);
    });
    // The token in the URL is processed asynchronously — react to it.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setHasSession(!!s);
      setEmail(s?.user?.email || '');
      setReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) return setErr('Password must be at least 8 characters.');
    if (pw !== pw2) return setErr('Passwords do not match.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr(error.message);
    setDone(true);
    setTimeout(() => router.push('/'), 1400);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f7f9] p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-sm">
            <Wifi size={18} />
          </span>
          <h1 className="text-sm font-semibold text-slate-800">Set your password</h1>
        </div>

        {!supabase ? (
          <p className="text-sm text-slate-600">Team mode isn&apos;t configured on this instance.</p>
        ) : !ready ? (
          <div className="flex items-center justify-center gap-2 py-6 text-slate-500">
            <Loader2 className="animate-spin" size={18} /> Verifying your link…
          </div>
        ) : done ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle2 className="text-emerald-500" size={28} />
            <p className="text-sm font-medium text-slate-700">Password set — taking you in…</p>
          </div>
        ) : !hasSession ? (
          <div className="space-y-3">
            {linkError && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {linkError}
              </p>
            )}
            <p className="text-sm text-slate-600">
              This link is invalid or has expired. Request a new invite or password reset, or sign in
              with an email login code.
            </p>
            <Button variant="outline" className="w-full" onClick={() => router.push('/')}>
              Go to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {email && (
              <p className="text-xs text-slate-500">
                Setting a password for <strong>{email}</strong>.
              </p>
            )}
            <Field label="New password">
              <TextInput
                type="password"
                required
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="At least 8 characters"
              />
            </Field>
            <Field label="Confirm password">
              <TextInput
                type="password"
                required
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder="Re-enter password"
              />
            </Field>
            {err && <p className="text-xs text-red-600">{err}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Saving…' : 'Set password & continue'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
