/**
 * Minimal production bootstrap.
 *
 * Creates only the reference data the app cannot function without — one
 * facility, its services, and a starting set of specializations. It creates NO
 * user accounts: the SUPER_ADMIN is bootstrapped from SUPER_ADMIN_EMAIL /
 * SUPER_ADMIN_PASSWORD when the server starts, and doctors are assigned from
 * the Super Admin dashboard.
 *
 * Safe to re-run: every write is an upsert.
 *
 *   npx tsx prisma/bootstrap.ts
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

// Schema changes go through the direct connection, and so does this: the
// transaction pooler is not meant for long-running setup work.
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

const SERVICES = [
  { id: 'general-consultation', name: 'General Consultation', description: 'OPD checkups, seasonal illness and general triage', estimatedWaitMinutes: 18, defaultCounterName: 'Counter 04' },
  { id: 'registration', name: 'Registration', description: 'Hospital ID creation, file lookup and insurance intake', estimatedWaitMinutes: 5, defaultCounterName: 'Counter 01' },
  { id: 'billing', name: 'Billing', description: 'Payments, claims, settlement and discharge', estimatedWaitMinutes: 8, defaultCounterName: 'Counter 02' },
  { id: 'pharmacy', name: 'Pharmacy', description: 'Prescription fulfilment and medication dispensing', estimatedWaitMinutes: 28, defaultCounterName: 'Counter 03' },
  { id: 'diagnostics', name: 'Diagnostics', description: 'Lab tests, scans and sample collection', estimatedWaitMinutes: 15, defaultCounterName: 'Counter 05' },
  { id: 'other-services', name: 'Other Services', description: 'Anything not covered by the desks above', estimatedWaitMinutes: 12, defaultCounterName: 'Counter 06' },
];

const SPECIALIZATIONS = [
  'General Medicine', 'Cardiology', 'Pediatrics', 'Orthopaedics',
  'Dermatology', 'ENT (Otolaryngology)', 'Gynaecology', 'Diagnostics',
];

async function main() {
  // Adopt the existing facility whatever its slug — the app always reads the
  // oldest one, so creating a second under a fixed slug would split the data.
  const existing = await prisma.facility.findFirst({ orderBy: { createdAt: 'asc' } });
  const facility = existing ?? await prisma.facility.create({
    data: {
      name: 'CityCare Central Hospital',
      slug: 'citycare-central',
      address: 'Ground & Triage Wing',
    },
  });
  console.log(`✅ Facility: ${facility.name}${existing ? ' (existing)' : ' (created)'}`);

  for (const service of SERVICES) {
    await prisma.service.upsert({
      where: { facilityId_name: { facilityId: facility.id, name: service.name } },
      update: {
        description: service.description,
        estimatedWaitMinutes: service.estimatedWaitMinutes,
        defaultCounterName: service.defaultCounterName,
      },
      create: { ...service, facilityId: facility.id },
    });
  }
  console.log(`✅ Services: ${SERVICES.length}`);

  // Every service must name a desk, otherwise a visitor is handed a token that
  // does not say where to go. Any service created outside this list (or by an
  // older seed) gets the next free counter number.
  const missing = await prisma.service.findMany({
    where: { facilityId: facility.id, OR: [{ defaultCounterName: null }, { defaultCounterName: '' }] },
    orderBy: { createdAt: 'asc' },
  });
  if (missing.length > 0) {
    const used = new Set(
      (await prisma.service.findMany({ where: { facilityId: facility.id }, select: { defaultCounterName: true } }))
        .map((s) => s.defaultCounterName)
        .filter(Boolean) as string[],
    );
    let next = 1;
    for (const service of missing) {
      while (used.has(`Counter ${String(next).padStart(2, '0')}`)) next += 1;
      const counter = `Counter ${String(next).padStart(2, '0')}`;
      used.add(counter);
      await prisma.service.update({ where: { id: service.id }, data: { defaultCounterName: counter } });
      console.log(`   ↳ assigned ${counter} to "${service.name}"`);
    }
  }

  for (const name of SPECIALIZATIONS) {
    await prisma.department.upsert({
      where: { facilityId_name: { facilityId: facility.id, name } },
      update: {},
      create: { name, facilityId: facility.id },
    });
  }
  console.log(`✅ Specializations: ${SPECIALIZATIONS.length}`);

  console.log('\nNo accounts were created. Start the server to bootstrap your');
  console.log('SUPER_ADMIN from .env, then assign doctors from the dashboard.');
}

main()
  .catch((error) => { console.error('Bootstrap failed:', error); process.exit(1); })
  .finally(() => prisma.$disconnect());
