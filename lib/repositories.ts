/**
 * Repository layer for QueueMind AI.
 *
 * Each repository wraps Prisma queries and returns data in the shapes that
 * the existing server.ts domain services expect. This keeps the migration
 * non-breaking: callers see the same interfaces they used with queueStore.
 */
import { prisma } from './db.js';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Facility
// ---------------------------------------------------------------------------

export const FacilityRepo = {
  async getDefault() {
    return prisma.facility.findFirst({ orderBy: { createdAt: 'asc' } });
  },

  async getDefaultOrThrow() {
    const facility = await this.getDefault();
    if (!facility) throw new Error('No facility configured. Run prisma db seed.');
    return facility;
  },

  /**
   * Atomically increment and return the next walk-in token number.
   * Uses raw SQL to guarantee concurrency safety.
   */
  async nextWalkInNumber(facilityId: string): Promise<number> {
    const result = await prisma.$queryRaw<{ next_walkin_number: number }[]>`
      UPDATE facilities
      SET next_walkin_number = next_walkin_number + 1
      WHERE id = ${facilityId}
      RETURNING next_walkin_number - 1 AS next_walkin_number
    `;
    return result[0].next_walkin_number;
  },

  /**
   * Atomically increment and return the next appointment number.
   */
  async nextAppointmentNumber(facilityId: string): Promise<number> {
    const result = await prisma.$queryRaw<{ next_appointment_number: number }[]>`
      UPDATE facilities
      SET next_appointment_number = next_appointment_number + 1
      WHERE id = ${facilityId}
      RETURNING next_appointment_number - 1 AS next_appointment_number
    `;
    return result[0].next_appointment_number;
  },
};

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export const UserRepo = {
  /**
   * Email lookup is case-insensitive on purpose: Google returns a normalised
   * address, and a case-only difference must resolve to the SAME account
   * instead of silently creating a duplicate doctor/user.
   */
  async findByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
    });
  },

  async findById(id: string) {
    return prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
  },

  async create(data: {
    name: string;
    email: string;
    passwordHash: string;
    role?: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'STAFF' | 'DOCTOR' | 'VISITOR';
    facilityId?: string;
    avatarUrl?: string | null;
    phone?: string | null;
  }) {
    return prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: data.passwordHash,
        role: data.role ?? 'VISITOR',
        facilityId: data.facilityId,
        avatarUrl: data.avatarUrl,
        phone: data.phone,
      },
    });
  },

  /** Profile-only update. Role, email, and password are deliberately not writable here. */
  async updateProfile(id: string, data: { name?: string; phone?: string | null; avatarUrl?: string | null }) {
    return prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
      },
    });
  },
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const ServiceRepo = {
  async findAll(facilityId: string) {
    return prisma.service.findMany({
      where: { facilityId },
      orderBy: { createdAt: 'asc' },
    });
  },

  async findById(id: string) {
    return prisma.service.findUnique({ where: { id } });
  },
};

// ---------------------------------------------------------------------------
// Doctor
// ---------------------------------------------------------------------------

