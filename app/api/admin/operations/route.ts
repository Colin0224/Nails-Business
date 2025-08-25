import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK (if not already initialized)
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    // For development, we'll use a simpler approach without service account
  });
}

// Hardcoded admin UIDs
const ADMIN_UIDS = [
  'IrEAgqbRrfZf77QaAt0jw8YuTd63',
  'TNrQzvNsBwYqiwRl57RsAlGNW0h2'
];

async function validateAdminToken(authHeader: string | null): Promise<{ uid: string; isAdmin: boolean }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const idToken = authHeader.substring(7);
  const decodedToken = await admin.auth().verifyIdToken(idToken);
  const uid = decodedToken.uid;
  const isAdmin = ADMIN_UIDS.includes(uid);
  
  if (!isAdmin) {
    throw new Error('Access denied: Admin privileges required');
  }
  
  return { uid, isAdmin };
}

export async function POST(request: NextRequest) {
  try {
    // Validate admin access
    const { uid } = await validateAdminToken(request.headers.get('authorization'));
    
    // Get request body
    const { operation, data } = await request.json();
    
    console.log(`Admin operation requested by ${uid}: ${operation}`);
    
    const db = admin.firestore();
    
    switch (operation) {
      case 'updateUserStatus':
        if (!data.targetUid || typeof data.approved !== 'boolean') {
          return NextResponse.json(
            { error: 'Missing required fields: targetUid, approved' }, 
            { status: 400 }
          );
        }
        
        await db.collection('users').doc(data.targetUid).update({
          isApproved: data.approved,
          isVerified: data.approved,
          verificationStatus: data.approved ? 'approved' : 'rejected',
          verifiedAt: data.approved ? admin.firestore.FieldValue.serverTimestamp() : null,
          verifiedBy: uid
        });
        
        // Also update pending verification record if it exists
        try {
          await db.collection('pendingVerifications').doc(data.targetUid).update({
            status: data.approved ? 'approved' : 'rejected',
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            processedBy: uid
          });
        } catch (error) {
          // Pending verification record might not exist, that's okay
          console.log('No pending verification record to update');
        }
        
        return NextResponse.json({
          success: true,
          message: `User ${data.approved ? 'approved' : 'rejected'} successfully`
        });
        
      case 'deleteAppointment':
        if (!data.appointmentId) {
          return NextResponse.json(
            { error: 'Missing appointment ID' }, 
            { status: 400 }
          );
        }
        
        await db.collection('appointments').doc(data.appointmentId).delete();
        return NextResponse.json({
          success: true,
          message: 'Appointment deleted successfully'
        });
        
      case 'updateAppointmentStatus':
        if (!data.appointmentId || !data.status) {
          return NextResponse.json(
            { error: 'Missing appointment ID or status' }, 
            { status: 400 }
          );
        }
        
        await db.collection('appointments').doc(data.appointmentId).update({
          status: data.status,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: uid
        });
        
        return NextResponse.json({
          success: true,
          message: `Appointment ${data.status} successfully`
        });
        
      default:
        return NextResponse.json(
          { error: `Unknown operation: ${operation}` }, 
          { status: 400 }
        );
    }
    
  } catch (error) {
    console.error('Admin operation failed:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Access denied')) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      if (error.message.includes('Missing or invalid')) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
    }
    
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}
