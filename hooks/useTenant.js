'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

// Resolves the signed-in user, their role, and their team (company).
//   1. load public.users (role, company_id)
//   2. super_admin → no single team (sees all)
//   3. company_id set → load that team
//   4. no company_id → 'no_team' (awaiting assignment by an admin)
// Membership is invite-based; there is no email-domain matching.
export function useTenant() {
  const supabase = getSupabase();
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState(null);
  // Monotonic token: rapid auth events can launch overlapping resolutions that
  // finish out of order. Only the latest call may write state — a stale one
  // (superseded, or fired after unmount) becomes a no-op.
  const reqId = useRef(0);

  const resolve = useCallback(
    async (activeSession) => {
      const myId = ++reqId.current;
      const fresh = () => myId === reqId.current;
      if (!supabase || !activeSession) {
        if (fresh()) {
          setUser(null);
          setCompany(null);
          setLoading(false);
        }
        return;
      }
      if (fresh()) {
        setLoading(true);
        setError(null);
      }
      try {
        const authId = activeSession.user.id;
        const { data: profile, error: pErr } = await supabase
          .from('users')
          .select('*')
          .eq('id', authId)
          .single();
        if (pErr) throw pErr;
        if (!fresh()) return;
        setUser(profile);

        // Resolve the team for ANY role with a company_id (a super admin may
        // also belong to a team to use the per-team features). A non-super user
        // with no team is awaiting assignment.
        if (profile.company_id) {
          const { data: comp, error: cErr } = await supabase
            .from('companies')
            .select('*')
            .eq('id', profile.company_id)
            .single();
          // PGRST116 = "no rows" (company genuinely missing); anything else is a
          // real failure and must surface as such, not be mislabeled 'no_team'.
          if (cErr && cErr.code !== 'PGRST116') throw cErr;
          if (!fresh()) return;
          setCompany(comp || null);
          if (!comp && profile.role !== 'super_admin') setError('no_team');
        } else {
          if (!fresh()) return;
          setCompany(null);
          if (profile.role !== 'super_admin') setError('no_team');
        }
      } catch (e) {
        if (fresh()) setError(e.message || 'resolution_failed');
      } finally {
        if (fresh()) setLoading(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      resolve(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      resolve(s);
    });
    return () => {
      active = false;
      reqId.current += 1; // invalidate any in-flight resolution after unmount
      sub.subscription.unsubscribe();
    };
  }, [supabase, resolve]);

  const refresh = useCallback(() => resolve(session), [resolve, session]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
  }, [supabase]);

  return {
    configured: isSupabaseConfigured,
    session,
    user,
    company,
    role: user?.role || null,
    isSuperAdmin: user?.role === 'super_admin',
    isAdmin: user?.role === 'company_admin' || user?.role === 'super_admin',
    loading,
    error,
    refresh,
    signOut,
  };
}
