import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || 'QueueMind AI <noreply@queuemind.ai>';

const isSmtpConfigured = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

let transporter: nodemailer.Transporter | null = null;

if (isSmtpConfigured) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
  console.log(`📧 Email service configured (SMTP: ${SMTP_HOST}:${SMTP_PORT})`);
} else {
  console.log('📧 Email service: SMTP not configured — emails will be logged to console');
}

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

async function sendEmail(payload: EmailPayload): Promise<boolean> {
  if (transporter && isSmtpConfigured) {
    try {
      await transporter.sendMail({
        from: SMTP_FROM,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      });
      console.log(`📧 Email sent to ${payload.to}: ${payload.subject}`);
      return true;
    } catch (err) {
      console.error(`📧 Email failed to ${payload.to}:`, err);
      return false;
    }
  } else {
    // Log to console when SMTP is not configured
    console.log(`📧 [MOCK EMAIL] To: ${payload.to}`);
    console.log(`   Subject: ${payload.subject}`);
    console.log(`   Body: ${payload.text || payload.html.substring(0, 200)}...`);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

function formatTime12h(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatDateHuman(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Doctor Notification Emails
// ---------------------------------------------------------------------------

export const emailService = {
  /** Notify doctor of a new appointment request */
  async notifyDoctorNewAppointment(
    doctorEmail: string,
    doctorName: string,
    appointment: {
      patientName: string;
      date: string;
      time: string;
      code: string;
      reasonForVisit: string;
    },
  ) {
    const time12 = formatTime12h(appointment.time);
    const dateHuman = formatDateHuman(appointment.date);

    return sendEmail({
      to: doctorEmail,
      subject: `🔔 New Appointment Request — ${appointment.patientName}`,
      text: `Dear ${doctorName},\n\nA new patient has requested an appointment.\n\nPatient: ${appointment.patientName}\nDate: ${dateHuman}\nTime: ${time12}\nToken: ${appointment.code}\nReason: ${appointment.reasonForVisit}\n\nOpen the Doctor Dashboard to approve or deny the appointment.\n\n— QueueMind AI`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #f8f9fb; border-radius: 12px;">
          <h2 style="color: #1a1a2e; margin-bottom: 8px;">🔔 New Appointment Request</h2>
          <p style="color: #555; margin-bottom: 20px;">Dear ${doctorName},</p>
          <p style="color: #555;">A new patient has requested an appointment with you.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb;">
            <tr><td style="padding: 10px 14px; font-weight: 600; color: #374151; border-bottom: 1px solid #f0f0f0; width: 120px;">Patient</td><td style="padding: 10px 14px; color: #111; border-bottom: 1px solid #f0f0f0;">${appointment.patientName}</td></tr>
            <tr><td style="padding: 10px 14px; font-weight: 600; color: #374151; border-bottom: 1px solid #f0f0f0;">Date</td><td style="padding: 10px 14px; color: #111; border-bottom: 1px solid #f0f0f0;">${dateHuman}</td></tr>
            <tr><td style="padding: 10px 14px; font-weight: 600; color: #374151; border-bottom: 1px solid #f0f0f0;">Time</td><td style="padding: 10px 14px; color: #111; border-bottom: 1px solid #f0f0f0;">${time12}</td></tr>
            <tr><td style="padding: 10px 14px; font-weight: 600; color: #374151; border-bottom: 1px solid #f0f0f0;">Token</td><td style="padding: 10px 14px; color: #111; border-bottom: 1px solid #f0f0f0;"><strong>${appointment.code}</strong></td></tr>
            <tr><td style="padding: 10px 14px; font-weight: 600; color: #374151;">Reason</td><td style="padding: 10px 14px; color: #111;">${appointment.reasonForVisit}</td></tr>
          </table>
          <p style="color: #555; font-size: 14px;">Open the <strong>Doctor Dashboard</strong> to approve or deny this appointment.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="color: #999; font-size: 12px;">— QueueMind AI • Automated Notification</p>
        </div>
      `,
    });
  },

  /** Notify patient that their appointment was approved */
  async notifyPatientApproved(
    patientPhone: string,
    appointment: {
      patientName: string;
      date: string;
      time: string;
      code: string;
      doctorName: string;
    },
  ) {
    const time12 = formatTime12h(appointment.time);
    const dateHuman = formatDateHuman(appointment.date);

    // Phone notification would go here; for now we log it
    console.log(`📱 [PATIENT NOTIFICATION] ${appointment.patientName}: Your appointment (${appointment.code}) with ${appointment.doctorName} on ${dateHuman} at ${time12} has been APPROVED.`);
    return true;
  },

  /** Notify patient that their appointment was denied */
  async notifyPatientDenied(
    patientPhone: string,
    appointment: {
      patientName: string;
      date: string;
      time: string;
      code: string;
      doctorName: string;
      /** The doctor's stated reason, so the patient is not left guessing. */
      reason?: string;
    },
  ) {
    const time12 = formatTime12h(appointment.time);
    const dateHuman = formatDateHuman(appointment.date);
    const because = appointment.reason ? ` Reason: ${appointment.reason}.` : '';

    console.log(`📱 [PATIENT NOTIFICATION] ${appointment.patientName}: Your appointment (${appointment.code}) with ${appointment.doctorName} on ${dateHuman} at ${time12} has been DECLINED.${because} Please book another slot.`);
    return true;
  },

  /**
   * Tell a doctor their schedule moved.
   *
   * A reschedule used to notify only the patient, leaving the doctor to
   * discover the change when the patient did not arrive at the old time.
   */
  async notifyDoctorRescheduled(
    doctorEmail: string,
    doctorName: string,
    appointment: {
      patientName: string;
      date: string;
      previousTime: string;
      newTime: string;
      code: string;
    },
  ) {
    const from12 = formatTime12h(appointment.previousTime);
    const to12 = formatTime12h(appointment.newTime);
    const dateHuman = formatDateHuman(appointment.date);

    return sendEmail({
      to: doctorEmail,
      subject: `Appointment moved — ${appointment.patientName} (${appointment.code})`,
      text: `Dear ${doctorName},\n\nAn appointment on your schedule has been rescheduled.\n\nPatient: ${appointment.patientName}\nDate: ${dateHuman}\nWas: ${from12}\nNow: ${to12}\nToken: ${appointment.code}\n\nOpen your dashboard to see the updated day.\n\n— QueueMind AI`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #f8f9fb; border-radius: 12px;">
          <h2 style="color: #1a1a2e; margin-bottom: 8px;">Appointment rescheduled</h2>
          <p style="color: #555; margin-bottom: 20px;">Dear ${doctorName},</p>
          <p style="color: #555;">An appointment on your schedule has been moved.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb;">
            <tr><td style="padding: 10px 14px; font-weight: 600; color: #374151; border-bottom: 1px solid #f0f0f0; width: 120px;">Patient</td><td style="padding: 10px 14px; color: #111; border-bottom: 1px solid #f0f0f0;">${appointment.patientName}</td></tr>
            <tr><td style="padding: 10px 14px; font-weight: 600; color: #374151; border-bottom: 1px solid #f0f0f0;">Date</td><td style="padding: 10px 14px; color: #111; border-bottom: 1px solid #f0f0f0;">${dateHuman}</td></tr>
            <tr><td style="padding: 10px 14px; font-weight: 600; color: #374151; border-bottom: 1px solid #f0f0f0;">Was</td><td style="padding: 10px 14px; color: #b91c1c; border-bottom: 1px solid #f0f0f0; text-decoration: line-through;">${from12}</td></tr>
            <tr><td style="padding: 10px 14px; font-weight: 600; color: #374151; border-bottom: 1px solid #f0f0f0;">Now</td><td style="padding: 10px 14px; color: #047857; font-weight: 700; border-bottom: 1px solid #f0f0f0;">${to12}</td></tr>
            <tr><td style="padding: 10px 14px; font-weight: 600; color: #374151;">Token</td><td style="padding: 10px 14px; color: #111;">${appointment.code}</td></tr>
          </table>
          <p style="color: #888; font-size: 13px;">— QueueMind AI</p>
        </div>
      `,
    });
  },
};
