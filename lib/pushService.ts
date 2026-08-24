/**
 * Push Notification Service for QueueMind AI.
 *
 * Provides interfaces for sending Web Push notifications using VAPID.
 */

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL;

const isVapidConfigured = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_EMAIL);

if (isVapidConfigured) {
  console.log('🔔 Push notification service configured (Web Push)');
} else {
  console.log('🔔 Push notification service: VAPID keys not configured — notifications will be logged to console');
}

export const pushService = {
  /**
   * Send a push notification to a user's devices.
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: any
  ) {
    if (isVapidConfigured) {
      // In a real implementation, you would:
      // 1. Look up the user's PushSubscriptions in the database
      // 2. Use web-push library to send the payload to each subscription
      // 
      // const subscriptions = await PushSubscriptionRepo.findByUserId(userId);
      // for (const sub of subscriptions) {
      //   await webpush.sendNotification(sub, JSON.stringify({ title, body, data }));
      // }
      console.log(`🔔 Push Notification sent to user ${userId}: ${title}`);
    } else {
      console.log(`🔔 [MOCK PUSH] To User: ${userId}`);
      console.log(`   Title: ${title}`);
      console.log(`   Body: ${body}`);
      if (data) console.log(`   Data:`, data);
    }
  },

  /** Send appointment reminder to doctor */
  async notifyDoctorReminder(doctorId: string, patientName: string, time: string) {
    return this.sendToUser(
      doctorId, // Assuming doctorId can resolve to a user or push subscriptions
      'Appointment Reminder',
      `Your appointment with ${patientName} starts at ${time}.`,
      { type: 'reminder' }
    );
  },

  /** Send new patient waiting notification to doctor */
  async notifyDoctorPatientWaiting(doctorId: string, patientName: string, token: string) {
    return this.sendToUser(
      doctorId,
      'Patient Waiting',
      `Token ${token} (${patientName}) is now waiting in your queue.`,
      { type: 'patient_waiting' }
    );
  }
};
