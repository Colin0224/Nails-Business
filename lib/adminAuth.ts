import { getAuth } from 'firebase/auth';
import { app } from './firebase';

/**
 * Get Firebase ID token for API authentication
 */
async function getIdToken(): Promise<string | null> {
  const auth = getAuth(app);
  const user = auth.currentUser;
  if (!user) return null;
  
  try {
    return await user.getIdToken();
  } catch (error) {
    console.error('Failed to get ID token:', error);
    return null;
  }
}

/**
 * Validate if the current user is an admin using server-side validation
 * @returns Promise<boolean> - true if user is admin, false otherwise
 */
export async function validateAdmin(): Promise<boolean> {
  try {
    const idToken = await getIdToken();
    if (!idToken) return false;
    
    const response = await fetch('/api/admin/validate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) return false;
    
    const data = await response.json();
    return data.isAdmin || false;
  } catch (error) {
    console.error('Admin validation failed:', error);
    return false;
  }
}

/**
 * Get comprehensive admin status and user data
 * @returns Promise<AdminStatusResult>
 */
export interface AdminStatusResult {
  isAdmin: boolean;
  uid: string;
  userData: any;
  hasUserDoc: boolean;
  error?: string;
}

export async function getAdminStatus(): Promise<AdminStatusResult> {
  try {
    const idToken = await getIdToken();
    if (!idToken) {
      return {
        isAdmin: false,
        uid: '',
        userData: null,
        hasUserDoc: false,
        error: 'Not authenticated'
      };
    }
    
    const response = await fetch('/api/admin/validate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      return {
        isAdmin: false,
        uid: '',
        userData: null,
        hasUserDoc: false,
        error: 'Failed to validate admin status'
      };
    }
    
    const data = await response.json();
    return {
      isAdmin: data.isAdmin || false,
      uid: data.uid || '',
      userData: null, // We'll get this from AuthContext instead
      hasUserDoc: false,
      error: data.error
    };
  } catch (error) {
    console.error('Failed to get admin status:', error);
    return {
      isAdmin: false,
      uid: '',
      userData: null,
      hasUserDoc: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Perform admin operations through secure cloud function
 * @param operation - The operation to perform
 * @param data - Operation-specific data
 * @returns Promise<{success: boolean, message: string}>
 */
export async function performAdminOperation(
  operation: string, 
  data: any
): Promise<{success: boolean, message: string}> {
  try {
    const idToken = await getIdToken();
    if (!idToken) {
      throw new Error('Not authenticated');
    }
    
    const response = await fetch('/api/admin/operations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ operation, data }),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Operation failed');
    }
    
    return result;
  } catch (error) {
    console.error('Admin operation failed:', error);
    throw error;
  }
}

/**
 * Helper function to update user approval status
 * @param targetUid - UID of user to update
 * @param approved - Whether to approve or reject
 * @returns Promise<{success: boolean, message: string}>
 */
export async function updateUserApprovalStatus(
  targetUid: string, 
  approved: boolean
): Promise<{success: boolean, message: string}> {
  return performAdminOperation('updateUserStatus', { targetUid, approved });
}

/**
 * Helper function to delete appointment
 * @param appointmentId - ID of appointment to delete
 * @returns Promise<{success: boolean, message: string}>
 */
export async function deleteAppointmentSecure(
  appointmentId: string
): Promise<{success: boolean, message: string}> {
  return performAdminOperation('deleteAppointment', { appointmentId });
}