export const DoctorRepo = {
  async findAll(facilityId: string) {
    return prisma.doctor.findMany({
      where: { facilityId },
      include: { department: true },
      orderBy: { createdAt: 'asc' },
    });
  },

  async findById(id: string) {
    return prisma.doctor.findUnique({
      where: { id },
      include: { department: true },
    });
  },

  /** Management listing — includes the linked account so admins can see the login email. */
  async findAllWithUser(facilityId: string) {
    return prisma.doctor.findMany({
      where: { facilityId },
      include: {
        department: true,
        user: { select: { id: true, email: true, name: true, role: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  async findByIdWithUser(id: string) {
    return prisma.doctor.findUnique({
      where: { id },
      include: {
        department: true,
        user: { select: { id: true, email: true, name: true, role: true, avatarUrl: true } },
      },
    });
  },

  async findByUserId(userId: string) {
    return prisma.doctor.findUnique({
      where: { userId },
      include: { department: true },
    });
  },

  async create(data: {
    name: string;
    facilityId: string;
    departmentId: string;
    userId?: string | null;
    photoUrl?: string | null;
    qualification?: string | null;
    experienceYears?: number;
    consultationFee?: number;
    bio?: string | null;
  }) {
    return prisma.doctor.create({
      data: {
        name: data.name,
        facilityId: data.facilityId,
        departmentId: data.departmentId,
        userId: data.userId ?? undefined,
        photoUrl: data.photoUrl ?? undefined,
        qualification: data.qualification ?? undefined,
        experienceYears: data.experienceYears ?? 0,
        consultationFee: data.consultationFee ?? 0,
        bio: data.bio ?? undefined,
      },
      include: { department: true, user: { select: { id: true, email: true, name: true, role: true } } },
    });
  },

  async update(id: string, data: {
    name?: string;
    departmentId?: string;
    photoUrl?: string | null;
    qualification?: string | null;
    experienceYears?: number;
    consultationFee?: number;
    bio?: string | null;
    isActive?: boolean;
  }) {
    return prisma.doctor.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.departmentId !== undefined ? { departmentId: data.departmentId } : {}),
        ...(data.photoUrl !== undefined ? { photoUrl: data.photoUrl } : {}),
        ...(data.qualification !== undefined ? { qualification: data.qualification } : {}),
        ...(data.experienceYears !== undefined ? { experienceYears: data.experienceYears } : {}),
        ...(data.consultationFee !== undefined ? { consultationFee: data.consultationFee } : {}),
        ...(data.bio !== undefined ? { bio: data.bio } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      include: {
        department: true,
        user: { select: { id: true, email: true, name: true, role: true, avatarUrl: true } },
      },
    });
  },
};

// ---------------------------------------------------------------------------
// Department (Specialization)
// ---------------------------------------------------------------------------

export const DepartmentRepo = {
  async findAll(facilityId: string) {
    return prisma.department.findMany({
      where: { facilityId },
      orderBy: { name: 'asc' },
    });
  },

  async findById(id: string) {
    return prisma.department.findUnique({ where: { id } });
  },

  async create(facilityId: string, name: string) {
    return prisma.department.create({ data: { facilityId, name } });
  },
};

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

export const TokenRepo = {
  async create(data: {
    code: string;
    facilityId: string;
    serviceId: string;
    visitorName?: string;
    phone?: string;
    userId?: string;
    /** Optional Queue Token -> Doctor / Appointment linkage. */
    doctorId?: string;
    appointmentId?: string;
    accessKeyHash: string;
  }) {
    return prisma.token.create({ data });
  },

  async findById(id: string) {
    return prisma.token.findFirst({
      where: { id, deletedAt: null },
    });
  },



  async findActiveForUser(userId: string) {
    return prisma.token.findFirst({
      where: {
        userId,
        status: { in: ['Waiting', 'Approaching', 'Serving'] },
        deletedAt: null,
      },
      orderBy: { issuedAt: 'desc' },
    });
  },

  async countActiveForService(serviceId: string) {
    return prisma.token.count({
      where: {
        serviceId,
        status: { in: ['Waiting', 'Approaching'] },
        deletedAt: null,
      },
    });
  },

  /**
   * Find all non-deleted tokens for a facility, with their service relation.
   * Supports optional text search across code, visitorName, and service name.
   */
  async findAllActiveForFacility(facilityId: string, search?: string) {
    const where: Prisma.TokenWhereInput = {
      facilityId,
      deletedAt: null,
      // The live board shows the queue as it stands. Completed and cancelled
      // tokens were previously still listed, which inflated the board and made
      // it disagree with the visitor's own position.
      status: { in: ['Waiting', 'Approaching', 'Serving'] },
    };

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { visitorName: { contains: q, mode: 'insensitive' } },
        { service: { name: { contains: q, mode: 'insensitive' } } },
        { counterName: { contains: q, mode: 'insensitive' } },
      ];
    }

    return prisma.token.findMany({
      where,
      include: { service: true },
      orderBy: { issuedAt: 'desc' },
    });
  },

  /**
   * Count tokens in the same service queue that were issued BEFORE this token
   * and are still active (Waiting or Approaching).
   * This gives the real position-based "people ahead" count.
   */
  async countAheadOf(token: { serviceId: string; facilityId: string; issuedAt: Date | string }) {
    const issuedAt = token.issuedAt instanceof Date ? token.issuedAt : new Date(token.issuedAt);
    return prisma.token.count({
      where: {
        serviceId: token.serviceId,
        facilityId: token.facilityId,
        status: { in: ['Waiting', 'Approaching'] },
        issuedAt: { lt: issuedAt },
        deletedAt: null,
      },
    });
  },

  /**
   * Return anonymous token codes around the visitor's position in the queue.
   * Only returns codes — no names, phones, or private data.
   * Shows up to `before` tokens ahead and `after` tokens behind.
   */
  async findQueueAround(
    token: { id: string; serviceId: string; facilityId: string; issuedAt: Date | string },
    before = 5,
    after = 3,
  ) {
    const issuedAt = token.issuedAt instanceof Date ? token.issuedAt : new Date(token.issuedAt);

    // Tokens ahead (issued before, still active), ordered most recent first (closest to visitor)
    const ahead = await prisma.token.findMany({
      where: {
        serviceId: token.serviceId,
        facilityId: token.facilityId,
        status: { in: ['Waiting', 'Approaching', 'Serving'] },
        issuedAt: { lt: issuedAt },
        deletedAt: null,
      },
      select: { id: true, code: true, status: true },
      orderBy: { issuedAt: 'desc' },
      take: before,
    });

    // Tokens behind (issued after, still active), ordered earliest first (closest to visitor)
    const behind = await prisma.token.findMany({
      where: {
        serviceId: token.serviceId,
        facilityId: token.facilityId,
        status: { in: ['Waiting', 'Approaching'] },
        issuedAt: { gt: issuedAt },
        id: { not: token.id },
        deletedAt: null,
      },
      select: { id: true, code: true, status: true },
      orderBy: { issuedAt: 'asc' },
      take: after,
    });

    // Currently serving token for this service (if any)
    const serving = await prisma.token.findFirst({
      where: {
        serviceId: token.serviceId,
        facilityId: token.facilityId,
        status: 'Serving',
        deletedAt: null,
      },
      select: { id: true, code: true, status: true, counterName: true },
      orderBy: { issuedAt: 'desc' },
    });

    return {
      ahead: ahead.reverse(), // chronological order: oldest first
      behind,
      serving,
    };
  },
};

// ---------------------------------------------------------------------------
// Appointment
// ---------------------------------------------------------------------------

export const AppointmentRepo = {
  async create(data: {
    code: string;
    facilityId: string;
    doctorId: string;
    patientName: string;
    /** Null only for desk bookings made by authenticated staff. */
    phone: string | null;
    date: string;
    time: string;
    reasonForVisit: string;
    existingDiagnosis?: string;
    accessKeyHash: string;
    /** Set when the booking visitor is signed in, linking Appointment -> Patient. */
    userId?: string;
    /** Defaults to Pending — the doctor approves or denies before it queues. */
    status?: 'Pending' | 'Approved' | 'Scheduled';
    /** Set server-side when staff book for a patient without a contact number. */
    bookedAtDesk?: boolean;
  }) {
    return prisma.appointment.create({ data });
  },

  async findById(id: string) {
    return prisma.appointment.findFirst({
      where: { id, deletedAt: null },
    });
  },

  async findByCode(code: string) {
    return prisma.appointment.findFirst({
      where: { code, deletedAt: null },
    });
  },

  async findByIdOrCode(idOrCode: string) {
    const byId = await this.findById(idOrCode);
    if (byId) return byId;
    return this.findByCode(idOrCode);
  },

  async findByDoctorAndDate(doctorId: string, date: string) {
    return prisma.appointment.findMany({
      where: { doctorId, date, deletedAt: null },
      orderBy: { time: 'asc' },
    });
  },

  async findActiveByDoctorDateTimeRange(
    doctorId: string,
    date: string,
    startTime: string,
    endTime: string,
  ) {
    // We need to filter in application code since time is stored as string
    const appointments = await prisma.appointment.findMany({
      where: {
        doctorId,
        date,
        deletedAt: null,
        status: { notIn: ['Completed', 'Cancelled'] },
      },
      orderBy: { time: 'asc' },
    });

    return appointments.filter((apt) => {
      const [h, m] = apt.time.split(':').map(Number);
      const minute = h * 60 + m;
      const [sh, sm] = startTime.split(':').map(Number);
      const startMinute = sh * 60 + sm;
      const [eh, em] = endTime.split(':').map(Number);
      const endMinute = eh * 60 + em;
      return minute >= startMinute && minute < endMinute;
    });
  },

  /** Check if a slot is occupied (ignoring a specific appointment) */
  async isSlotOccupied(
    doctorId: string,
    date: string,
    time: string,
    excludeAppointmentId?: string,
  ) {
    const existing = await prisma.appointment.findFirst({
      where: {
        doctorId,
        date,
        time,
        deletedAt: null,
        status: { notIn: ['Cancelled'] },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      },
    });
    return !!existing;
  },

  /**
   * Reschedule an appointment atomically within a Prisma transaction.
   */
  async reschedule(
    appointmentId: string,
    newDoctorId: string,
    newDate: string,
    newTime: string,
  ) {
    return prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        doctorId: newDoctorId,
        date: newDate,
        time: newTime,
        version: { increment: 1 },
      },
    });
  },
};

