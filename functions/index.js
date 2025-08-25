const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {logger} = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

// Initialize Firebase Admin
admin.initializeApp();

// Hardcoded admin UIDs - secure server-side validation
const ADMIN_UIDS = [
  "IrEAgqbRrfZf77QaAt0jw8YuTd63",
  "TNrQzvNsBwYqiwRl57RsAlGNW0h2"
];

/**
 * Cloud Function to validate if a user is an admin
 * Only callable by authenticated users
 * Returns true if the calling user is an admin, false otherwise
 */
exports.validateAdmin = onCall({
  enforceAppCheck: false, // Set to true in production for extra security
}, async (request) => {
  // Check if user is authenticated
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const uid = request.auth.uid;
  
  // Log for debugging (remove in production)
  logger.info(`Admin validation check for UID: ${uid}`);
  
  // Check if the user's UID is in the admin list
  const isAdmin = ADMIN_UIDS.includes(uid);
  
  logger.info(`Admin validation result for ${uid}: ${isAdmin}`);
  
  return {
    isAdmin: isAdmin,
    uid: uid
  };
});

/**
 * Cloud Function to get admin status and user data
 * Combines admin validation with user data fetching
 */
exports.getAdminStatus = onCall({
  enforceAppCheck: false,
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const uid = request.auth.uid;
  const isAdmin = ADMIN_UIDS.includes(uid);
  
  try {
    // Get user data from Firestore
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    
    return {
      isAdmin: isAdmin,
      uid: uid,
      userData: userData,
      hasUserDoc: userDoc.exists
    };
  } catch (error) {
    logger.error("Error fetching user data:", error);
    return {
      isAdmin: isAdmin,
      uid: uid,
      userData: null,
      hasUserDoc: false,
      error: "Failed to fetch user data"
    };
  }
});

/**
 * Scheduled reminder sender (runs every hour).
 * Looks for upcoming appointments within the next 25 hours and sends reminders via email.
 * To enable, configure SMTP_* env vars. For SMS, integrate Twilio similarly.
 */
exports.sendAppointmentReminders = onSchedule({schedule: 'every 60 minutes'}, async () => {
  const db = admin.firestore();
  const now = new Date();
  const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const transporter = process.env.SMTP_HOST ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: process.env.SMTP_USER ? {user: process.env.SMTP_USER, pass: process.env.SMTP_PASS} : undefined,
  }) : null;

  // We scan all technicians' appointments
  const techs = await db.collection('technicians').get();
  for (const techDoc of techs.docs) {
    const appts = await db.collection('technicians').doc(techDoc.id).collection('appointments').get();
    for (const a of appts.docs) {
      const appt = a.data();
      if (!appt.appointmentAt || !appt.customerEmail) continue;
      const at = appt.appointmentAt.toDate ? appt.appointmentAt.toDate() : new Date(appt.appointmentAt);
      if (at > now && at <= in25h && appt.status !== 'cancelled') {
        const whenStr = at.toLocaleString();
        const where = appt.technicianBusinessName || 'YVD NAILS';
        const what = appt.service || 'Nail appointment';

        if (transporter) {
          try {
            await transporter.sendMail({
              from: process.env.SMTP_FROM || 'no-reply@yvdnails.com',
              to: appt.customerEmail,
              subject: `Appointment Reminder - ${whenStr}`,
              text: `This is a friendly reminder for your upcoming appointment.\n\nWhat: ${what}\nWhen: ${whenStr}\nWhere: ${where}\n\nPlease arrive a few minutes early. Reply to this email if you need to make changes.`,
            });
          } catch (e) {
            logger.warn('Reminder email failed', e);
          }
        }
        // For SMS, integrate Twilio; use appt.customerPhone if available.
      }
    }
  }
  return null;
});

/**
 * HTTP Function for admin operations (protected endpoint)
 * Only allows admin UIDs to perform operations
 */
exports.adminOperation = onCall({
  enforceAppCheck: false,
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const uid = request.auth.uid;
  
  // Check if user is admin
  if (!ADMIN_UIDS.includes(uid)) {
    throw new HttpsError("permission-denied", "Access denied: Admin privileges required");
  }

  const {operation, data} = request.data;
  
  logger.info(`Admin operation requested by ${uid}: ${operation}`);
  
  try {
    switch (operation) {
      case "updateUserStatus":
        // Example: Update user approval status
        if (!data.targetUid || typeof data.approved !== "boolean") {
          throw new HttpsError("invalid-argument", "Missing required fields");
        }
        
        const userUpdate = {
          isApproved: data.approved,
          isVerified: data.approved,
          verificationStatus: data.approved ? "approved" : "rejected",
          verifiedAt: data.approved ? admin.firestore.FieldValue.serverTimestamp() : null,
          verifiedBy: uid
        };
        if (!data.approved) {
          userUpdate.blacklisted = true;
          userUpdate.blacklistedAt = admin.firestore.FieldValue.serverTimestamp();
        }
        await admin.firestore().collection("users").doc(data.targetUid).update(userUpdate);

        // Optional: send rejection/approval email if contact provided
        try {
          if (data.notify && data.email) {
            const transporter = nodemailer.createTransport({
              host: process.env.SMTP_HOST,
              port: Number(process.env.SMTP_PORT || 587),
              secure: false,
              auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
              },
            });
            const subject = data.approved ? "You're approved" : "Application update";
            const text = data.approved
              ? `Hi, your account has been approved. You can now book appointments.`
              : `Thank you for your interest. At this time, client capacity is full and we are unable to accept new appointments. We are not accepting reapplications for this account.`;
            await transporter.sendMail({
              from: process.env.SMTP_FROM || 'no-reply@yvdnails.com',
              to: data.email,
              subject,
              text,
            });
          }
        } catch (e) {
          logger.warn('Notification email failed', e);
        }
        
        return {success: true, message: `User ${data.approved ? "approved" : "rejected"} successfully`};
        
      case "deleteAppointment":
        if (!data.appointmentId) {
          throw new HttpsError("invalid-argument", "Missing appointment ID");
        }
        
        await admin.firestore().collection("appointments").doc(data.appointmentId).delete();
        return {success: true, message: "Appointment deleted successfully"};
        
      default:
        throw new HttpsError("invalid-argument", `Unknown operation: ${operation}`);
    }
  } catch (error) {
    logger.error(`Admin operation failed:`, error);
    throw new HttpsError("internal", `Operation failed: ${error.message}`);
  }
});