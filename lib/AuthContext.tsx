'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { app } from '@/lib/firebase';
// Removed validateAdmin import - using direct UID check instead

// Define the shape of user data
interface UserData {
  uid: string;
  email: string;
  displayName?: string;
  isApproved: boolean;
  isAdmin: boolean;
  approvedAt?: Date;
  hasSignedTerms: boolean;
  termsSignedAt?: Date;
  verificationStatus?: 'pending' | 'approved' | 'rejected';
  reapplyAfter?: Date;
  blacklisted?: boolean;
}

// Define the shape of the context data
interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  refreshUserData: () => Promise<void>;
}

// Create the context with a default value
const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  userData: null, 
  loading: true,
  refreshUserData: async () => {}
});

// Create a provider component
interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const fetchUserData = async (currentUser: User) => {
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      // Check if user is admin using hardcoded UIDs (secure client-side check)
      const ADMIN_UIDS = [
        'IrEAgqbRrfZf77QaAt0jw8YuTd63',
        'TNrQzvNsBwYqiwRl57RsAlGNW0h2'
      ];
      const isAdmin = ADMIN_UIDS.includes(currentUser.uid);
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        const userIsApproved = data.isVerified || data.isApproved || false;
        
        setUserData({
          uid: currentUser.uid,
          email: currentUser.email || '',
          displayName: currentUser.displayName || data.firstName + ' ' + data.lastName || '',
          // Admin status always takes precedence over regular approval status
          isApproved: isAdmin ? true : userIsApproved,
          isAdmin: isAdmin,
          approvedAt: data.verifiedAt?.toDate() || data.approvedAt?.toDate(),
          hasSignedTerms: data.hasSignedTerms || false,
          termsSignedAt: data.termsSignedAt?.toDate(),
          verificationStatus: data.verificationStatus || (userIsApproved ? 'approved' : 'pending'),
          reapplyAfter: data.reapplyAfter ? data.reapplyAfter.toDate?.() ?? data.reapplyAfter : undefined,
          blacklisted: data.blacklisted || false,
        });
      } else {
        // Default user data if document doesn't exist
        setUserData({
          uid: currentUser.uid,
          email: currentUser.email || '',
          displayName: currentUser.displayName || '',
          // Admins are automatically approved
          isApproved: isAdmin,
          isAdmin: isAdmin,
          hasSignedTerms: false,
        });
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      setUserData({
        uid: currentUser.uid,
        email: currentUser.email || '',
        displayName: currentUser.displayName || '',
        isApproved: false,
        isAdmin: false,
        hasSignedTerms: false,
      });
    }
  };

  const refreshUserData = async () => {
    if (user) {
      await fetchUserData(user);
    }
  };

  useEffect(() => {
    // This is the core of Firebase auth state management.
    // It sets up a listener that runs whenever the user's auth state changes.
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        await fetchUserData(currentUser);
      } else {
        setUserData(null);
      }
      
      setLoading(false);
    });

    // Cleanup the listener when the component unmounts
    return () => unsubscribe();
  }, [auth, db]);

  const value = { user, userData, loading, refreshUserData };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

// Create a custom hook to easily use the auth context in other components
export const useAuth = () => {
  return useContext(AuthContext);
};
