/**
 * Role-aware AI experience checks. LOCAL DATABASE ONLY.
 *
 * The rule being defended: a visitor may SEE what the hospital's optimisation
 * did, and may never DO it. Both halves are checked from the visitor's own
 * session rather than inferred from the UI, because hiding a button is
 * presentation and the boundary has to be the API.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const url = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error('check:roles refuses to run: DATABASE_URL is not a local database.');
  process.exit(2);
}
const BASE = process.env.ROLE_CHECK_BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient({ datasources: { db: { url } } });

let pass = 0, fail = 0;
const ok = (l: string, c: boolean, e = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${l}${e ? ' — ' + e : ''}`); c ? pass++ : fail++; };

async function api(p: string, o: any = {}) {
  const r = await fetch(BASE + p, { ...o, headers: { 'Content-Type': 'application/json', ...(o.headers || {}) } });
  let b: any = null; try { b = await r.json(); } catch {}
  return { status: r.status, body: b };
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function main() {
  const password = 'ProbePass!2345';
  const hash = await bcrypt.hash(password, 10);
  const mk = (email: string, name: string, role: any) =>
    prisma.user.upsert({ where: { email }, update: { passwordHash: hash, role, tokenVersion: 0 }, create: { email, passwordHash: hash, name, role } });

  const visitor = await mk('role-visitor@probe.test', 'Role Visitor', 'VISITOR');
  const staff = await mk('role-staff@probe.test', 'Role Staff', 'STAFF');
  const doctor = await mk('role-doctor@probe.test', 'Role Doctor', 'DOCTOR');
  const admin = await mk('role-admin@probe.test', 'Role Admin', 'ADMIN');

  const login = async (e: string) => (await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: e, password }) })).body?.token as string;
  const V = await login(visitor.email), S = await login(staff.email), D = await login(doctor.email), A = await login(admin.email);

  const svc = (await api('/api/visitor/services')).body.services[0];

  console.log('1. a visitor can SEE operational results');
  const ins = await api('/api/visitor/insights', { headers: auth(V) });
  ok('insights readable', ins.status === 200, `http=${ins.status}`);
  ok('queues include desks open', (ins.body?.queues ?? []).every((q: any) => typeof q.openCounters === 'number'));
  ok('crowd forecast is included', Array.isArray(ins.body?.crowd?.horizons) && ins.body.crowd.horizons.length === 3);
  ok('queue policy is explained', Array.isArray(ins.body?.policy) && ins.body.policy.length >= 2);
  ok('labelled as a queue model, not as AI', ins.body?.method === 'queueing-model');

  console.log('\n2. and nothing about anyone else');
  const raw = JSON.stringify(ins.body);
  ok('no operational rates leak', !/arrivalRatePerMin|serviceRatePerMin|netGrowth/.test(raw));
  ok('no staff or recommendations leak', !/recommendation|staffName|actionable/i.test(raw));
  ok('no patient names leak', !/patientName|visitorName|phone/i.test(raw));

  console.log('\n3. a visitor can NEVER execute');
  const mutations: [string, string, any][] = [
    ['POST', `/api/admin/services/${svc.id}/counters`, { openCounters: 5 }],
    ['GET', '/api/admin/crowd', null],
    ['GET', '/api/admin/tokens', null],
    ['GET', '/api/super-admin/users', null],
    ['GET', '/api/super-admin/audit-logs', null],
    ['GET', '/api/admin/appointments', null],
  ];
  for (const [method, path, body] of mutations) {
    const r = await api(path, { method, headers: auth(V), ...(body ? { body: JSON.stringify(body) } : {}) });
    ok(`${method} ${path} refused`, r.status === 403 || r.status === 401, `http=${r.status}`);
  }
  const retired = await api('/api/copilot/optimize', { method: 'POST', headers: auth(V), body: JSON.stringify({ counters: [] }) });
  ok('the old optimize endpoint refuses a visitor', retired.status === 410 && /administrators/i.test(retired.body?.message ?? ''), `http=${retired.status}`);
  ok('and is no longer reachable anonymously', (await api('/api/copilot/optimize', { method: 'POST', body: '{}' })).status === 401);

  console.log('\n4. an admin CAN execute, and the visitor sees the result');
  const before = (await api('/api/visitor/insights', { headers: auth(V) })).body.queues.find((q: any) => q.id === svc.id);
  const applied = await api(`/api/admin/services/${svc.id}/counters`, { method: 'POST', headers: auth(A), body: JSON.stringify({ openCounters: (before.openCounters ?? 1) + 2 }) });
  ok('admin change accepted', applied.status === 200, `http=${applied.status}`);
  ok('the server reports a measured before/after',
     typeof applied.body?.impact?.beforeWaitMinutes === 'number' && typeof applied.body?.impact?.afterWaitMinutes === 'number',
     JSON.stringify(applied.body?.impact));
  const after = (await api('/api/visitor/insights', { headers: auth(V) })).body.queues.find((q: any) => q.id === svc.id);
  ok('the visitor now sees the new desk count', after.openCounters === before.openCounters + 2, `${before.openCounters} -> ${after.openCounters}`);
  if (before.waiting > 0) {
    ok('and a shorter wait', after.estimatedWaitMinutes < before.estimatedWaitMinutes, `${before.estimatedWaitMinutes} -> ${after.estimatedWaitMinutes} min`);
  } else {
    ok('wait stays 0 with an empty queue (no invented improvement)', after.estimatedWaitMinutes === 0);
  }
  ok('the change is audited', (await prisma.auditLog.count({ where: { action: 'service_counters_changed' } })) > 0);
  await api(`/api/admin/services/${svc.id}/counters`, { method: 'POST', headers: auth(A), body: JSON.stringify({ openCounters: before.openCounters }) });

  console.log('\n5. the overview is reachable by every role');
  // The tab is open to all; what each role SEES there differs. A patient must
  // never be handed the operational overview's data or its Apply button.
  const { visibleTabs, hasPermission } = await import('../lib/permissions.ts');
  for (const r of ['VISITOR', 'STAFF', 'DOCTOR', 'ADMIN', 'SUPER_ADMIN']) {
    ok(`${r} can open overview`, visibleTabs(r).includes('overview' as any));
  }
  // The overview and predictions screens are the same for everyone: both render
  // from mockData with no API call and no server write, so there is nothing on
  // them to withhold. Only the Apply action is gated, on queue:read.
  ok('a VISITOR is not offered the Apply action', !hasPermission('VISITOR', 'queue:read' as any));
  ok('a DOCTOR is not offered it either', !hasPermission('DOCTOR', 'queue:read' as any));
  ok('STAFF and ADMIN are', hasPermission('STAFF', 'queue:read' as any) && hasPermission('ADMIN', 'queue:read' as any));
  // Opening the tab must not open the data behind the operational version.
  ok('the visitor still cannot read the staff queue board',
     (await api('/api/admin/tokens', { headers: auth(V) })).status === 403);

  // Predictions: reachable by all, but the operational version is analytics
  // only. Branching this on queue:read would have handed STAFF an analytics
  // screen the matrix withholds from them.
  for (const r of ['VISITOR', 'STAFF', 'DOCTOR', 'ADMIN', 'SUPER_ADMIN']) {
    ok(`${r} can open ai-predictions`, visibleTabs(r).includes('ai-predictions' as any));
  }
  ok('analytics:read still separates STAFF from ADMIN', !hasPermission('STAFF', 'analytics:read' as any)
     && hasPermission('ADMIN', 'analytics:read' as any));
  ok('opening the tab grants no analytics data to a visitor',
     (await api('/api/admin/crowd', { headers: auth(V) })).status === 403);

  console.log('\n6. the copilot is available to every role');
  for (const [label, token] of [['VISITOR', V], ['STAFF', S], ['DOCTOR', D], ['ADMIN', A]] as const) {
    const r = await api('/api/copilot/suggestions', { headers: auth(token) });
    ok(`${label} gets suggestions`, r.status === 200 && Array.isArray(r.body?.suggestions) && r.body.suggestions.length > 0, `http=${r.status}`);
  }
  ok('anonymous still refused', (await api('/api/copilot/suggestions')).status === 401);

  console.log("\n7. the visitor's copilot snapshot is scoped to them");
  const vs = await api('/api/copilot/suggestions', { headers: auth(V) });
  const snap = JSON.stringify(vs.body?.snapshot ?? {});
  ok('it identifies the viewer as a patient', vs.body?.snapshot?.viewer === 'patient', vs.body?.snapshot?.viewer);
  ok('it carries their own queue and appointments', 'yourQueue' in (vs.body?.snapshot ?? {}) && 'yourAppointments' in (vs.body?.snapshot ?? {}));
  ok('it does NOT carry the doctor roster', !/doctors"|doctorCount/.test(snap));
  ok('it does NOT carry appointment status counts', !/appointmentsToday/.test(snap));

  const as = await api('/api/copilot/suggestions', { headers: auth(A) });
  ok('an operator still gets the facility snapshot', /doctors|appointmentsToday/.test(JSON.stringify(as.body?.snapshot ?? {})));

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { console.error('check failed:', e); await prisma.$disconnect(); process.exit(1); });
