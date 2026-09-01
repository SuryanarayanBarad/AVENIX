/**
 * End-to-end shape trace against the LOCAL database only.
 * Asserts the fields the React components actually read are present in the
 * payloads the API returns — the check that would have caught the blank
 * Appointments tab.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Refuses to run against anything but a local database. This script books and
// approves real appointments, so pointing it at production would write into the
// live facility's schedule.
const url = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error('check:shapes refuses to run: DATABASE_URL is not a local database.');
  console.error('Run it against a local Postgres, e.g.');
  console.error('  DATABASE_URL=postgresql://$(whoami)@localhost:5432/queuemind npm run check:shapes');
  process.exit(2);
}

const BASE = 'http://localhost:3001';
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL! } },
});

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean, extra = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
  cond ? pass++ : fail++;
};

async function api(path: string, opts: any = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body };
}

async function login(email: string, password: string) {
  const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  return r.body?.token as string | undefined;
}

async function main() {
  const facility = await prisma.facility.findFirst();
  if (!facility) throw new Error('no facility in the local db');

  const password = 'ProbePass!2345';
  const hash = await bcrypt.hash(password, 10);

  // Probe accounts, confined to @probe.test so nothing real is touched.
  const admin = await prisma.user.upsert({
    where: { email: 'shape-admin@probe.test' },
    update: { passwordHash: hash, role: 'ADMIN' },
    create: { email: 'shape-admin@probe.test', passwordHash: hash, name: 'Shape Admin', role: 'ADMIN' },
  });

  const doctorRow = await prisma.doctor.findFirst({
    where: { facilityId: facility.id },
    include: { department: true },
  });
  if (!doctorRow) throw new Error('no doctor in the local db');

  // Bind a login to that doctor so the doctor-scoped routes resolve.
  const docUser = await prisma.user.upsert({
    where: { email: 'shape-doctor@probe.test' },
    update: { passwordHash: hash, role: 'DOCTOR' },
    create: { email: 'shape-doctor@probe.test', passwordHash: hash, name: 'Shape Doctor', role: 'DOCTOR' },
  });
  // Release any doctor row this probe account is already linked to.
  // Doctor.userId is unique, so a link left by an earlier run — possibly to a
  // different doctor, since findFirst is not ordered — makes this update fail
  // with P2002. Clearing first makes the check independent of what ran before.
  await prisma.doctor.updateMany({ where: { userId: docUser.id }, data: { userId: null } });
  await prisma.doctor.update({ where: { id: doctorRow.id }, data: { userId: docUser.id } });

  const adminToken = await login(admin.email, password);
  const docToken = await login(docUser.email, password);
  ok('admin signs in', !!adminToken);
  ok('doctor signs in', !!docToken);

  // ---- book an appointment as a member of the public -------------------
  // Book for TODAY: the queue board and the live tracker are today-scoped, so a
  // tomorrow booking would be absent from them for entirely correct reasons.
  const { serviceDayKey } = await import('../lib/serviceDay.ts');
  const date = serviceDayKey();
  // Ask the availability endpoint for a slot that is actually free, rather than
  // guessing one and tripping the slot-conflict guard.
  const avail = await api(`/api/visitor/doctors/${doctorRow.id}/availability?date=${date}`);
  // The endpoint returns `availableTimes`; reading `slots` silently produced an
  // empty list and fell back to a hardcoded time that happened to be free.
  const slots: string[] = (avail.body?.availableTimes ?? []).filter(Boolean);
  if (!slots.length) throw new Error('no free slot for the probe booking');
  const time = slots[slots.length - 1];
  console.log(`     ${slots.length} free slot(s); using ${time}`);
  const booking = await api('/api/visitor/appointments', {
    method: 'POST',
    body: JSON.stringify({
      doctorId: doctorRow.id,
      date, time,
      patientName: 'Shape Probe Patient',
      phone: '9876500011',
      reasonForVisit: 'Shape trace',
    }),
  });
  ok('visitor books an appointment', booking.status === 200 || booking.status === 201,
     `http=${booking.status} ${booking.body?.message ?? ''}`);
  const code = booking.body?.appointment?.code ?? booking.body?.code;
  console.log(`     booked code=${code} on ${date} ${time}`);

  // ---- 1. the admin Appointments tab ------------------------------------
  console.log('\n1. GET /api/admin/appointments — fields AppointmentsView reads');
  const adminList = await api(`/api/admin/appointments?date=${date}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  ok('admin list responds 200', adminList.status === 200, `http=${adminList.status}`);
  const row = (adminList.body?.appointments ?? []).find((a: any) => a.code === code);
  ok('the new appointment is in the admin list', !!row);

  if (row) {
    const REQUIRED = [
      'id', 'code', 'patientName', 'phoneMasked', 'doctorId', 'doctor', 'department',
      'service', 'date', 'time', 'rawTime', 'reasonForVisit', 'status', 'patientStatus',
      'statusReason', 'awaitingApproval', 'inQueue', 'version', 'bookedAtDesk',
    ];
    const missing = REQUIRED.filter((f) => !(f in row));
    ok('every StaffAppointment field is present', missing.length === 0, missing.join(', '));
    ok('time is display-formatted', /AM|PM/.test(String(row.time)), `time=${row.time}`);
    ok('a new booking starts Pending', row.status === 'Pending', `status=${row.status}`);
    ok('awaitingApproval flags it', row.awaitingApproval === true);
    ok('the phone is masked', !String(row.phoneMasked ?? '').includes('9876500011'), `phoneMasked=${row.phoneMasked}`);
  }

  // ---- 2. the doctor Requests tab ---------------------------------------
  console.log('\n2. GET /api/doctor/appointments — fields RequestsView reads');
  const docList = await api('/api/doctor/appointments', {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  ok('doctor list responds 200', docList.status === 200, `http=${docList.status}`);
  const docRow = (docList.body?.appointments ?? []).find((a: any) => a.code === code);
  ok('the doctor sees the request', !!docRow);

  if (docRow) {
    const REQUIRED = ['id', 'code', 'patientName', 'date', 'time', 'rawTime',
                      'department', 'reasonForVisit', 'status', 'version'];
    const missing = REQUIRED.filter((f) => !(f in docRow));
    ok('every DoctorAppointment field is present', missing.length === 0, missing.join(', '));
    ok('doctor time is display-formatted', /AM|PM/.test(String(docRow.time)), `time=${docRow.time}`);
    ok('the raw phone is not sent to the doctor', !('phone' in docRow), 'phone leaked');
    ok('status is Pending so Approve/Deny render', docRow.status === 'Pending', `status=${docRow.status}`);
  }

  // ---- 3. the doctor approves -------------------------------------------
  console.log('\n3. doctor approves');
  const approve = await api(`/api/doctor/appointments/${docRow.id}/status`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${docToken}` },
    body: JSON.stringify({ status: 'Approved', expectedVersion: docRow.version }),
  });
  ok('approve succeeds', approve.status === 200, `http=${approve.status} ${approve.body?.message ?? ''}`);

  // ---- 4. it survives a refresh, everywhere -----------------------------
  console.log('\n4. after approval — visibility across roles');
  const again = await api('/api/doctor/appointments', { headers: { Authorization: `Bearer ${docToken}` } });
  const stillThere = (again.body?.appointments ?? []).find((a: any) => a.code === code);
  ok('the doctor still sees it after a refresh', !!stillThere, `status=${stillThere?.status}`);
  ok('it is now Approved', stillThere?.status === 'Approved');
  ok('and it counts as in-queue', stillThere?.inQueue === true);

  const adminAgain = await api(`/api/admin/appointments?date=${date}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminRow2 = (adminAgain.body?.appointments ?? []).find((a: any) => a.code === code);
  ok('admin still sees it after approval', !!adminRow2, `status=${adminRow2?.status}`);
  ok('admin sees it as in-queue', adminRow2?.inQueue === true);

  // Live tracker / queue board
  const tokensRes = await api('/api/admin/tokens', { headers: { Authorization: `Bearer ${adminToken}` } });
  const onBoard = JSON.stringify(tokensRes.body ?? {}).includes(code);
  ok('it reaches the staff queue board', onBoard);

  const docQueue = await api('/api/doctor/queue', { headers: { Authorization: `Bearer ${docToken}` } });
  ok("it reaches the doctor's queue", JSON.stringify(docQueue.body ?? {}).includes(code));

  // ---- cleanup: remove only what this probe created ---------------------
  await prisma.appointment.deleteMany({ where: { patientName: 'Shape Probe Patient' } });

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error('trace failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
