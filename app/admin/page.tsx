'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getFirestore, collection, getDocs, doc, updateDoc, query, orderBy, deleteDoc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '@/lib/AuthContext';
import { app } from '@/lib/firebase';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Calendar } from "@/components/ui/calendar";
import { Toaster, toast } from 'sonner';
import { LoadingPage } from '@/app/components/LoadingSpinner';
import ConfirmationDialog from '@/app/components/ConfirmationDialog';
import { UserCheck, Clock, Calendar as CalendarIcon, Settings, List } from 'lucide-react';

const db = getFirestore(app);

// Interface for pending approvals
interface PendingApproval {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  instagramHandle: string;
  submittedAt: Date;
  status: 'pending' | 'approved' | 'rejected';
}

// Interface for appointments (keeping existing)
interface Appointment {
  id: string;
  userId: string;
  customerName: string;
  email: string;
  phoneNumber: string;
  service: string;
  appointmentDate: string;
  appointmentTime: string;
  status: 'confirmed' | 'pending' | 'completed' | 'cancelled';
  totalPrice: number;
  createdAt: Date;
  notes?: string;
}

export default function AdminPage() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'appointments' | 'availability' | 'waitlist' | 'reviews'>('appointments');
  
  // Availability state
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [newTime, setNewTime] = useState('');
  
  // Calendar view states for appointments
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [selectedAppointmentDate, setSelectedAppointmentDate] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  
  // Existing availability state
  const [existingAvailability, setExistingAvailability] = useState<Record<string, string[]>>({});
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);
  
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant?: 'default' | 'destructive';
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  useEffect(() => {
    const initializeData = async () => {
      if (!user) return;
      
      try {
        await Promise.all([
          loadPendingApprovals(),
          fetchAppointments(),
          loadExistingAvailability()
        ]);
      } catch (error) {
        console.error('Error initializing admin data:', error);
        setError('Failed to load admin data');
      } finally {
        setIsLoading(false);
      }
    };

    initializeData();
  }, [user]);

  const loadPendingApprovals = async () => {
    try {
      // First, get list of admin emails to exclude from waitlist
      const techniciansQuery = query(collection(db, 'technicians'));
      const techniciansSnapshot = await getDocs(techniciansQuery);
      const adminEmails = new Set<string>();
      techniciansSnapshot.docs.forEach(doc => {
        const techData = doc.data();
        if (techData.email) {
          adminEmails.add(techData.email.toLowerCase());
        }
      });

      // Load from pendingVerifications collection (old signup process)
      const approvalsQuery = query(
        collection(db, 'pendingVerifications'),
        orderBy('submittedAt', 'desc')
      );
      const snapshot = await getDocs(approvalsQuery);
      const approvals = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PendingApproval[];
      
      // Filter out admin accounts from pendingVerifications
      const filteredApprovals = approvals.filter(approval => 
        !adminEmails.has(approval.email?.toLowerCase() || '')
      );
      
      // Also load unapproved users from users collection (new signup process)
      const usersQuery = query(collection(db, 'users'));
      const usersSnapshot = await getDocs(usersQuery);
      const unapprovedUsers: PendingApproval[] = [];
      
      usersSnapshot.docs.forEach(doc => {
        const userData = doc.data();
        const userEmail = userData.email?.toLowerCase() || '';
        
        // Check if user is not verified/approved AND not an admin
        const isRejected = userData.verificationStatus === 'rejected' || userData.blacklisted === true;
        if (!userData.isVerified && !userData.isApproved && !adminEmails.has(userEmail) && !isRejected) {
          unapprovedUsers.push({
            id: doc.id,
            userId: doc.id,
            firstName: userData.firstName || '',
            lastName: userData.lastName || '',
            email: userData.email || '',
            phone: userData.phone || userData.phoneNumber || '',
            instagramHandle: userData.instagramHandle || userData.instagram || '',
            submittedAt: userData.createdAt || userData.joinedAt || new Date(),
            status: 'pending'
          });
        }
      });
      
      // Combine both sources and filter for pending only
      const allApprovals = [...filteredApprovals, ...unapprovedUsers];
      setPendingApprovals(allApprovals.filter(v => v.status === 'pending'));
    } catch (error) {
      console.error('Error loading pending approvals:', error);
    }
  };

  const loadExistingAvailability = async () => {
    try {
      // Load availability for current month and next month
      const currentDate = new Date();
      const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
      
      const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0);
      
      const availabilityData: Record<string, string[]> = {};
      
      // Generate date range to check
      for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
        const dateString = format(date, 'yyyy-MM-dd');
        try {
          const docRef = doc(db, 'availability', dateString);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists() && docSnap.data().slots) {
            availabilityData[dateString] = docSnap.data().slots;
          }
        } catch (error) {
          console.error(`Error loading availability for ${dateString}:`, error);
        }
      }
      
      setExistingAvailability(availabilityData);
    } catch (error) {
      console.error('Error loading existing availability:', error);
    }
  };

  // Function to fetch all appointments from Firestore
  const fetchAppointments = async () => {
    setError(null);
    try {
      // Query the "appointments" collection, ordering by newest first
      const q = query(collection(db, "appointments"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const apptsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Appointment));
      setAppointments(apptsData);
    } catch (error) {
      console.error("Error fetching appointments: ", error);
      setError("Failed to load appointments. Please try again.");
      toast.error("Failed to fetch appointments.", {
        description: "There was an error loading the appointment data."
      });
    }
  };

  // Function to update appointment status
  const updateAppointmentStatus = async (appointmentId: string, newStatus: string) => {
    try {
      const appointmentRef = doc(db, "appointments", appointmentId);
      await updateDoc(appointmentRef, { status: newStatus });
      
      toast.success(`Appointment ${newStatus} successfully.`);
      fetchAppointments(); // Refresh the appointments list
    } catch (error) {
      console.error("Error updating appointment:", error);
      toast.error("Failed to update appointment.", {
        description: "There was an error updating the appointment status."
      });
    }
  };

  // Function to delete an appointment
  const deleteAppointment = async (appointmentId: string) => {
    try {
      await deleteDoc(doc(db, "appointments", appointmentId));
      toast.success("Appointment deleted successfully.");
      fetchAppointments(); // Refresh the appointments list
    } catch (error) {
      console.error("Error deleting appointment:", error);
      toast.error("Failed to delete appointment.", {
        description: "There was an error deleting the appointment."
      });
    }
  };

  const handleApproveUser = async (approval: PendingApproval, approved: boolean) => {
    try {
      // Update user document (also write reapplyAfter when rejected)
      const userRef = doc(db, 'users', approval.userId);
      const payload: any = {
        isVerified: approved,
        isApproved: approved,
        verificationStatus: approved ? 'approved' : 'rejected',
        verifiedAt: approved ? new Date() : null,
      };
      if (!approved) {
        // Permanently reject: flag the account as blacklisted
        payload.blacklisted = true;
        payload.blacklistedAt = new Date();
      }
      await updateDoc(userRef, payload);

      // Update pending verification record if it exists
      try {
        const pendingVerificationDoc = doc(db, 'pendingVerifications', approval.id);
        const docSnap = await getDoc(pendingVerificationDoc);
        
        if (docSnap.exists()) {
          await updateDoc(pendingVerificationDoc, {
            status: approved ? 'approved' : 'rejected',
            processedAt: new Date(),
          });
        }
      } catch (error) {
        console.log('No pendingVerifications record to update (user signed up through regular flow)');
      }

      toast.success(approved ? 'User approved successfully' : 'User rejected permanently. They will be notified and cannot reapply.');
      
      await loadPendingApprovals();
    } catch (error) {
      console.error('Error processing approval:', error);
      toast.error('Failed to process approval');
    }
  };

  // Function to show confirmation dialog for various operations
  const confirmAction = (title: string, description: string, onConfirm: () => void, variant: 'default' | 'destructive' = 'default') => {
    setConfirmDialog({
      isOpen: true,
      title,
      description,
      onConfirm,
      variant,
    });
  };

  const confirmApproval = (approval: PendingApproval, approved: boolean) => {
    const action = approved ? 'approve' : 'reject';
    const message = approved 
      ? `This will approve ${approval.firstName} ${approval.lastName} and allow them to book appointments.`
      : `This will reject ${approval.firstName} ${approval.lastName}'s application.`;
    
    confirmAction(
      `${approved ? 'Approve' : 'Reject'} User`,
      message,
      () => handleApproveUser(approval, approved),
      approved ? 'default' : 'destructive'
    );
  };

  // Availability management functions
  const handleDateToggle = (date: Date) => {
    const dateString = format(date, 'yyyy-MM-dd');
    const isSelected = selectedDates.some(selectedDate => 
      format(selectedDate, 'yyyy-MM-dd') === dateString
    );
    
    if (isSelected) {
      // Remove date from selection
      setSelectedDates(selectedDates.filter(selectedDate => 
        format(selectedDate, 'yyyy-MM-dd') !== dateString
      ));
    } else {
      // Add date to selection
      setSelectedDates([...selectedDates, date]);
    }
  };

  const addTimeSlot = () => {
    if (newTime && !timeSlots.includes(newTime)) {
      // Convert to 12-hour format
      const timeFormatted = format12Hour(newTime);
      // Simple sort for time strings
      const updatedSlots = [...timeSlots, timeFormatted].sort((a, b) => {
        // Convert back to 24-hour for comparison
        const timeA = convertTo24Hour(a);
        const timeB = convertTo24Hour(b);
        return timeA.localeCompare(timeB);
      });
      setTimeSlots(updatedSlots);
      setNewTime('');
    }
  };

  const removeTimeSlot = (slotToRemove: string) => {
    setTimeSlots(timeSlots.filter(slot => slot !== slotToRemove));
  };

  const handleSaveAvailability = async () => {
    if (selectedDates.length === 0) {
      toast.error("Please select at least one date.");
      return;
    }
    
    if (timeSlots.length === 0) {
      toast.error("Please add at least one time slot.");
      return;
    }

    try {
      const savePromises = selectedDates.map(async (date) => {
        const dateString = format(date, 'yyyy-MM-dd');
        const docRef = doc(db, 'availability', dateString);
        
        // Get existing slots for this date
        const existingSlots = existingAvailability[dateString] || [];
        
        // Combine existing slots with new slots and remove duplicates
        const combinedSlots = [...new Set([...existingSlots, ...timeSlots])];
        
        // Sort the slots chronologically
        combinedSlots.sort((a, b) => {
          const timeA = a.includes('AM') || a.includes('PM') ? convertTo24Hour(a) : a;
          const timeB = b.includes('AM') || b.includes('PM') ? convertTo24Hour(b) : b;
          return timeA.localeCompare(timeB);
        });
        
        return setDoc(docRef, { slots: combinedSlots });
      });
      
      await Promise.all(savePromises);
      
      toast.success(`Availability added for ${selectedDates.length} date${selectedDates.length > 1 ? 's' : ''}!`);
      
      // Refresh existing availability data
      await loadExistingAvailability();
      
      // Clear selections after saving
      setSelectedDates([]);
      setTimeSlots([]);
    } catch (error) {
      toast.error("Failed to save availability.");
      console.error("Error saving availability: ", error);
    }
  };

  // Helper functions for time formatting
  const format12Hour = (time24: string) => {
    // If it already contains AM/PM, return as is
    if (time24.includes('AM') || time24.includes('PM')) {
      return time24;
    }
    
    // Handle 24-hour format
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const convertTo24Hour = (time12: string) => {
    // If it doesn't contain AM/PM, assume it's already 24-hour format
    if (!time12.includes('AM') && !time12.includes('PM')) {
      return time12;
    }
    
    const match = time12.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return time12;
    
    const [, hours, minutes, ampm] = match;
    let hour = parseInt(hours);
    
    if (ampm.toUpperCase() === 'PM' && hour !== 12) {
      hour += 12;
    } else if (ampm.toUpperCase() === 'AM' && hour === 12) {
      hour = 0;
    }
    
    return `${hour.toString().padStart(2, '0')}:${minutes}`;
  };

  // Generate time options in 15-minute increments
  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        options.push(timeString);
      }
    }
    return options;
  };

  // Generate time options for display (12-hour format)
  const generateDisplayTimeOptions = () => {
    const options = generateTimeOptions();
    return options.map(time => ({
      value: time,
      display: format12Hour(time)
    }));
  };

  // Delete availability for a specific date
  const deleteAvailability = async (date: Date) => {
    try {
      const dateString = format(date, 'yyyy-MM-dd');
      const docRef = doc(db, 'availability', dateString);
      await deleteDoc(docRef);
      
      toast.success(`Availability deleted for ${format(date, 'MMM d, yyyy')}`);
      
      // Refresh existing availability data
      await loadExistingAvailability();
    } catch (error) {
      toast.error("Failed to delete availability.");
      console.error("Error deleting availability: ", error);
    }
  };

  // Show a loading state while we verify the user
  if (loading) {
    return <LoadingPage text="Verifying admin access..." />;
  }

  // Check if user is authenticated and admin
  if (!user) {
    router.push('/login?redirect=/admin');
    return <LoadingPage text="Redirecting to login..." />;
  }

  // Check if user is admin using secure server-side validation
  if (!userData?.isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-4">You don't have permission to access the admin panel.</p>
          <Button onClick={() => router.push('/')}>Return Home</Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <LoadingPage text="Loading admin dashboard..." />;
  }

  const formatDate = (timestamp: any) => {
    try {
      if (!timestamp) return 'N/A';
      
      let date;
      if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      } else {
        return 'N/A';
      }
      
      return format(date, 'MMM d, yyyy h:mm a');
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'N/A';
    }
  };

  // Helper functions for calendar view
  const getAppointmentsForDate = (date: Date) => {
    const dateString = format(date, 'yyyy-MM-dd');
    return appointments.filter(appointment => appointment.appointmentDate === dateString);
  };

  const getAppointmentCountForDate = (date: Date) => {
    return getAppointmentsForDate(date).length;
  };

  const hasAppointmentsOnDate = (date: Date) => {
    return getAppointmentCountForDate(date) > 0;
  };

  const getSelectedDateAppointments = () => {
    if (!selectedAppointmentDate) return [];
    return getAppointmentsForDate(selectedAppointmentDate);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm sm:text-base text-gray-600">Manage appointments, availability, waitlist approvals and reviews</p>
        </div>

        {/* Tab Navigation */}
        <div className="mb-4 sm:mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex overflow-x-auto tab-scroll space-x-4 sm:space-x-8 pb-1">
              {[
                { id: 'appointments', label: 'Appointments', count: appointments.length, icon: CalendarIcon },
                { id: 'availability', label: 'Availability', count: 0, icon: Settings },
                { id: 'waitlist', label: 'Waitlist Management', count: pendingApprovals.length, icon: Clock },
                { id: 'reviews', label: 'Reviews', count: 0, icon: UserCheck },
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-1 sm:gap-2 py-3 px-2 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap min-h-[44px] touch-manipulation ${
                      activeTab === tab.id
                        ? 'border-rose-500 text-rose-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="hidden xs:inline sm:inline admin-tab-label">{tab.label}</span>
                    <span className="xs:hidden sm:hidden admin-tab-label">{tab.id === 'appointments' ? 'Appts' : tab.id === 'availability' ? 'Avail' : tab.id === 'waitlist' ? 'Wait' : 'Rev'}</span>
                    {tab.count > 0 && (
                      <Badge variant="secondary" className="ml-1 text-xs flex-shrink-0">
                        {tab.count}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'appointments' && (
          <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <h2 className="text-lg sm:text-xl font-semibold">Appointment Management</h2>
              <div className="flex gap-2 mobile-button-group">
                <Button 
                  onClick={() => setViewMode(viewMode === 'calendar' ? 'list' : 'calendar')}
                  variant="outline" 
                  size="sm"
                  className="flex-1 sm:flex-none min-h-[44px] touch-manipulation"
                >
                  {viewMode === 'calendar' ? <List className="w-4 h-4 mr-1 sm:mr-2 flex-shrink-0" /> : <CalendarIcon className="w-4 h-4 mr-1 sm:mr-2 flex-shrink-0" />}
                  <span className="hidden xs:inline">{viewMode === 'calendar' ? 'List View' : 'Calendar View'}</span>
                  <span className="xs:hidden">{viewMode === 'calendar' ? 'List' : 'Cal'}</span>
                </Button>
                <Button onClick={fetchAppointments} variant="outline" size="sm" className="flex-1 sm:flex-none min-h-[44px] touch-manipulation">
                  <span className="hidden xs:inline">Refresh</span>
                  <span className="xs:hidden">↻</span>
                </Button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-red-800">{error}</p>
              </div>
            )}

            {appointments.length === 0 ? (
              <Card className="p-8 text-center">
                <CalendarIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No appointments found</h3>
                <p className="text-gray-500">Appointments will appear here once customers start booking.</p>
              </Card>
            ) : (
              <>
                {viewMode === 'calendar' ? (
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
                    {/* Calendar View */}
                    <div className="xl:col-span-2">
                      <Card className="p-3 sm:p-6">
                        <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Appointment Calendar</h3>
                        <Calendar
                          mode="single"
                          selected={selectedAppointmentDate || undefined}
                          onSelect={(date) => setSelectedAppointmentDate(date || null)}
                          month={calendarDate}
                          onMonthChange={setCalendarDate}
                          modifiers={{
                            hasAppointments: (date) => hasAppointmentsOnDate(date)
                          }}
                          modifiersClassNames={{
                            hasAppointments: "bg-blue-100 text-blue-900 font-semibold hover:bg-blue-200"
                          }}
                          components={{
                            DayButton: ({ day, modifiers, ...props }) => {
                              const count = getAppointmentCountForDate(day.date);
                              const hasAppointments = count > 0;
                              
                              return (
                                <div className="relative w-full h-full">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`w-full h-full min-h-[44px] min-w-[44px] flex flex-col gap-1 p-1 text-xs sm:text-sm touch-manipulation ${
                                      hasAppointments 
                                        ? 'bg-blue-100 hover:bg-blue-200 text-blue-900 font-semibold border-2 border-blue-300' 
                                        : ''
                                    } ${
                                      selectedAppointmentDate && 
                                      format(day.date, 'yyyy-MM-dd') === format(selectedAppointmentDate, 'yyyy-MM-dd')
                                        ? 'ring-2 ring-blue-500' 
                                        : ''
                                    }`}
                                    {...props}
                                  >
                                    <span>{format(day.date, 'd')}</span>
                                    {hasAppointments && (
                                      <div className="absolute bottom-1 right-1 bg-blue-600 text-white text-xs rounded-full w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center">
                                        {count}
                                      </div>
                                    )}
                                  </Button>
                                </div>
                              );
                            }
                          }}
                          className="w-full"
                        />
                        <div className="mt-3 sm:mt-4 flex items-center gap-4 text-xs sm:text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 sm:w-4 sm:h-4 bg-blue-100 border-2 border-blue-300 rounded"></div>
                            <span>Days with appointments</span>
                          </div>
                        </div>
                      </Card>
                    </div>

                    {/* Selected Date Details */}
                    <div className="xl:col-span-1">
                      <Card className="p-3 sm:p-6">
                        <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">
                          {selectedAppointmentDate 
                            ? `Appointments for ${format(selectedAppointmentDate, 'MMM d, yyyy')}`
                            : 'Select a date to view appointments'
                          }
                        </h3>
                        
                        {selectedAppointmentDate ? (
                          <div className="space-y-3 sm:space-y-4">
                            {getSelectedDateAppointments().length === 0 ? (
                              <p className="text-gray-500 text-center py-6 sm:py-8 text-sm">
                                No appointments on this date
                              </p>
                            ) : (
                              getSelectedDateAppointments().map(appointment => (
                                <div key={appointment.id} className="border rounded-lg p-3 sm:p-4 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <h4 className="font-semibold text-sm sm:text-base truncate">{appointment.customerName}</h4>
                                    <Badge
                                      variant={
                                        appointment.status === 'confirmed' ? 'default' :
                                        appointment.status === 'completed' ? 'secondary' :
                                        appointment.status === 'cancelled' ? 'destructive' : 'outline'
                                      }
                                      className="text-xs"
                                    >
                                      {appointment.status}
                                    </Badge>
                                  </div>
                                  <p className="text-xs sm:text-sm text-gray-600">
                                    <strong>Time:</strong> {appointment.appointmentTime}
                                  </p>
                                  <p className="text-xs sm:text-sm text-gray-600">
                                    <strong>Service:</strong> {appointment.service}
                                  </p>
                                  <p className="text-xs sm:text-sm text-gray-600">
                                    <strong>Price:</strong> ${appointment.totalPrice}
                                  </p>
                                  <p className="text-xs sm:text-sm text-gray-600">
                                    <strong>Phone:</strong> {appointment.phoneNumber}
                                  </p>
                                  {appointment.notes && (
                                    <p className="text-xs sm:text-sm text-gray-600">
                                      <strong>Notes:</strong> {appointment.notes}
                                    </p>
                                  )}
                                  
                                  <div className="flex flex-col gap-1 pt-2">
                                    {appointment.status !== 'confirmed' && (
                                      <Button
                                        onClick={() => updateAppointmentStatus(appointment.id, 'confirmed')}
                                        size="sm"
                                        className="bg-green-600 hover:bg-green-700 text-xs"
                                      >
                                        Confirm
                                      </Button>
                                    )}
                                    {appointment.status !== 'completed' && appointment.status !== 'cancelled' && (
                                      <Button
                                        onClick={() => updateAppointmentStatus(appointment.id, 'completed')}
                                        size="sm"
                                        variant="outline"
                                        className="text-xs"
                                      >
                                        Mark Complete
                                      </Button>
                                    )}
                                    {appointment.status !== 'cancelled' && (
                                      <Button
                                        onClick={() => updateAppointmentStatus(appointment.id, 'cancelled')}
                                        size="sm"
                                        variant="destructive"
                                        className="text-xs"
                                      >
                                        Cancel
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        ) : (
                          <p className="text-gray-500 text-center py-6 sm:py-8 text-sm">
                            Click on a date in the calendar to view appointments
                          </p>
                        )}
                      </Card>
                    </div>
                  </div>
                ) : (
                  /* List View */
                  <div className="space-y-4">
                    {appointments.map(appointment => (
                      <Card key={appointment.id} className="p-6">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <h3 className="font-semibold text-lg">{appointment.customerName}</h3>
                              <Badge
                                variant={
                                  appointment.status === 'confirmed' ? 'default' :
                                  appointment.status === 'completed' ? 'secondary' :
                                  appointment.status === 'cancelled' ? 'destructive' : 'outline'
                                }
                              >
                                {appointment.status}
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-3">
                              <div>
                                <span className="font-medium text-gray-700">Service:</span>
                                <p className="text-gray-600">{appointment.service}</p>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Date & Time:</span>
                                <p className="text-gray-600">
                                  {appointment.appointmentDate} at {appointment.appointmentTime}
                                </p>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Total Price:</span>
                                <p className="text-gray-600">${appointment.totalPrice}</p>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="font-medium text-gray-700">Email:</span>
                                <p className="text-gray-600">{appointment.email}</p>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700">Phone:</span>
                                <p className="text-gray-600">{appointment.phoneNumber}</p>
                              </div>
                            </div>

                            {appointment.notes && (
                              <div className="mt-3 text-sm">
                                <span className="font-medium text-gray-700">Notes:</span>
                                <p className="text-gray-600">{appointment.notes}</p>
                              </div>
                            )}
                            
                            <div className="mt-3 text-sm">
                              <span className="font-medium text-gray-700">Created:</span>
                              <p className="text-gray-600">{formatDate(appointment.createdAt)}</p>
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-2 ml-4">
                            {appointment.status !== 'confirmed' && (
                              <Button
                                onClick={() => updateAppointmentStatus(appointment.id, 'confirmed')}
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                              >
                                Confirm
                              </Button>
                            )}
                            {appointment.status !== 'completed' && appointment.status !== 'cancelled' && (
                              <Button
                                onClick={() => updateAppointmentStatus(appointment.id, 'completed')}
                                size="sm"
                                variant="outline"
                              >
                                Mark Complete
                              </Button>
                            )}
                            {appointment.status !== 'cancelled' && (
                              <Button
                                onClick={() => updateAppointmentStatus(appointment.id, 'cancelled')}
                                size="sm"
                                variant="destructive"
                              >
                                Cancel
                              </Button>
                            )}
                            <Button
                              onClick={() => confirmAction(
                                'Delete Appointment',
                                `Are you sure you want to delete the appointment for ${appointment.customerName}? This action cannot be undone.`,
                                () => deleteAppointment(appointment.id),
                                'destructive'
                              )}
                              size="sm"
                              variant="outline"
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'availability' && (
          <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <h2 className="text-lg sm:text-xl font-semibold">Manage Availability</h2>
              <div className="flex items-center gap-3 sm:gap-4 mobile-button-group">
                {selectedDates.length > 0 && (
                  <Badge variant="secondary" className="text-xs flex-shrink-0">
                    {selectedDates.length} date{selectedDates.length > 1 ? 's' : ''} selected
                  </Badge>
                )}
                <Button 
                  onClick={() => {
                    setSelectedDates([]);
                    setTimeSlots([]);
                  }}
                  variant="outline" 
                  size="sm"
                  disabled={selectedDates.length === 0 && timeSlots.length === 0}
                  className="text-xs sm:text-sm min-h-[44px] touch-manipulation"
                >
                  Clear All
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
              {/* Calendar Section */}
              <Card className="p-4 sm:p-6">
                <div className="flex flex-col items-center">
                  <h3 className="text-base sm:text-lg font-semibold mb-2">Select Dates</h3>
                  <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4 text-center">
                    Click dates to select/deselect them for batch availability setting
                  </p>
                  <Calendar
                    mode="single"
                    modifiers={{
                      selected: (date) => selectedDates.some(selectedDate => 
                        format(selectedDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
                      ),
                      hasAvailability: (date) => {
                        const dateString = format(date, 'yyyy-MM-dd');
                        return existingAvailability[dateString] && existingAvailability[dateString].length > 0;
                      }
                    }}
                    modifiersClassNames={{
                      selected: "bg-rose-500 text-white hover:bg-rose-600 font-semibold",
                      hasAvailability: "bg-green-100 text-green-900 font-medium"
                    }}
                    components={{
                      DayButton: ({ day, modifiers, ...props }) => {
                        const isSelected = selectedDates.some(selectedDate => 
                          format(selectedDate, 'yyyy-MM-dd') === format(day.date, 'yyyy-MM-dd')
                        );
                        const dateString = format(day.date, 'yyyy-MM-dd');
                        const hasExistingSlots = existingAvailability[dateString] && existingAvailability[dateString].length > 0;
                        const slotCount = hasExistingSlots ? existingAvailability[dateString].length : 0;
                        
                        return (
                          <div className="relative w-full h-full">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDateToggle(day.date);
                              }}
                              onMouseEnter={() => setHoveredDate(day.date)}
                              onMouseLeave={() => setHoveredDate(null)}
                              className={`w-full h-full min-h-[44px] min-w-[44px] relative text-xs sm:text-sm touch-manipulation ${
                                isSelected 
                                  ? 'bg-rose-500 text-white hover:bg-rose-600 font-semibold' 
                                  : hasExistingSlots
                                    ? 'bg-green-100 text-green-900 hover:bg-green-200 font-medium'
                                    : 'hover:bg-gray-100'
                              }`}
                            >
                              {format(day.date, 'd')}
                              {hasExistingSlots && (
                                <div className="absolute bottom-1 right-1 bg-green-600 text-white text-xs rounded-full w-4 h-4 sm:w-4 sm:h-4 flex items-center justify-center">
                                  {slotCount}
                                </div>
                              )}
                            </Button>
                          </div>
                        );
                      }
                    }}
                    className="rounded-md border"
                  />
                </div>
                
                {/* Legend */}
                <div className="mt-3 sm:mt-4 space-y-2 text-xs sm:text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 sm:w-4 sm:h-4 bg-rose-500 rounded"></div>
                    <span>Selected dates</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 sm:w-4 sm:h-4 bg-green-100 border border-green-300 rounded"></div>
                    <span>Dates with existing availability</span>
                  </div>
                </div>
              </Card>

              {/* Existing Availability Preview */}
              {(hoveredDate || selectedDates.length > 0) && (
                <Card className="p-4 sm:p-6">
                  <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">
                    Existing Availability
                  </h3>
                  
                  {hoveredDate && !selectedDates.some(d => format(d, 'yyyy-MM-dd') === format(hoveredDate, 'yyyy-MM-dd')) && (
                    <div className="mb-3 sm:mb-4">
                      <h4 className="font-medium text-gray-700 mb-2 text-sm sm:text-base">
                        {format(hoveredDate, 'MMM d, yyyy')}
                      </h4>
                      {(() => {
                        const dateString = format(hoveredDate, 'yyyy-MM-dd');
                        const slots = existingAvailability[dateString];
                        return slots && slots.length > 0 ? (
                          <div className="flex flex-wrap gap-1 sm:gap-2">
                            {slots.map(slot => (
                              <div key={slot} className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs sm:text-sm">
                                {slot.includes('AM') || slot.includes('PM') ? slot : format12Hour(slot)}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-gray-500 text-xs sm:text-sm">No availability set</p>
                        );
                      })()}
                    </div>
                  )}
                  
                  {selectedDates.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-medium text-gray-700 text-sm sm:text-base">Selected Dates:</h4>
                      <div className="max-h-32 overflow-y-auto space-y-2">
                        {selectedDates.map(date => {
                          const dateString = format(date, 'yyyy-MM-dd');
                          const slots = existingAvailability[dateString];
                          return (
                            <div key={dateString} className="border rounded-lg p-2">
                              <div className="flex items-center justify-between mb-1">
                                <div className="font-medium text-xs sm:text-sm">
                                  {format(date, 'MMM d, yyyy')}
                                </div>
                                {slots && slots.length > 0 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => confirmAction(
                                      'Delete Availability',
                                      `Are you sure you want to delete all availability for ${format(date, 'MMM d, yyyy')}? This action cannot be undone.`,
                                      () => deleteAvailability(date),
                                      'destructive'
                                    )}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 h-5 sm:h-6 px-1 sm:px-2 text-xs"
                                  >
                                    Delete
                                  </Button>
                                )}
                              </div>
                              {slots && slots.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {slots.map(slot => (
                                    <span key={slot} className="bg-green-100 text-green-800 px-1 sm:px-1.5 py-0.5 rounded text-xs">
                                      {slot.includes('AM') || slot.includes('PM') ? slot : format12Hour(slot)}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-gray-500 text-xs">No existing availability</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </Card>
              )}

              {/* Time Slots Section */}
              <Card className="p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold mb-2">
                  Time Slots
                </h3>
                <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
                  {selectedDates.length > 0 
                    ? `These times will be set for ${selectedDates.length} selected date${selectedDates.length > 1 ? 's' : ''}`
                    : 'Select dates first, then add time slots'
                  }
                </p>
                
                                {timeSlots.length > 0 ? (
                  <div className="space-y-2 mb-3 sm:mb-4">
                    {timeSlots.map(slot => (
                      <div key={slot} className="flex items-center justify-between bg-gray-50 p-2 sm:p-3 rounded-lg border">
                        <span className="font-medium text-sm sm:text-base">{slot}</span>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => removeTimeSlot(slot)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs sm:text-sm min-h-[44px] touch-manipulation"
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 sm:py-8 text-gray-500">
                    <Settings className="w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm sm:text-base">No time slots added yet</p>
                  </div>
                )}
                
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex flex-col sm:flex-row gap-2 mobile-button-group">
                    <select
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      className="flex-1 border border-gray-300 rounded-md px-2 sm:px-3 py-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 min-h-[44px]"
                    >
                      <option value="">Select time...</option>
                      {generateDisplayTimeOptions().map(({ value, display }) => (
                        <option key={value} value={value}>
                          {display}
                        </option>
                      ))}
                    </select>
                    <Button onClick={addTimeSlot} disabled={!newTime} size="sm" className="text-xs sm:text-sm min-h-[44px] touch-manipulation">
                      Add Slot
                    </Button>
                  </div>
                  
                  <Button 
                    onClick={handleSaveAvailability} 
                    className="w-full bg-rose-600 hover:bg-rose-700 text-xs sm:text-sm min-h-[44px] touch-manipulation"
                    disabled={selectedDates.length === 0 || timeSlots.length === 0}
                    size="sm"
                  >
                    Add Availability for {selectedDates.length} Date{selectedDates.length !== 1 ? 's' : ''}
                  </Button>
                </div>
              </Card>
            </div>

            {/* Selected Dates Summary */}
            {selectedDates.length > 0 && (
              <Card className="p-3 sm:p-4">
                <h4 className="font-semibold mb-2 sm:mb-3 text-sm sm:text-base">Selected Dates:</h4>
                <div className="flex flex-wrap gap-1 sm:gap-2">
                  {selectedDates.map(date => (
                    <Badge 
                      key={format(date, 'yyyy-MM-dd')} 
                      variant="secondary"
                      className="cursor-pointer hover:bg-red-100 text-xs sm:text-sm"
                      onClick={() => handleDateToggle(date)}
                    >
                      {format(date, 'MMM d, yyyy')} ×
                    </Badge>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
        {activeTab === 'waitlist' && (
          <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <h2 className="text-lg sm:text-xl font-semibold">Waitlist Management</h2>
              <Button onClick={loadPendingApprovals} variant="outline" size="sm" className="text-xs sm:text-sm">
                <span className="hidden xs:inline">Refresh</span>
                <span className="xs:hidden">↻</span>
              </Button>
            </div>

            {pendingApprovals.length === 0 ? (
              <Card className="p-6 sm:p-8 text-center">
                <Clock className="w-8 h-8 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">No pending approvals</h3>
                <p className="text-sm sm:text-base text-gray-500">All users have been processed.</p>
              </Card>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {pendingApprovals.map(approval => (
                  <Card key={approval.id} className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-200 rounded-full flex items-center justify-center">
                            <span className="font-medium text-gray-600 text-sm sm:text-base">
                              {approval.firstName[0]}{approval.lastName[0]}
                            </span>
                          </div>
                          <div>
                            <h3 className="font-semibold text-base sm:text-lg">
                              {approval.firstName} {approval.lastName}
                            </h3>
                            <Badge variant="secondary" className="text-xs">
                              On Waitlist
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs sm:text-sm">
                          <div>
                            <span className="font-medium text-gray-700">Email:</span>
                            <p className="text-gray-600 break-all">{approval.email}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Phone:</span>
                            <p className="text-gray-600">{approval.phone}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Instagram:</span>
                            <p className="text-gray-600">{approval.instagramHandle || 'Not provided'}</p>
                          </div>
                        </div>
                        
                        <div className="mt-3 text-xs sm:text-sm">
                          <span className="font-medium text-gray-700">Submitted:</span>
                          <p className="text-gray-600">{formatDate(approval.submittedAt)}</p>
                        </div>
                      </div>
                      
                      <div className="flex flex-row sm:flex-col gap-2 sm:ml-4">
                        <Button
                          onClick={() => confirmApproval(approval, true)}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 flex-1 sm:flex-none text-xs sm:text-sm"
                        >
                          Approve
                        </Button>
                        <Button
                          onClick={() => confirmApproval(approval, false)}
                          size="sm"
                          variant="destructive"
                          className="flex-1 sm:flex-none text-xs sm:text-sm"
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Review Management</h2>
            <Card className="p-8 text-center">
              <UserCheck className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Review management coming soon</h3>
              <p className="text-gray-500">This feature will allow you to moderate and respond to customer reviews.</p>
            </Card>
          </div>
        )}

        
      </div>

      <ConfirmationDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={() => {
          confirmDialog.onConfirm();
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }}
        title={confirmDialog.title}
        description={confirmDialog.description}
        variant={confirmDialog.variant}
      />
      
      <Toaster />
    </div>
  );
}
