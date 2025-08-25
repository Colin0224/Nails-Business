'use client';

import { useState, useEffect } from 'react';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '@/lib/AuthContext';
import { app } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from "@/components/ui/calendar";
import { Toaster, toast } from 'sonner';
import { format } from "date-fns";

// Admin validation is now handled by AuthContext

export default function AvailabilityPage() {
    const { user, userData, loading } = useAuth();
    const router = useRouter();
    const db = getFirestore(app);

    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
    const [timeSlots, setTimeSlots] = useState<string[]>([]);
    const [newTime, setNewTime] = useState('');

    // Fetch time slots for the selected date when it changes
    useEffect(() => {
        if (!selectedDate) return;

        const fetchAvailability = async () => {
            const dateString = format(selectedDate, 'yyyy-MM-dd');
            const docRef = doc(db, 'availability', dateString);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                setTimeSlots(docSnap.data().slots || []);
            } else {
                setTimeSlots([]);
            }
        };

        fetchAvailability();
    }, [selectedDate, db]);
    
    // Page Protection using secure server-side admin validation
    useEffect(() => {
        if (!loading && (!user || !userData?.isAdmin)) {
            toast.error("Access Denied");
            router.push('/');
        }
    }, [user, userData, loading, router]);


    const addTimeSlot = () => {
        if (newTime && !timeSlots.includes(newTime)) {
            // Simple sort for time strings
            const updatedSlots = [...timeSlots, newTime].sort((a, b) => a.localeCompare(b));
            setTimeSlots(updatedSlots);
            setNewTime('');
        }
    };

    const removeTimeSlot = (slotToRemove: string) => {
        setTimeSlots(timeSlots.filter(slot => slot !== slotToRemove));
    };

    const handleSaveAvailability = async () => {
        if (!selectedDate) {
            toast.error("Please select a date.");
            return;
        }
        try {
            const dateString = format(selectedDate, 'yyyy-MM-dd');
            const docRef = doc(db, 'availability', dateString);
            await setDoc(docRef, { slots: timeSlots });
            toast.success(`Availability for ${dateString} has been saved!`);
        } catch (error) {
            toast.error("Failed to save availability.");
            console.error("Error saving availability: ", error);
        }
    };
    
    if (loading || !user || !userData?.isAdmin) {
        return <p className="text-center mt-20">Verifying access...</p>;
    }

    return (
        <>
            <div className="max-w-4xl mx-auto my-12 p-8">
                <h1 className="text-4xl font-bold mb-8">Manage Availability</h1>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Calendar Section */}
                    <div className="flex flex-col items-center">
                        <h2 className="text-2xl font-semibold mb-4">Select a Date</h2>
                        <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={setSelectedDate}
                            className="rounded-md border"
                        />
                    </div>

                    {/* Time Slots Section */}
                    <div>
                        <h2 className="text-2xl font-semibold mb-4">
                            Available Slots for {selectedDate ? format(selectedDate, 'PPP') : '...'}
                        </h2>
                        <div className="space-y-4">
                            {timeSlots.map(slot => (
                                <div key={slot} className="flex items-center justify-between bg-gray-100 p-2 rounded">
                                    <span>{slot}</span>
                                    <Button variant="ghost" size="sm" onClick={() => removeTimeSlot(slot)}>Remove</Button>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2 mt-4">
                            <Input
                                type="time"
                                value={newTime}
                                onChange={(e) => setNewTime(e.target.value)}
                            />
                            <Button onClick={addTimeSlot}>Add Slot</Button>
                        </div>
                        <Button onClick={handleSaveAvailability} className="w-full mt-6">Save Availability for this Date</Button>
                    </div>
                </div>
            </div>
            <Toaster />
        </>
    );
}