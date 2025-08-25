'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { app, storage } from '@/lib/firebase';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import Image from 'next/image';
import { useAuth } from '@/lib/AuthContext';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Toaster, toast } from 'sonner';
import LoadingSpinner, { LoadingPage } from '@/app/components/LoadingSpinner';
import ErrorDisplay from '@/app/components/ErrorDisplay';
import LoyaltyCard from '@/app/components/LoyaltyCard';
import StarRating from '@/app/components/StarRating';
import { LoyaltyService, LoyaltyData } from '@/lib/loyaltyService';
import { ReviewService, Review } from '@/lib/reviewService';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import Link from 'next/link';

interface Appointment {
  id: string;
  service: string;
  date: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: any;
}

const profileFormSchema = z.object({
  firstName: z.string().min(1, { message: "First name is required." }),
  lastName: z.string().min(1, { message: "Last name is required." }),
  phone: z.string().optional(),
  instagramHandle: z.string().optional(),
  dateOfBirth: z.string().optional(),
});

const termsText = `
TERMS OF SERVICE - YVD NAILS

1. APPOINTMENT POLICIES
- 24-hour advance notice required for cancellations
- Late arrivals may result in shortened service time
- No-shows will be charged 50% of service cost

2. PAYMENT TERMS  
- Payment due at time of service
- We accept cash, card, and digital payments
- Gratuity is appreciated but not mandatory

3. HEALTH & SAFETY
- Please inform us of any allergies or skin sensitivities
- We maintain strict sanitation standards
- Services may be refused if health concerns arise

4. LIABILITY
- Client assumes responsibility for allergic reactions
- We are not liable for pre-existing nail conditions
- Photo consent granted for portfolio use unless declined

5. LOYALTY PROGRAM
- Points earned on completed appointments only
- Points expire after 12 months of inactivity
- Discounts cannot be combined with other offers

By signing below, I acknowledge I have read and agree to these terms.
`;