// ---------------------------------------------------------------------------
// DoctorAvailability
// ---------------------------------------------------------------------------

export const AvailabilityRepo = {
  async findByDoctorAndDate(doctorId: string, date: string) {
    return prisma.doctorAvailability.findMany({
      where: { doctorId, date },
      orderBy: { startTime: 'asc' },
    });
  },

  async upsert(data: {
    doctorId: string;
    date: string;
    startTime: string;
    endTime: string;
    status: 'Available' | 'Busy' | 'Delayed' | 'Unavailable';
    delayMinutes?: number;
    note?: string;
    updatedBy: string;
  }) {
    // Use a deterministic ID based on doctor+date+startTime+endTime
    const deterministicId = `${data.doctorId}:${data.date}:${data.startTime}:${data.endTime}`;

    // Try to find existing
    const existing = await prisma.doctorAvailability.findFirst({
      where: {
        doctorId: data.doctorId,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
      },
    });

    if (existing) {
      return prisma.doctorAvailability.update({
        where: { id: existing.id },
        data: {
          status: data.status,
          delayMinutes: data.delayMinutes,
          note: data.note,
          updatedBy: data.updatedBy,
        },
      });
    }

    return prisma.doctorAvailability.create({
      data: {
        id: randomUUID(),
        ...data,
      },
    });
  },
};

