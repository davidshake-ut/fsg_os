'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

// Fire-and-forget visit tracking (throttled to at most one row per user per
// hour via localStorage) — powers the Members table's activity column
// (migration 0051). Must never interfere with session resolution.
function logVisit(supabase, profile) {
  if (!supabase || !profile?.company_id) return;
  try {
    const key = `fsg_visit_logged:${profile.id}`;
    const last = Number(localStorage.getItem(key) || 0);
    if (Date.now() - last < 60 * 60 * 1000) return;
    localStorage.setItem(key, String(Date.now()));
    void supabase
      .from('access_log')
      .insert({ company_id: profile.company_id, user_id: profile.id })
      .then(() => {});
    void supabase
      .from('users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', profile.id)
      .then(() => {});
  } catch {
    // tracking is best-effort
  }
}

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
        logVisit(supabase, profile);

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
    // 'viewer' = view-only member: sees the team's data, cannot create/edit/
    // delete anything (enforced DB-side by 0049's triggers; UI hides the
    // affordances). canWrite is true in local mode / for every other role.
    isViewer: user?.role === 'viewer',
    canWrite: user?.role !== 'viewer',
    loading,
    error,
    refresh,
    signOut,
  };
}