export default function ProfilePage() {
  const { user, userData, loading: authLoading, refreshUserData } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loyaltyData, setLoyaltyData] = useState<LoyaltyData | null>(null);
  const [userReviews, setUserReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'waitlist' | 'terms' | 'appointments' | 'loyalty' | 'reviews'>('profile');
  const [showTerms, setShowTerms] = useState(false);
  const [digitalSignature, setDigitalSignature] = useState('');
  const router = useRouter();
  const db = getFirestore(app);

  const form = useForm<z.infer<typeof profileFormSchema>>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
      instagramHandle: '',
      dateOfBirth: '',
    },
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Load user data when user is available
  useEffect(() => {
    if (user && userData) {
      form.reset({
        firstName: userData.displayName?.split(' ')[0] || '',
        lastName: userData.displayName?.split(' ').slice(1).join(' ') || '',
        phone: '',
        instagramHandle: '',
        dateOfBirth: '',
      });

      // Load additional data from Firestore
      loadUserProfile();
      loadAppointments();
      loadLoyaltyData();
      loadUserReviews();
    }
  }, [user, userData, form]);

  const loadUserProfile = async () => {
    if (!user) return;
    
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        if ((data as any).photoURL) setAvatarUrl((data as any).photoURL);
        form.reset({
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          phone: data.phone || '',
          instagramHandle: data.instagramHandle || '',
          dateOfBirth: data.dateOfBirth || '',
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  const onChooseAvatar = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file || !user) return;
      setIsUploadingAvatar(true);
      try {
        const path = `avatars/${user.uid}_${Date.now()}_${file.name}`;
        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);
        await setDoc(doc(db, 'users', user.uid), { photoURL: url }, { merge: true });
        setAvatarUrl(url);
        toast.success('Profile photo updated');
      } catch (err) {
        console.error(err);
        toast.error('Failed to upload photo');
      } finally {
        setIsUploadingAvatar(false);
      }
    };
    input.click();
  };

  const loadAppointments = async () => {
    if (!user) return;
    
    try {
      const appointmentsQuery = query(
        collection(db, 'appointments'), 
        where('userId', '==', user.uid)
      );
      const appointmentsSnapshot = await getDocs(appointmentsQuery);
      const appointmentsList = appointmentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Appointment[];
      
      setAppointments(appointmentsList);
    } catch (error) {
      console.error('Error loading appointments:', error);
    }
  };

  const loadLoyaltyData = async () => {
    if (!user) return;
    
    try {
      const data = await LoyaltyService.getUserLoyaltyData(user.uid);
      setLoyaltyData(data);
    } catch (error) {
      console.error('Error loading loyalty data:', error);
    }
  };

  const loadUserReviews = async () => {
    if (!user) return;
    
    try {
      const reviews = await ReviewService.getUserReviews(user.uid);
      setUserReviews(reviews);
    } catch (error) {
      console.error('Error loading reviews:', error);
    }
  };

  const onSubmit = async (values: z.infer<typeof profileFormSchema>) => {
    if (!user) return;
    
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone,
        instagramHandle: values.instagramHandle,
        dateOfBirth: values.dateOfBirth,
        updatedAt: new Date(),
      });

      await refreshUserData();
      toast.success('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignTerms = async () => {
    if (!user || !digitalSignature.trim()) {
      toast.error('Please enter your digital signature');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        hasSignedTerms: true,
        termsSignedAt: new Date(),
        digitalSignature: digitalSignature.trim(),
      });

      await refreshUserData();
      toast.success('Terms of Service signed successfully!');
      setDigitalSignature('');
      setShowTerms(false);
    } catch (error) {
      console.error('Error signing terms:', error);
      toast.error('Failed to sign terms. Please try again.');
    }
  };

  if (authLoading) {
    return <LoadingPage />;
  }

  if (!user) {
    return null; // Will redirect to login
  }

  if (error) {
    return <ErrorDisplay message={error} />;
  }

  const getWaitlistStatusBadge = () => {
    if (!userData) return null;
    
    if (userData.isAdmin) {
      return <Badge variant="default" className="bg-purple-500 text-white">Admin ⭐</Badge>;
    } else if (userData.isApproved) {
      return <Badge variant="default" className="bg-green-500 text-white">Member ✓</Badge>;
    } else if (userData.verificationStatus === 'rejected') {
      return <Badge variant="destructive">Rejected</Badge>;
    } else {
      return <Badge variant="secondary" className="bg-yellow-500 text-white">On Waitlist</Badge>;
    }
  };  const getTermsStatusBadge = () => {
    if (!userData) return null;

    if (userData.hasSignedTerms) {
      return <Badge variant="default" className="bg-green-500 text-white">Terms Signed ✓</Badge>;
    } else {
      return <Badge variant="outline" className="border-red-500 text-red-500">Terms Not Signed</Badge>;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Toaster />
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden bg-gray-100 border">
              {avatarUrl ? (
                <Image src={avatarUrl} alt="Profile photo" fill style={{objectFit:'cover'}} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">No Photo</div>
              )}
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-800">My Profile</h1>
              <p className="text-gray-600">Manage your account and preferences</p>
            </div>
          </div>
          <div className="flex gap-2">
            {getWaitlistStatusBadge()}
            {getTermsStatusBadge()}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 mb-6 border-b">
          {[
            { id: 'profile', label: 'Profile' },
            { id: 'waitlist', label: 'Waitlist Status' },
            { id: 'terms', label: 'Terms of Service' },
            { id: 'appointments', label: 'Appointments' },
            { id: 'loyalty', label: 'Loyalty Program' },
            { id: 'reviews', label: 'My Reviews' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-rose-100 text-rose-700 border-b-2 border-rose-500'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <Card className="p-6">
          {activeTab === 'profile' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Profile Information</h2>
                <Button variant="outline" size="sm" onClick={onChooseAvatar} disabled={isUploadingAvatar}>
                  {isUploadingAvatar ? 'Uploading...' : 'Change Photo'}
                </Button>
              </div>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="instagramHandle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Instagram Handle</FormLabel>
                        <FormControl>
                          <Input placeholder="@yourusername" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="dateOfBirth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date of Birth</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Updating...' : 'Update Profile'}
                  </Button>
                </form>
              </Form>
            </div>
          )}

          {activeTab === 'waitlist' && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Waitlist Status</h2>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Status:</span>
                  {getWaitlistStatusBadge()}
                </div>
                
                {userData?.isAdmin ? (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h3 className="font-medium text-purple-800 mb-2">⭐ Admin Account</h3>
                    <p className="text-purple-700 mb-2">
                      You have administrator privileges and can manage the nail salon system.
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Link href="/admin">
                        <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
                          Admin Dashboard
                        </Button>
                      </Link>
                      <Link href="/booking">
                        <Button size="sm" variant="outline">
                          Book Appointment
                        </Button>
                      </Link>
                    </div>
                  </div>
                ) : userData?.isApproved ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h3 className="font-medium text-green-800 mb-2">✓ Active Member</h3>
                    <p className="text-green-700">
                      Your account has been approved by our admin team. You can now book appointments.
                    </p>
                    {userData.approvedAt && (
                      <p className="text-sm text-green-600 mt-2">
                        Approved on: {format(userData.approvedAt, 'MMMM d, yyyy')}
                      </p>
                    )}
                    <Link href="/booking" className="inline-block mt-2">
                      <Button size="sm">Book an Appointment</Button>
                    </Link>
                  </div>
                ) : userData?.verificationStatus === 'rejected' ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h3 className="font-medium text-red-800 mb-2">Application Not Approved</h3>
                    <p className="text-red-700 mb-2">
                      We appreciate your interest. At this time, client capacity is full and we’re unable to accept new appointments. We aren’t accepting reapplications for this account.
                    </p>
                    {userData?.blacklisted && (
                      <p className="text-sm text-red-600">Reapplication is currently unavailable.</p>
                    )}
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h3 className="font-medium text-yellow-800 mb-2">⏳ On Waitlist</h3>
                    <p className="text-yellow-700 mb-2">
                      Your account is currently on our waitlist for approval.
                    </p>
                    <p className="text-sm text-yellow-600">
                      You will receive an email notification once you're approved and can start booking appointments.
                    </p>
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-medium text-blue-800 mb-2">Account Access</h3>
                  <p className="text-blue-700">
                    {userData?.isAdmin 
                      ? "You have full administrative access to the system."
                      : userData?.isApproved 
                        ? "You have full access to our booking system."
                        : "Booking access will be enabled once you're approved from the waitlist."
                    }
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'terms' && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Terms of Service</h2>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Status:</span>
                  {getTermsStatusBadge()}
                </div>

                {userData?.hasSignedTerms ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h3 className="font-medium text-green-800 mb-2">✓ Terms Signed</h3>
                    <p className="text-green-700 mb-2">
                      You have digitally signed our Terms of Service. This signature will be used for all your future bookings.
                    </p>
                    {userData.termsSignedAt && (
                      <p className="text-sm text-green-600">
                        Signed on: {format(userData.termsSignedAt, 'MMMM d, yyyy')}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h3 className="font-medium text-red-800 mb-2">⚠️ Terms Not Signed</h3>
                    <p className="text-red-700 mb-4">
                      You need to sign our Terms of Service to complete bookings. Sign once here and it will apply to all your future appointments.
                    </p>
                    
                    <Link href="/terms">
                      <Button 
                        variant="outline"
                        className="border-red-500 text-red-700 hover:bg-red-50"
                      >
                        Review and Sign Terms
                      </Button>
                    </Link>
                  </div>
                )}

                {showTerms && (
                  <div className="border rounded-lg p-4 space-y-4">
                    <div className="max-h-64 overflow-y-auto bg-gray-50 p-4 rounded border">
                      <pre className="whitespace-pre-wrap text-sm">{termsText}</pre>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="block text-sm font-medium">
                        Digital Signature (Type your full name)
                      </label>
                      <Input
                        value={digitalSignature}
                        onChange={(e) => setDigitalSignature(e.target.value)}
                        placeholder="Enter your full name as digital signature"
                      />
                    </div>
                    
                    <div className="flex gap-2">
                      <Button onClick={handleSignTerms} disabled={!digitalSignature.trim()}>
                        Sign Terms of Service
                      </Button>
                      <Button variant="outline" onClick={() => setShowTerms(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'appointments' && (
            <div>
              <h2 className="text-xl font-semibold mb-4">My Appointments</h2>
              {appointments.length === 0 ? (
                <p className="text-gray-600">No appointments found.</p>
              ) : (
                <div className="space-y-4">
                  {appointments.map(appointment => (
                    <div key={appointment.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium">{appointment.service}</h3>
                          <p className="text-gray-600">{appointment.date}</p>
                        </div>
                        <Badge variant={
                          appointment.status === 'confirmed' ? 'default' :
                          appointment.status === 'pending' ? 'secondary' : 'destructive'
                        }>
                          {appointment.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'loyalty' && loyaltyData && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Loyalty Program</h2>
              <LoyaltyCard 
                points={loyaltyData.points}
                nextReward={100}
              />
            </div>
          )}

          {activeTab === 'reviews' && (
            <div>
              <h2 className="text-xl font-semibold mb-4">My Reviews</h2>
              {userReviews.length === 0 ? (
                <p className="text-gray-600">You haven't written any reviews yet.</p>
              ) : (
                <div className="space-y-4">
                  {userReviews.map(review => (
                    <div key={review.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-medium">{review.service}</h3>
                          <StarRating rating={review.rating} readonly />
                        </div>
                        <span className="text-sm text-gray-500">
                          {format(review.createdAt.toDate(), 'MMM d, yyyy')}
                        </span>
                      </div>
                      <p className="text-gray-700">{review.comment}</p>
                      {review.technician && (
                        <p className="text-sm text-gray-600 mt-1">
                          Technician: {review.technician}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
