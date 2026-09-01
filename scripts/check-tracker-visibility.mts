/**
 * Live Patient Tracker visibility checks. LOCAL DATABASE ONLY — it books and
 * approves appointments.
 *
 * Covers the two defects that made a doctor's confirmation appear to do
 * nothing:
 *   1. /api/admin/tokens is scoped to today, so a booking approved for a later
 *      day vanished from every board until that day arrived.
 *   2. The tracker is offered to patients in the navigation but called a
 *      staff-only endpoint, so a patient was answered 403 and shown nothing.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const url = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error('check:tracker refuses to run: DATABASE_URL is not a local database.');
  process.exit(2);
}

const BASE = process.env.TRACKER_CHECK_BASE ?? 'http://localhost:3001';
const prisma = new PrismaClient({ datasources: { db: { url } } });

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean, extra = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
  cond ? pass++ : fail++;
};

async function api(p: string, o: any = {}) {
  const r = await fetch(BASE + p, { ...o, headers: { 'Content-Type': 'application/json', ...(o.headers || {}) } });
  let b: any = null; try { b = await r.json(); } catch { /* empty */ }
  return { status: r.status, body: b };
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function main() {
  const facility = await prisma.facility.findFirst();
  if (!facility) throw new Error('no facility in the local db');
  const doctorRow = await prisma.doctor.findFirst({ where: { facilityId: facility.id } });
  if (!doctorRow) throw new Error('no doctor in the local db');

  const password = 'ProbePass!2345';
  const hash = await bcrypt.hash(password, 10);
  const mk = (email: string, name: string, role: any) =>
    prisma.user.upsert({
      where: { email },
      update: { passwordHash: hash, role, tokenVersion: 0 },
      create: { email, passwordHash: hash, name, role },
    });

  const admin = await mk('trk-admin@probe.test', 'Trk Admin', 'ADMIN');
  const docUser = await mk('trk-doctor@probe.test', 'Trk Doctor', 'DOCTOR');
  await prisma.doctor.update({ where: { id: doctorRow.id }, data: { userId: docUser.id } });
  const visitor = await mk('trk-visitor@probe.test', 'Trk Visitor', 'VISITOR');

  const login = async (e: string) =>
    (await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: e, password }) })).body?.token as string;
  const adminT = await login(admin.email);
  const docT = await login(docUser.email);
  const visT = await login(visitor.email);

  // Leftovers from an interrupted earlier run occupy slots and skew the board.
  // Clearing at the start as well as the end makes the check independent of
  // whatever ran before it — it failed once in a sequence and passed alone,
  // which is exactly the flake this removes.
  await prisma.appointment.deleteMany({ where: { patientName: { startsWith: 'Trk ' } } });

  const { serviceDayKey } = await import('../lib/serviceDay.ts');
  const today = serviceDayKey();
  const later = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

  /** Book (optionally as the signed-in visitor) and have the doctor approve. */
  async function bookAndApprove(date: string, name: string, asVisitor: boolean) {
    const av = await api(`/api/visitor/doctors/${doctorRow!.id}/availability?date=${date}`);
    const time: string | undefined = (av.body?.availableTimes ?? []).slice(-1)[0];
    if (!time) throw new Error(`no free slot on ${date}`);

    const booked = await api('/api/visitor/appointments', {
      method: 'POST',
      ...(asVisitor ? { headers: auth(visT) } : {}),
      body: JSON.stringify({ doctorId: doctorRow!.id, date, time, patientName: name, phone: '9876500044', reasonForVisit: 'tracker check' }),
    });
    const code = booked.body?.appointment?.code ?? booked.body?.code;
    // Without this, a refused booking produced an undefined code and every
    // assertion below failed for a reason that had nothing to do with them.
    if (!code) {
      throw new Error(`booking failed on ${date} ${time}: http=${booked.status} ${booked.body?.message ?? ''}`);
    }

    const list = await api('/api/doctor/appointments', { headers: auth(docT) });
    const row = (list.body?.appointments ?? []).find((a: any) => a.code === code);
    if (!row) throw new Error(`the doctor cannot see ${code}, so it cannot be approved`);
    const appr = await api(`/api/doctor/appointments/${row.id}/status`, {
      method: 'POST', headers: auth(docT),
      body: JSON.stringify({ status: 'Approved', expectedVersion: row.version }),
    });
    return { code, approved: appr.status === 200 };
  }

  const find = (body: any, code: string) => (body?.tokens ?? []).find((t: any) => t.code === code);

  console.log("1. a booking approved for TODAY reaches the tracker");
  const todayAppt = await bookAndApprove(today, 'Trk Today', false);
  ok('the doctor could approve it', todayAppt.approved);
  const boardToday = await api('/api/queue/board', { headers: auth(adminT) });
  const rowToday = find(boardToday.body, todayAppt.code);
  ok('it is on the board', !!rowToday, todayAppt.code);
  ok('it is not marked as scheduled for a later day', rowToday?.scheduledFor === null);

  console.log('\n2. a booking approved for a LATER day also reaches the tracker');
  const laterAppt = await bookAndApprove(later, 'Trk Later', false);
  ok('the doctor could approve it', laterAppt.approved);
  const boardLater = await api('/api/queue/board', { headers: auth(adminT) });
  const rowLater = find(boardLater.body, laterAppt.code);
  ok('it is on the board — this is the bug that hid it', !!rowLater, laterAppt.code);
  ok('it carries the date it is for', rowLater?.scheduledFor === later, `scheduledFor=${rowLater?.scheduledFor}`);
  ok('it claims no queue position it does not have', rowLater?.peopleAhead === 0 && rowLater?.estWaitMin === 0);

  // The live queue itself stays today-only; that separation is the point.
  const adminTokens = await api('/api/admin/tokens', { headers: auth(adminT) });
  ok('the live queue itself still excludes later days',
     !JSON.stringify(adminTokens.body ?? {}).includes(laterAppt.code));
  ok('...while still including today', JSON.stringify(adminTokens.body ?? {}).includes(todayAppt.code));

  console.log('\n3. a patient can actually read the tracker');
  const boardVis = await api('/api/queue/board', { headers: auth(visT) });
  ok('a VISITOR is not refused', boardVis.status === 200, `http=${boardVis.status}`);
  ok('and sees the approved bookings', !!find(boardVis.body, laterAppt.code));
  // The old path, for contrast: still staff-only, as it should be.
  const visAdmin = await api('/api/admin/tokens', { headers: auth(visT) });
  ok('the staff endpoint still refuses a VISITOR', visAdmin.status === 403, `http=${visAdmin.status}`);

  console.log("\n4. other patients' names are withheld, the viewer's own is not");
  const someoneElse = find(boardVis.body, laterAppt.code);
  ok("another patient's name is masked", someoneElse?.patientName === `Patient ${laterAppt.code}`,
     `got "${someoneElse?.patientName}"`);
  ok('and it is not flagged as theirs', someoneElse?.isYours === false);

  const own = await bookAndApprove(later, 'Trk Owner', true);
  const boardOwn = await api('/api/queue/board', { headers: auth(visT) });
  const ownRow = find(boardOwn.body, own.code);
  ok('the patient finds their own booking', !!ownRow);
  ok('their own row shows their real name', ownRow?.patientName === 'Trk Owner', `got "${ownRow?.patientName}"`);
  ok('their own row is flagged', ownRow?.isYours === true);

  const staffBoard = await api('/api/queue/board', { headers: auth(adminT) });
  ok('staff still see real names', find(staffBoard.body, own.code)?.patientName === 'Trk Owner');

  await prisma.appointment.deleteMany({ where: { patientName: { startsWith: 'Trk ' } } });
  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => { console.error('check failed:', e); await prisma.$disconnect(); process.exit(1); });
