import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    // For development, we'll use a simpler approach without service account
  });
}

// Hardcoded admin UIDs - secure server-side validation
const ADMIN_UIDS = [
  'IrEAgqbRrfZf77QaAt0jw8YuTd63',
  'TNrQzvNsBwYqiwRl57RsAlGNW0h2'
];

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' }, 
        { status: 401 }
      );
    }

    // Extract the Firebase ID token
    const idToken = authHeader.substring(7);
    
    // Verify the token with Firebase Admin
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    
    // Check if the user's UID is in the admin list
    const isAdmin = ADMIN_UIDS.includes(uid);
    
    console.log(`Admin validation check for UID: ${uid} - Result: ${isAdmin}`);
    
    return NextResponse.json({
      isAdmin,
      uid,
      email: decodedToken.email
    });
    
  } catch (error) {
    console.error('Admin validation error:', error);
    return NextResponse.json(
      { error: 'Invalid token or authentication failed' }, 
      { status: 403 }
    );
  }
}

// GET method for simple health check
export async function GET() {
  return NextResponse.json({ 
    message: 'Admin validation endpoint is running',
    timestamp: new Date().toISOString()
  });
}
