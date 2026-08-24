/**
 * Prisma seed script for QueueMind AI development/demo data.
 *
 * Run with: npx prisma db seed
 *
 * Creates:
 * - 1 Facility (CityCare Hospital)
 * - 4 Departments
 * - 4 Doctors (matching existing server.ts doctors array)
 * - 6 Services (matching existing server.ts visitorServices array)
 * - 2 Demo users (admin + staff, bcrypt-hashed passwords)
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();


/**
 * Demo seed — development only.
 *
 * This creates accounts with well-known passwords (admin123, staff123 …), which
 * must never exist on a deployed database. Running it against anything that is
 * not an obviously local connection is refused. Use `prisma/bootstrap.ts` for a
 * real environment: it creates reference data and no accounts at all.
 */
function assertLocalDatabase() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL || '';
  const isLocal = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);
  if (!isLocal && process.env.ALLOW_REMOTE_SEED !== 'true') {
    console.error('\n❌ Refusing to seed: DATABASE_URL does not look local.');
    console.error('   This seed creates demo accounts with known passwords.');
    console.error('   For a deployed database run:  npx tsx prisma/bootstrap.ts');
    console.error('   To override deliberately:      ALLOW_REMOTE_SEED=true\n');
    process.exit(1);
  }
}

async function main() {
  assertLocalDatabase();
  console.log('🌱 Seeding QueueMind AI database...');

  // -----------------------------------------------------------------------
  // Facility
  // -----------------------------------------------------------------------
  const facility = await prisma.facility.upsert({
    where: { slug: 'citycare-hospital' },
    update: {},
    create: {
      id: 'citycare-hospital',
      name: 'CityCare Hospital',
      slug: 'citycare-hospital',
      address: '100 Healthcare Avenue, Metro City',
      nextWalkInNumber: 184,
      nextAppointmentNumber: 2841,
    },
  });
  console.log(`  ✅ Facility: ${facility.name}`);

  // -----------------------------------------------------------------------
  // Departments
  // -----------------------------------------------------------------------
  const departmentData = [
    { id: 'dept-general-medicine', name: 'General Medicine' },
    { id: 'dept-pediatrics', name: 'Pediatrics' },
    { id: 'dept-cardiology', name: 'Cardiology' },
    { id: 'dept-diagnostics', name: 'Diagnostics' },
  ];

  for (const dept of departmentData) {
    await prisma.department.upsert({
      where: { facilityId_name: { facilityId: facility.id, name: dept.name } },
      update: {},
      create: {
        id: dept.id,
        name: dept.name,
        facilityId: facility.id,
      },
    });
  }
  console.log(`  ✅ Departments: ${departmentData.length} created`);

  // -----------------------------------------------------------------------
  // Doctors (matching existing server.ts doctors array IDs)
  // -----------------------------------------------------------------------
  const doctorData = [
    { id: 'dr-sharma', name: 'Sharma', departmentId: 'dept-general-medicine' },
    { id: 'dr-iyer', name: 'Iyer', departmentId: 'dept-pediatrics' },
    { id: 'dr-khan', name: 'Khan', departmentId: 'dept-cardiology' },
    { id: 'dr-mehta', name: 'Mehta', departmentId: 'dept-diagnostics' },
  ];

  for (const doc of doctorData) {
    await prisma.doctor.upsert({
      where: { id: doc.id },
      update: { name: doc.name, departmentId: doc.departmentId },
      create: {
        id: doc.id,
        name: doc.name,
        facilityId: facility.id,
        departmentId: doc.departmentId,
      },
    });
  }
  console.log(`  ✅ Doctors: ${doctorData.length} created`);

  // -----------------------------------------------------------------------
  // Services (matching existing server.ts visitorServices array IDs)
  // -----------------------------------------------------------------------
  const serviceData = [
    {
      id: 'general-consultation',
      name: 'General Consultation',
      description: 'General health concerns and triage',
      estimatedWaitMinutes: 12,
      peopleWaiting: 7,
      defaultCounterName: null,
    },
    {
      id: 'registration',
      name: 'Registration',
      description: 'New patient registration and records',
      estimatedWaitMinutes: 5,
      peopleWaiting: 2,
      defaultCounterName: 'Counter 05',
    },
    {
      id: 'billing',
      name: 'Billing',
      description: 'Payments, insurance, and discharge billing',
      estimatedWaitMinutes: 8,
      peopleWaiting: 4,
      defaultCounterName: 'Counter 06',
    },
    {
      id: 'pharmacy',
      name: 'Pharmacy',
      description: 'Prescription collection and medicines',
      estimatedWaitMinutes: 18,
      peopleWaiting: 11,
      defaultCounterName: 'Counter 03',
    },
    {
      id: 'diagnostics',
      name: 'Diagnostics',
      description: 'Lab tests, scans, and sample collection',
      estimatedWaitMinutes: 15,
      peopleWaiting: 8,
      defaultCounterName: null,
    },
    {
      id: 'other',
      name: 'Other Services',
      description: 'Get help with another available facility service',
      estimatedWaitMinutes: 10,
      peopleWaiting: 3,
      defaultCounterName: null,
    },
  ];

  for (const svc of serviceData) {
    await prisma.service.upsert({
      where: { facilityId_name: { facilityId: facility.id, name: svc.name } },
      update: {},
      create: {
        id: svc.id,
        name: svc.name,
        description: svc.description,
        estimatedWaitMinutes: svc.estimatedWaitMinutes,
        peopleWaiting: svc.peopleWaiting,
        defaultCounterName: svc.defaultCounterName,
        facilityId: facility.id,
      },
    });
  }
  console.log(`  ✅ Services: ${serviceData.length} created`);

  // -----------------------------------------------------------------------
  // Demo Users (passwords bcrypt-hashed, never stored in plaintext)
  // -----------------------------------------------------------------------
  const adminHash = await bcrypt.hash('admin123', 12);
  const staffHash = await bcrypt.hash('staff123', 12);
  const superAdminHash = await bcrypt.hash('superadmin123', 12);

  // The local super admin is addressed by environment, not by name in source.
  // A real address written here would publish, to everyone with repository
  // access, exactly which account to attack and which password to try first.
  // The default is a throwaway that exists only in a developer's own database.
  const localSuperAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL || 'superadmin@local.test';

  await prisma.user.upsert({
    where: { email: localSuperAdminEmail },
    update: {},
    create: {
      name: 'Local Super Admin',
      email: localSuperAdminEmail,
      passwordHash: superAdminHash,
      role: 'SUPER_ADMIN',
      facilityId: facility.id,
    },
  });
  console.log(`  ✅ Super Admin user: ${localSuperAdminEmail} (SUPER_ADMIN, password: superadmin123)`);

  await prisma.user.upsert({
    where: { email: 'admin@citycare.com' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@citycare.com',
      passwordHash: adminHash,
      role: 'MANAGER',
      facilityId: facility.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'staff@citycare.com' },
    update: {},
    create: {
      name: 'Staff User',
      email: 'staff@citycare.com',
      passwordHash: staffHash,
      role: 'STAFF',
      facilityId: facility.id,
    },
  });
  console.log('  ✅ Demo users: admin@citycare.com (MANAGER), staff@citycare.com (STAFF)');

  // -----------------------------------------------------------------------
  // Doctor User Accounts (linked to Doctor profiles)
  // -----------------------------------------------------------------------
  const doctorHash = await bcrypt.hash('doctor123', 12);

  const drSharmaUser = await prisma.user.upsert({
    where: { email: 'dr.sharma@citycare.com' },
    update: {},
    create: {
      name: 'Dr. Sharma',
      email: 'dr.sharma@citycare.com',
      passwordHash: doctorHash,
      role: 'DOCTOR',
      facilityId: facility.id,
    },
  });

  const drIyerUser = await prisma.user.upsert({
    where: { email: 'dr.iyer@citycare.com' },
    update: {},
    create: {
      name: 'Dr. Iyer',
      email: 'dr.iyer@citycare.com',
      passwordHash: doctorHash,
      role: 'DOCTOR',
      facilityId: facility.id,
    },
  });

  // Link doctor users to doctor profiles
  await prisma.doctor.update({
    where: { id: 'dr-sharma' },
    data: { userId: drSharmaUser.id },
  });

  await prisma.doctor.update({
    where: { id: 'dr-iyer' },
    data: { userId: drIyerUser.id },
  });

  console.log('  ✅ Doctor users: dr.sharma@citycare.com, dr.iyer@citycare.com (DOCTOR, password: doctor123)');

  // -----------------------------------------------------------------------
  // Patient/Visitor user for testing
  // -----------------------------------------------------------------------
  const patientHash = await bcrypt.hash('patient123', 12);

  await prisma.user.upsert({
    where: { email: 'rahul@patient.com' },
    update: {},
    create: {
      name: 'Rahul Kumar',
      email: 'rahul@patient.com',
      passwordHash: patientHash,
      role: 'VISITOR',
      facilityId: facility.id,
    },
  });
  console.log('  ✅ Patient user: rahul@patient.com (VISITOR, password: patient123)');

  // -----------------------------------------------------------------------
  // Sample Appointments (for Doctor Dashboard testing)
  // -----------------------------------------------------------------------
  const { createHash, randomBytes } = await import('node:crypto');
  const today = new Date().toISOString().slice(0, 10);

  const sampleAppointments = [
    {
      code: 'DR-3001',
      facilityId: facility.id,
      doctorId: 'dr-sharma',
      patientName: 'Rahul Kumar',
      phone: '+91-9876543210',
      date: today,
      time: '10:00',
      reasonForVisit: 'Fever and headache for 3 days',
      status: 'Pending' as const,
      accessKeyHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
    },
    {
      code: 'DR-3002',
      facilityId: facility.id,
      doctorId: 'dr-sharma',
      patientName: 'Priya Singh',
      phone: '+91-9876543211',
      date: today,
      time: '10:30',
      reasonForVisit: 'Annual health checkup',
      status: 'Pending' as const,
      accessKeyHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
    },
    {
      code: 'DR-3003',
      facilityId: facility.id,
      doctorId: 'dr-sharma',
      patientName: 'Amit Patel',
      phone: '+91-9876543212',
      date: today,
      time: '11:00',
      reasonForVisit: 'Follow-up on blood pressure medication',
      status: 'Approved' as const,
      accessKeyHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
    },
    {
      code: 'DR-3004',
      facilityId: facility.id,
      doctorId: 'dr-sharma',
      patientName: 'Sunita Verma',
      phone: '+91-9876543213',
      date: today,
      time: '11:30',
      reasonForVisit: 'Chronic back pain consultation',
      status: 'Completed' as const,
      accessKeyHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
    },
    {
      code: 'DR-3005',
      facilityId: facility.id,
      doctorId: 'dr-sharma',
      patientName: 'Vikram Joshi',
      phone: '+91-9876543214',
      date: today,
      time: '14:00',
      reasonForVisit: 'Skin rash on arms',
      status: 'Denied' as const,
      accessKeyHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
    },
    // Appointments for Dr. Iyer (should NOT appear for Dr. Sharma)
    {
      code: 'DR-3006',
      facilityId: facility.id,
      doctorId: 'dr-iyer',
      patientName: 'Meera Nair',
      phone: '+91-9876543215',
      date: today,
      time: '09:30',
      reasonForVisit: 'Child vaccination schedule',
      status: 'Pending' as const,
      accessKeyHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
    },
    {
      code: 'DR-3007',
      facilityId: facility.id,
      doctorId: 'dr-iyer',
      patientName: 'Arjun Reddy',
      phone: '+91-9876543216',
      date: today,
      time: '10:00',
      reasonForVisit: 'Child has persistent cough',
      status: 'Approved' as const,
      accessKeyHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
    },
  ];

  // Slot uniqueness is now a partial index, so there is no compound unique key
  // to upsert against. Find-then-create keeps the seed idempotent.
  for (const apt of sampleAppointments) {
    const existing = await prisma.appointment.findFirst({
      where: { doctorId: apt.doctorId, date: apt.date, time: apt.time, deletedAt: null },
    });
    if (!existing) await prisma.appointment.create({ data: apt });
  }
  console.log(`  ✅ Sample appointments: ${sampleAppointments.length} created for today (${today})`);

  console.log('\n🎉 Seed complete!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

