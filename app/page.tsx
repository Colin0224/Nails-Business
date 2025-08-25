"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from 'next/navigation';
import { useRef, useState, useCallback, useEffect } from "react";
import { useAuth } from '@/lib/AuthContext';
import { flushSync } from 'react-dom';
import LoadingSpinner from './components/LoadingSpinner';
import ServiceCard from './components/ServiceCard';
import ServiceTiers from './components/ServiceTiers';
import Slideshow from './components/Slideshow';

import { getFirestore, collection, getDocs, orderBy, query, doc, setDoc, getDoc } from 'firebase/firestore';
import { app, storage } from '@/lib/firebase';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import ReviewForm from './components/ReviewForm';

export default function Home() {
  const { user, userData } = useAuth();
  const router = useRouter();
  const [showReviewForm, setShowReviewForm] = useState(false);

  // Fade overlay state
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayOpaque, setOverlayOpaque] = useState(false);
  const fadeMinDurationMs = 1300;
  const overlayTransitionMs = 700;
  const overlayPreNavDelayMs = 800;
  const fadeStartAtRef = useRef<number | null>(null);
  const fadeClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fade navigation function
  const navigateWithFade = useCallback((path: string) => {
    flushSync(() => {
      setOverlayVisible(true);
      setOverlayOpaque(true); // Instant full opacity
      fadeStartAtRef.current = Date.now();
    });
    setTimeout(() => {
      router.push(path);
    }, overlayPreNavDelayMs);
  }, [router]);

  // Clear overlay after navigation
  useEffect(() => {
    if (!overlayVisible) return;
    const startedAt = fadeStartAtRef.current ?? Date.now();
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(fadeMinDurationMs - elapsed, 0);
    if (fadeClearTimerRef.current) clearTimeout(fadeClearTimerRef.current);
    fadeClearTimerRef.current = setTimeout(() => {
      setOverlayOpaque(false);
      setTimeout(() => {
        setOverlayVisible(false);
        fadeStartAtRef.current = null;
      }, overlayTransitionMs);
    }, remaining);
    return () => {
      if (fadeClearTimerRef.current) clearTimeout(fadeClearTimerRef.current);
    };
  }, [overlayVisible]);

  // Define all services (Design + GELX)
  const services = [
    {
      name: "Tier 1",
      description: "Classic artistry or basic GELX styling – single color, cuticle care, base & top coat",
      prices: [
        { label: "Design", value: "$70" },
        { label: "GELX", value: "$85" }
      ]
    },
    {
      name: "Tier 2",
      description: "Enhanced designs – two‑tone, simple patterns, French tips, strengthening",
      prices: [
        { label: "Design", value: "$80" },
        { label: "GELX", value: "$95" }
      ]
    },
    {
      name: "Tier 3",
      description: "Premium artistry – complex patterns, hand‑painted details, texture work",
      prices: [
        { label: "Design", value: "$90" },
        { label: "GELX", value: "$105" }
      ]
    },
    {
      name: "Tier 4",
      description: "Master‑level – 3D art, crystals, custom designs, luxury treatment",
      prices: [
        { label: "Design", value: "$100" },
        { label: "GELX", value: "$115" }
      ]
    }
  ];

  const [galleryImages, setGalleryImages] = useState([
    { src: '/1.jpg', alt: 'Elegant nude nail design with gold accents', name: 'Golden Touch' },
    { src: '/2.jpg', alt: 'Vibrant pink gradient nails', name: 'Sunset Blush' },
    { src: '/3.jpg', alt: 'Sophisticated black and white nail art', name: 'Monochrome Magic' },
    { src: '/4.jpg', alt: 'Delicate floral nail designs', name: 'Spring Blooms' },
    { src: '/5.jpg', alt: 'Shimmery silver chrome nails', name: 'Silver Dreams' },
    { src: '/6.jpg', alt: 'Trendy pink chrome nails', name: 'Rose Gold' },
    { src: '/7.jpg', alt: 'Intricate blue nail designs', name: 'Ocean Waves' },
    { src: '/8.jpg', alt: 'A classic, glossy red manicure', name: 'Cherry Blossom' }
  ]);

  // Admin inline editing: replace hero or gallery images
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingReplaceIndex, setPendingReplaceIndex] = useState<number | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<'hero' | 'gallery' | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);

  const replaceGalleryImage = (index: number) => {
    if (!userData?.isAdmin) return;
    setReplaceTarget('gallery');
    setPendingReplaceIndex(index);
    fileInputRef.current?.click();
  };

  const replaceHeroImage = () => {
    if (!userData?.isAdmin) return;
    setReplaceTarget('hero');
    setPendingReplaceIndex(null);
    fileInputRef.current?.click();
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replaceTarget) return;
    try {
      setIsUploading(true);
      const path = `${replaceTarget}/${Date.now()}_${file.name}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      const db = getFirestore(app);
      const name = file.name.replace(/\.[^.]+$/, '');
      if (replaceTarget === 'hero') {
        await setDoc(doc(db, 'settings', 'site'), { heroUrl: url }, { merge: true });
        setHeroUrl(url);
      } else if (replaceTarget === 'gallery' && pendingReplaceIndex !== null) {
        // Persist replacement by creating/overwriting a doc with the same order index
        await setDoc(doc(db, 'gallery', `order_${pendingReplaceIndex}`), {
          url,
          alt: name,
          name,
          order: pendingReplaceIndex + 1,
          storagePath: path,
        });
        setGalleryImages((prev) => prev.map((img, i) => i === pendingReplaceIndex ? { src: url, alt: name, name } : img));
      }
    } finally {
      setIsUploading(false);
      setPendingReplaceIndex(null);
      setReplaceTarget(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    const loadGallery = async () => {
      try {
        const db = getFirestore(app);
        // Load hero first
        const settingsDoc = await getDoc(doc(db, 'settings', 'site'));
        const hero = settingsDoc.exists() ? (settingsDoc.data() as any).heroUrl : null;
        if (hero) setHeroUrl(hero);
        const q = query(collection(db, 'gallery'), orderBy('order', 'asc'));
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => d.data() as any);
        if (list.length > 0) {
          setGalleryImages(list.map((i) => ({ src: i.url, alt: i.alt || i.name, name: i.name })));
        }
      } catch (e) {
        // ignore, fallback to local images
      }
    };
    loadGallery();
  }, []);

  return (
    <>
      <main className="bg-brand-cream text-brand-taupe">
      {/* Hero Section */}
      <section className="relative h-[70vh] flex items-center justify-center text-center text-white overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-pink-soft/20 to-brand-dusty-pink/30 z-10"></div>
        <Image
          src={heroUrl || "/image2.png"}
          alt="Beautifully manicured nails"
          layout="fill"
          objectFit="cover"
          className="brightness-90 blur-sm"
        />
        {userData?.isAdmin && (
          <button
            type="button"
            onClick={replaceHeroImage}
            className="absolute top-4 right-4 z-30 flex items-center gap-2 bg-rose-600/90 hover:bg-rose-700 text-white rounded-full px-4 py-2 text-sm font-medium shadow-lg"
            aria-label="Change banner photo"
            title="Change banner photo"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>
            Change banner photo
          </button>
        )}
        <div className="relative z-20 p-6 max-w-4xl mx-auto">
          <h1 className="font-title text-6xl md:text-8xl font-semibold mb-6 text-brand-taupe drop-shadow-sm tracking-widest">
            YVD NAILS
          </h1>
          <p className="font-body text-xl md:text-2xl mb-4 text-brand-taupe-dark/90 drop-shadow-sm font-light tracking-wide">
            Premium Nail Artistry
          </p>
          <p className="script-text text-lg md:text-xl mb-8 text-brand-sage/80 italic">
            Where beauty meets precision
          </p>
          <button
            onClick={() => navigateWithFade('/booking')}
            className="inline-block bg-brand-taupe hover:bg-brand-taupe-dark text-brand-cream px-8 py-4 rounded-full font-semibold text-lg transition-all duration-300 transform hover:scale-105 shadow-lg"
          >
            Book Now
          </button>
        </div>
      </section>

      {/* Services Section (redesigned) */}
      <section id="services" className="py-20 px-4 bg-gradient-to-b from-brand-cream to-brand-light-gray text-center scroll-mt-24">
        <ServiceTiers onBook={(path) => navigateWithFade(path)} />
      </section>

      {/* Gallery Section with Slideshow */}
      <section id="gallery" className="py-20 px-4 bg-gradient-to-b from-brand-pink-soft to-brand-cream text-center scroll-mt-24">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-title text-4xl md:text-5xl font-semibold text-brand-taupe tracking-wider">Portfolio</h2>
            {/* Admin quick-edit input (hidden) and note */}
            {user && (
              <span className="hidden md:inline text-xs text-brand-taupe-light">{isUploading ? 'Uploading...' : ''}</span>
            )}
          </div>
          <p className="font-body text-lg text-brand-taupe-light mb-12 max-w-2xl mx-auto font-light">
            Explore our artistry through stunning nail designs and transformations
          </p>
          <Slideshow
            images={galleryImages}
            editable={!!user}
            onReplace={replaceGalleryImage}
          />
          {/* Hidden file input for replacing gallery images */}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
        </div>
      </section>

      {/* Customer Reviews Section */}
      <section id="reviews" className="py-20 px-4 bg-gradient-to-br from-brand-light-gray to-brand-nude scroll-mt-24">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="font-title text-4xl md:text-5xl font-semibold mb-4 text-brand-taupe tracking-wider">
            What Our Clients Say
          </h2>
          <p className="font-body text-lg text-brand-taupe-light mb-12 max-w-2xl mx-auto font-light">
            Discover why our clients love their nail artistry experience with us
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-brand-pink/20 transform hover:scale-105 transition-transform duration-300">
              <div className="flex justify-center mb-4">
                {[1, 2, 3, 4, 5].map(star => (
                  <svg key={star} className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                  </svg>
                ))}
              </div>
              <p className="text-brand-taupe italic mb-4">
                "Absolutely stunning work! The attention to detail is incredible and the nail art exceeded my expectations. The atmosphere is so relaxing too."
              </p>
              <p className="font-semibold text-brand-taupe">Sarah M.</p>
              <p className="text-sm text-brand-taupe-light">Design Tier 3</p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-lg border border-brand-pink/20 transform hover:scale-105 transition-transform duration-300">
              <div className="flex justify-center mb-4">
                {[1, 2, 3, 4, 5].map(star => (
                  <svg key={star} className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                  </svg>
                ))}
              </div>
              <p className="text-brand-taupe italic mb-4">
                "The GELX extensions are amazing! They last so long and look incredibly natural. The team is professional and friendly."
              </p>
              <p className="font-semibold text-brand-taupe">Maria L.</p>
              <p className="text-sm text-brand-taupe-light">GELX Tier 2</p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-lg border border-brand-pink/20 transform hover:scale-105 transition-transform duration-300">
              <div className="flex justify-center mb-4">
                {[1, 2, 3, 4, 5].map(star => (
                  <svg key={star} className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                  </svg>
                ))}
              </div>
              <p className="text-brand-taupe italic mb-4">
                "I've been coming here for months and the quality is consistently excellent. The loyalty program is a nice bonus too!"
              </p>
              <p className="font-semibold text-brand-taupe">Jennifer K.</p>
              <p className="text-sm text-brand-taupe-light">Loyal Customer</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-2xl border border-brand-pink/20 mb-8">
            <h3 className="font-title text-2xl font-semibold text-brand-taupe mb-6">Share Your Experience</h3>
            <p className="text-brand-taupe-light mb-6">
              Help others discover our exceptional service by sharing your review
            </p>
            
            {!showReviewForm ? (
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => navigateWithFade('/booking')}
                  className="bg-brand-taupe hover:bg-brand-taupe-dark text-brand-cream px-8 py-4 rounded-full font-semibold text-lg transition-all duration-300 transform hover:scale-105 shadow-lg"
                >
                  Book Your Appointment
                </button>
                {user && (
                  <button 
                    onClick={() => setShowReviewForm(true)}
                    className="border-2 border-brand-taupe text-brand-taupe hover:bg-brand-taupe hover:text-brand-cream px-8 py-4 rounded-full font-semibold text-lg transition-all duration-300 transform hover:scale-105"
                  >
                    Write a Review
                  </button>
                )}
                {!user && (
                  <button
                    onClick={() => navigateWithFade('/login')}
                    className="border-2 border-brand-taupe text-brand-taupe hover:bg-brand-taupe hover:text-brand-cream px-8 py-4 rounded-full font-semibold text-lg transition-all duration-300 transform hover:scale-105"
                  >
                    Login to Review
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-8">
                <ReviewForm 
                  onSubmitSuccess={() => {
                    setShowReviewForm(false);
                    // Optionally refresh the page to show new review
                    window.location.reload();
                  }}
                  onCancel={() => setShowReviewForm(false)}
                />
              </div>
            )}
          </div>
        </div>
      </section>
      </main>

      {/* Fade overlay for navigation */}
      {overlayVisible && (
        <div className={`fixed inset-0 z-[60] bg-white flex items-center justify-center ${overlayOpaque ? 'opacity-100' : 'opacity-0'}`}>
          <LoadingSpinner size="md" />
        </div>
      )}
    </>
  );
}
