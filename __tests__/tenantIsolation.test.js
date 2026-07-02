// Integration tests for the multi-tenant boundary: two users on two teams
// must never see or touch each other's rows, regardless of client-side
// filters. Runs against a real Supabase project and is skipped unless the
// required env vars are present:
//
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//
// Run with:  npx vitest run __tests__/tenantIsolation.test.js
// (Use a staging project, not production — it creates and deletes test rows.)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(URL && ANON && SERVICE);

const TIMEOUT = 30_000;
const STAMP = Date.now();
const PASSWORD = `test-pass-${STAMP}!A1`;

describe.skipIf(!configured)('tenant isolation', () => {
  let svc;
  const teams = {}; // { a: companyRow, b: companyRow }
  const users = {}; // { a: { id, client }, b: { id, client } }
  let accountA; // crm account created by user A

  beforeAll(async () => {
    svc = createClient(URL, SERVICE, { auth: { persistSession: false } });

    for (const key of ['a', 'b']) {
      const { data: company, error: cErr } = await svc
        .from('companies')
        .insert({ name: `__isolation_test_${key}_${STAMP}` })
        .select()
        .single();
      if (cErr) throw cErr;
      teams[key] = company;

      const email = `isolation-${key}-${STAMP}@test.invalid`;
      const { data: authUser, error: uErr } = await svc.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (uErr) throw uErr;

      // A signup trigger may or may not have created the profile row; upsert
      // covers both cases and assigns the team.
      const { error: pErr } = await svc.from('users').upsert({
        id: authUser.user.id,
        email,
        role: 'user',
        company_id: company.id,
      });
      if (pErr) throw pErr;

      const client = createClient(URL, ANON, { auth: { persistSession: false } });
      const { error: sErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
      if (sErr) throw sErr;
      users[key] = { id: authUser.user.id, client };
    }
  }, TIMEOUT);

  afterAll(async () => {
    if (!svc) return;
    for (const key of ['a', 'b']) {
      if (teams[key]) await svc.from('companies').delete().eq('id', teams[key].id);
      if (users[key]) await svc.auth.admin.deleteUser(users[key].id).catch(() => {});
    }
  }, TIMEOUT);

  it('user A can create a CRM account in their own team', async () => {
    const { data, error } = await users.a.client
      .from('crm_accounts')
      .insert({ company_id: teams.a.id, created_by: users.a.id, name: 'A Corp', type: 'other', status: 'prospect' })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data.company_id).toBe(teams.a.id);
    accountA = data;
  }, TIMEOUT);

  it("user B cannot read team A's CRM accounts", async () => {
    const { data, error } = await users.b.client.from('crm_accounts').select('*');
    expect(error).toBeNull();
    expect(data.some((r) => r.company_id === teams.a.id)).toBe(false);
  }, TIMEOUT);

  it("user B cannot read team A's account even by id", async () => {
    const { data } = await users.b.client.from('crm_accounts').select('*').eq('id', accountA.id);
    expect(data).toEqual([]);
  }, TIMEOUT);

  it("user B cannot insert a row into team A", async () => {
    const { error } = await users.b.client
      .from('crm_accounts')
      .insert({ company_id: teams.a.id, created_by: users.b.id, name: 'Injected', type: 'other', status: 'prospect' });
    expect(error).not.toBeNull();
  }, TIMEOUT);

  it("user B cannot update team A's row", async () => {
    await users.b.client.from('crm_accounts').update({ name: 'Hacked' }).eq('id', accountA.id);
    const { data } = await svc.from('crm_accounts').select('name').eq('id', accountA.id).single();
    expect(data.name).toBe('A Corp');
  }, TIMEOUT);

  it("user B cannot delete team A's row", async () => {
    await users.b.client.from('crm_accounts').delete().eq('id', accountA.id);
    const { data } = await svc.from('crm_accounts').select('id').eq('id', accountA.id);
    expect(data).toHaveLength(1);
  }, TIMEOUT);

  it('support tickets are isolated between teams', async () => {
    const { error: insErr } = await users.a.client
      .from('support_tickets')
      .insert({ company_id: teams.a.id, created_by: users.a.id, title: 'A ticket', status: 'open', priority: 'medium' });
    expect(insErr).toBeNull();

    const { data } = await users.b.client.from('support_tickets').select('*');
    expect(data.some((r) => r.company_id === teams.a.id)).toBe(false);
  }, TIMEOUT);

  it('PSA projects are isolated between teams', async () => {
    const { error: insErr } = await users.a.client
      .from('psa_projects')
      .insert({ company_id: teams.a.id, created_by: users.a.id, name: 'A project', status: 'planning' });
    expect(insErr).toBeNull();

    const { data } = await users.b.client.from('psa_projects').select('*');
    expect(data.some((r) => r.company_id === teams.a.id)).toBe(false);
  }, TIMEOUT);

  it('invoices are isolated between teams', async () => {
    const { error: insErr } = await users.a.client
      .from('invoices')
      .insert({ company_id: teams.a.id, created_by: users.a.id, invoice_number: `INV-TEST-${STAMP}`, title: 'A invoice' });
    expect(insErr).toBeNull();

    const { data } = await users.b.client.from('invoices').select('*');
    expect(data.some((r) => r.company_id === teams.a.id)).toBe(false);
  }, TIMEOUT);

  it("a user cannot escalate their own role", async () => {
    await users.a.client.from('users').update({ role: 'super_admin' }).eq('id', users.a.id);
    const { data } = await svc.from('users').select('role').eq('id', users.a.id).single();
    expect(data.role).toBe('user');
  }, TIMEOUT);

  it("a user cannot move themselves to another team", async () => {
    await users.a.client.from('users').update({ company_id: teams.b.id }).eq('id', users.a.id);
    const { data } = await svc.from('users').select('company_id').eq('id', users.a.id).single();
    expect(data.company_id).toBe(teams.a.id);
  }, TIMEOUT);
});

// Always-on smoke test so the file never reports "no tests" when env is absent.
describe('tenant isolation preconditions', () => {
  it('documents required env vars when skipped', () => {
    if (!configured) {
      console.warn('tenantIsolation: skipped — set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY to run.');
    }
    expect(true).toBe(true);
  });
});