// ---------------------------------------------------------------------------
// ScheduleChange
// ---------------------------------------------------------------------------

export const ScheduleChangeRepo = {
  async create(data: {
    appointmentId: string;
    previousDoctorId: string;
    previousDate: string;
    previousTime: string;
    newDoctorId: string;
    newDate: string;
    newTime: string;
    approvedBy: string;
  }) {
    return prisma.scheduleChange.create({ data });
  },
};

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

export const NotificationRepo = {
  async create(data: {
    appointmentId: string;
    type: 'appointment_rescheduled';
    title: string;
    message: string;
    previousTime: string;
    newTime: string;
    deliveryStatus?: 'queued' | 'mock_dispatched' | 'dispatched' | 'failed';
    recipientPhoneMasked: string;
    dispatchedAt?: Date;
  }) {
    return prisma.notification.create({
      data: {
        ...data,
        deliveryStatus: data.deliveryStatus ?? 'queued',
      },
    });
  },

  async findByAppointmentId(appointmentId: string) {
    return prisma.notification.findMany({
      where: { appointmentId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async findLatestForAppointment(appointmentId: string) {
    return prisma.notification.findFirst({
      where: { appointmentId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async updateResponse(id: string, response: 'confirmed' | 'request_another_time') {
    return prisma.notification.update({
      where: { id },
      data: {
        response,
        respondedAt: new Date(),
      },
    });
  },
};

// ---------------------------------------------------------------------------
// AuditLog
// ---------------------------------------------------------------------------

export const AuditRepo = {
  async record(data: {
    actorId: string;
    actorRole: string;
    action: string;
    targetType: string;
    targetId: string;
    outcome?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.auditLog.create({
      data: {
        actorId: data.actorId,
        actorRole: data.actorRole,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        outcome: data.outcome ?? 'success',
        metadata: data.metadata,
      },
    });
  },
};

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

export const CameraRepo = {
  async findAll(facilityId: string) {
    return prisma.camera.findMany({ where: { facilityId } });
  },

  async findById(id: string) {
    return prisma.camera.findUnique({ where: { id } });
  },

  async create(data: {
    facilityId: string;
    name: string;
    location: string;
    type: 'webcam' | 'cctv' | 'rtsp';
  }) {
    return prisma.camera.create({
      data: { ...data, status: 'connected' },
    });
  },

  async updateStatus(id: string, status: 'connected' | 'disconnected' | 'error') {
    return prisma.camera.update({
      where: { id },
      data: { status },
    });
  },
};

// ---------------------------------------------------------------------------
// CameraAnalytics
// ---------------------------------------------------------------------------

export const CameraAnalyticsRepo = {
  async create(data: {
    cameraId: string;
    peopleCount: number;
    queueCount: number;
    zoneCounts: Prisma.InputJsonValue;
    densityLevel: 'Low' | 'Medium' | 'High';
  }) {
    return prisma.cameraAnalytics.create({ data });
  },

  async findByCameraId(cameraId: string, limit = 50) {
    return prisma.cameraAnalytics.findMany({
      where: { cameraId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  },
};
