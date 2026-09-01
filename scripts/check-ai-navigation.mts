/**
 * End-to-end checks for AI health navigation and crowd forecasting.
 * LOCAL DATABASE ONLY — it uploads reports and books appointments.
 *
 * The point of most of these is isolation: a patient's uploaded medical report
 * is the most sensitive thing this system holds, so "another account cannot
 * reach it" is checked from the other account rather than assumed from the
 * query.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const url = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error('check:ai refuses to run: DATABASE_URL is not a local database.');
  process.exit(2);
}

const BASE = process.env.AI_CHECK_BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient({ datasources: { db: { url } } });

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean, extra = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
  cond ? pass++ : fail++;
};

async function api(p: string, o: any = {}) {
  const r = await fetch(BASE + p, {
    ...o,
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(o.headers || {}) },
  });
  let b: any = null; try { b = await r.json(); } catch { /* non-JSON */ }
  return { status: r.status, body: b };
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

/** A tiny but genuinely valid PDF with a readable text layer. */
function samplePdf(text: string): string {
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  objs.forEach((o, i) => { pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\n%%EOF`;
  return `data:application/pdf;base64,${Buffer.from(pdf, 'latin1').toString('base64')}`;
}

const textFile = (t: string) => `data:text/plain;base64,${Buffer.from(t, 'utf8').toString('base64')}`;

async function main() {
  const facility = await prisma.facility.findFirst();
  if (!facility) throw new Error('no facility in the local db');

  const password = 'ProbePass!2345';
  const hash = await bcrypt.hash(password, 10);
  const mk = (email: string, name: string, role: any) =>
    prisma.user.upsert({
      where: { email },
      update: { passwordHash: hash, role, tokenVersion: 0 },
      create: { email, passwordHash: hash, name, role },
    });

  const alice = await mk('ai-alice@probe.test', 'Alice Probe', 'VISITOR');
  const mallory = await mk('ai-mallory@probe.test', 'Mallory Probe', 'VISITOR');
  const admin = await mk('ai-admin@probe.test', 'AI Admin', 'ADMIN');
  const staff = await mk('ai-staff@probe.test', 'AI Staff', 'STAFF');

  // Clear anything an interrupted earlier run left behind.
  await prisma.aiNavigation.deleteMany({ where: { userId: { in: [alice.id, mallory.id] } } });
  await prisma.medicalReport.deleteMany({ where: { userId: { in: [alice.id, mallory.id] } } });

  const login = async (e: string) =>
    (await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: e, password }) })).body?.token as string;
  const aliceT = await login(alice.email);
  const malloryT = await login(mallory.email);
  const adminT = await login(admin.email);
  const staffT = await login(staff.email);

  console.log('1. a visitor can upload a report');
  const upload = await api('/api/visitor/reports', {
    method: 'POST', headers: auth(aliceT),
    body: JSON.stringify({
      title: 'Cardiology bloods', kind: 'Lab report', reportDate: '2026-08-20',
      file: samplePdf('Troponin elevated. Patient reports chest tightness on exertion.'),
    }),
  });
  ok('upload succeeds', upload.status === 200, `http=${upload.status} ${upload.body?.message ?? ''}`);
  const reportId = upload.body?.report?.id;
  ok('a report id comes back', !!reportId);
  ok('the storage key is NOT sent to the browser', !JSON.stringify(upload.body).includes('objectPath'));
  ok('text was extracted from the PDF', upload.body?.report?.hasText === true,
     `note=${upload.body?.report?.extractionNote ?? 'none'}`);

  console.log('\n2. uploads are validated by content, not by label');
  const disguised = await api('/api/visitor/reports', {
    method: 'POST', headers: auth(aliceT),
    body: JSON.stringify({ title: 'Bad', file: `data:application/pdf;base64,${Buffer.from('MZ\x90\x00 not a pdf').toString('base64')}` }),
  });
  ok('a non-PDF claiming to be a PDF is refused', disguised.status === 400, `http=${disguised.status}`);
  const banned = await api('/api/visitor/reports', {
    method: 'POST', headers: auth(aliceT),
    body: JSON.stringify({ title: 'Bad', file: `data:application/zip;base64,${Buffer.from('PK').toString('base64')}` }),
  });
  ok('an unsupported type is refused', banned.status === 400, `http=${banned.status}`);

  console.log("\n3. one patient cannot reach another's report");
  const listMallory = await api('/api/visitor/reports', { headers: auth(malloryT) });
  ok("Mallory's list does not contain it", !JSON.stringify(listMallory.body ?? {}).includes(reportId));
  const stealFile = await api(`/api/visitor/reports/${reportId}/file`, { headers: auth(malloryT) });
  ok('Mallory cannot open the file', stealFile.status === 404, `http=${stealFile.status}`);
  const stealNav = await api('/api/visitor/ai/navigate', {
    method: 'POST', headers: auth(malloryT),
    body: JSON.stringify({ reportId, symptoms: 'chest pain' }),
  });
  ok("Mallory cannot navigate using Alice's report", stealNav.status === 404, `http=${stealNav.status}`);
  const stealAsAdmin = await api(`/api/visitor/reports/${reportId}/file`, { headers: auth(adminT) });
  ok('not even an ADMIN can open it through this route', stealAsAdmin.status === 404, `http=${stealAsAdmin.status}`);

  console.log('\n4. the owner can read her own');
  const listAlice = await api('/api/visitor/reports', { headers: auth(aliceT) });
  ok('Alice sees exactly one report', (listAlice.body?.reports ?? []).length === 1);
  const openFile = await api(`/api/visitor/reports/${reportId}/file`, { headers: auth(aliceT) });
  ok('and can open it', openFile.status === 200 || openFile.status === 302, `http=${openFile.status}`);
  ok('anonymous access is refused', (await api(`/api/visitor/reports/${reportId}/file`)).status === 401);

  console.log('\n5. AI navigation returns a real department and real doctors');
  const nav = await api('/api/visitor/ai/navigate', {
    method: 'POST', headers: auth(aliceT),
    body: JSON.stringify({ reportId, symptoms: 'Chest tightness when walking upstairs for two weeks.' }),
  });
  ok('navigation responds 200', nav.status === 200, `http=${nav.status}`);
  if (nav.body?.failed) {
    console.log(`     (model unreachable: ${nav.body.failureReason}) — checking honest-failure behaviour instead`);
    ok('failure is reported, not faked', nav.body.department === null && !!nav.body.failureReason);
  } else {
    ok('a department was suggested', !!nav.body?.suggestedDepartment, nav.body?.suggestedDepartment);
    ok('it resolves to a real department of this facility', !!nav.body?.department,
       `matched=${nav.body?.department?.name ?? 'none'} unmatched=${nav.body?.unmatched}`);
    ok('a human-readable reason is given', typeof nav.body?.reason === 'string' && nav.body.reason.length > 10);
    ok('the model is named', !!nav.body?.model, nav.body?.model);
    ok('confidence is stated', ['low', 'medium', 'high'].includes(nav.body?.confidence));
    ok('doctors are suggested for it', Array.isArray(nav.body?.doctors) && nav.body.doctors.length > 0,
       `${nav.body?.doctors?.length ?? 0} doctor(s)`);
    const doc = nav.body?.doctors?.[0];
    if (doc) {
      ok('each doctor carries real scheduling facts', typeof doc.queueDepth === 'number'
        && typeof doc.estimatedWaitMinutes === 'number' && Array.isArray(doc.reasons));
      ok('and explains its ranking', doc.reasons.length > 0, doc.reasons.join('; '));
    }
  }
  ok('the disclaimer is always present', typeof nav.body?.disclaimer === 'string'
     && /not a medical diagnosis/i.test(nav.body.disclaimer));

  console.log('\n6. navigation needs something to work from');
  const empty = await api('/api/visitor/ai/navigate', {
    method: 'POST', headers: auth(aliceT), body: JSON.stringify({}),
  });
  ok('an empty request is refused', empty.status === 400, `http=${empty.status}`);

  console.log('\n7. history is per-patient');
  const histAlice = await api('/api/visitor/ai/navigations', { headers: auth(aliceT) });
  const histMallory = await api('/api/visitor/ai/navigations', { headers: auth(malloryT) });
  ok('Alice has history', (histAlice.body?.navigations ?? []).length >= 1);
  ok('Mallory has none of it', (histMallory.body?.navigations ?? []).length === 0);

  console.log('\n8. an image upload admits it cannot be read');
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const imgUpload = await api('/api/visitor/reports', {
    method: 'POST', headers: auth(aliceT),
    body: JSON.stringify({ title: 'Scan photo', file: `data:image/png;base64,${png.toString('base64')}` }),
  });
  ok('the image uploads', imgUpload.status === 200, `http=${imgUpload.status}`);
  ok('and says text could not be extracted', imgUpload.body?.report?.hasText === false
     && /OCR|Describe your symptoms/i.test(imgUpload.body?.report?.extractionNote ?? ''),
     imgUpload.body?.report?.extractionNote);

  console.log('\n9. plain text is read directly');
  const txt = await api('/api/visitor/reports', {
    method: 'POST', headers: auth(aliceT),
    body: JSON.stringify({ title: 'Notes', file: textFile('Persistent cough and mild fever for five days.') }),
  });
  ok('text uploads and extracts', txt.status === 200 && txt.body?.report?.hasText === true);

  console.log('\n10. crowd forecast is real and role-aware');
  const visForecast = await api('/api/crowd/forecast', { headers: auth(aliceT) });
  ok('a visitor may read the forecast', visForecast.status === 200, `http=${visForecast.status}`);
  ok('it is labelled as a queue model, not as AI',
     visForecast.body?.method === 'queueing-model' && !/gemini/i.test(JSON.stringify(visForecast.body)));
  ok('it states the basis of its numbers', ['observed', 'thin-data', 'insufficient-data']
     .includes(visForecast.body?.forecast?.basis), visForecast.body?.forecast?.basis);
  ok('it covers 15/30/60 minutes',
     (visForecast.body?.forecast?.horizons ?? []).map((h: any) => h.minutes).join(',') === '15,30,60');
  ok('a visitor gets NO operational instructions',
     (visForecast.body?.forecast?.recommendations ?? []).length === 0
     && visForecast.body?.capacity === undefined);

  const adminForecast = await api('/api/admin/crowd', { headers: auth(adminT) });
  ok('an admin may read the operations view', adminForecast.status === 200, `http=${adminForecast.status}`);
  ok('and gets recommendations', (adminForecast.body?.forecast?.recommendations ?? []).length > 0);
  ok('each recommendation gives its reason',
     (adminForecast.body?.forecast?.recommendations ?? []).every((r: any) => !!r.reason && !!r.action));
  ok('capacity is reported', typeof adminForecast.body?.capacity?.openCounters === 'number');

  console.log('\n11. the operations view is closed to everyone else');
  ok('a VISITOR is refused', (await api('/api/admin/crowd', { headers: auth(aliceT) })).status === 403);
  ok('STAFF is refused (no analytics:read)', (await api('/api/admin/crowd', { headers: auth(staffT) })).status === 403);
  ok('anonymous is refused', (await api('/api/admin/crowd')).status === 401);

  console.log('\n12. cleanup');
  await prisma.aiNavigation.deleteMany({ where: { userId: { in: [alice.id, mallory.id] } } });
  await prisma.medicalReport.deleteMany({ where: { userId: { in: [alice.id, mallory.id] } } });
  ok('probe data removed', true);

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => { console.error('check failed:', e); await prisma.$disconnect(); process.exit(1); });
