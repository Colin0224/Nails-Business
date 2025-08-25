'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useAuth } from '@/lib/AuthContext';
import { getAuth, signOut } from 'firebase/auth';
import { app } from '@/lib/firebase';
import LoadingSpinner from './LoadingSpinner';

export default function Header() {
  const { user, userData } = useAuth();
  const router = useRouter();
  const auth = getAuth(app);
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Admin status is now determined by the secure AuthContext

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsMenuOpen(false);
      router.push('/');
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };
  
  const closeMenu = () => setIsMenuOpen(false);

  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayOpaque, setOverlayOpaque] = useState(false);
  const fadeMinDurationMs = 1300;
  const overlayTransitionMs = 700;
  const overlayPreNavDelayMs = 800; // Delay for loading the next page after instant overlay
  const fadeStartAtRef = useRef<number | null>(null);
  const fadeClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();

  // Smooth scroll handler that accounts for sticky header height
  const handleSmoothScroll = useCallback((event: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    event.preventDefault();
    if (window.location.pathname !== '/') {
      setIsMenuOpen(false);
      flushSync(() => {
        setOverlayVisible(true);
        setOverlayOpaque(false);
        fadeStartAtRef.current = Date.now();
      });
      requestAnimationFrame(() => setOverlayOpaque(true));
      router.push(`/#${targetId}`);
      return;
    }

    const element = document.getElementById(targetId);
    if (!element) return;

    const header = document.querySelector('header');
    const headerHeight = header instanceof HTMLElement ? header.offsetHeight : 0;
    const targetPosition = element.getBoundingClientRect().top + window.pageYOffset - headerHeight - 16; // extra gap

    window.scrollTo({ top: Math.max(targetPosition, 0), behavior: 'smooth' });
    setIsMenuOpen(false);
  }, [router]);

  // Fade overlay + navigate for auth pages
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

  // Ensure overlay is cleared after route change completes
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
  }, [pathname, overlayVisible]);

  // Show overlay on back/forward navigations so fade works both ways
  useEffect(() => {
    const onPopState = () => {
      flushSync(() => {
        setOverlayVisible(true);
        setOverlayOpaque(false);
        fadeStartAtRef.current = Date.now();
      });
      requestAnimationFrame(() => setOverlayOpaque(true));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return (
    <header className="bg-white shadow-sm w-full px-4 py-2 sticky top-0 z-50 rounded-b-lg">
      <nav className="max-w-7xl mx-auto flex justify-between items-center">
        <Link href="/" onClick={closeMenu} className="font-title text-xl md:text-2xl font-semibold text-brand-brown hover:text-brand-taupe-dark transition-colors tracking-wide">
          YVD NAILS
        </Link>

        {/* Desktop Navigation Links - Using your preferred UI */}
        <div className="hidden md:flex items-center gap-8">
          <Link href="/#services" onClick={(e) => handleSmoothScroll(e, 'services')} className="font-body text-brand-brown/80 hover:text-brand-brown transition-colors font-medium">
            Design Tiers
          </Link>
          <Link href="/#reviews" onClick={(e) => handleSmoothScroll(e, 'reviews')} className="font-body text-brand-brown/80 hover:text-brand-brown transition-colors font-medium">
            Reviews
          </Link>
          <Link href="/#gallery" onClick={(e) => handleSmoothScroll(e, 'gallery')} className="font-body text-brand-brown/80 hover:text-brand-brown transition-colors font-medium">
            Portfolio
          </Link>
          
          {user ? (
            <>
              {/* Secure admin link based on server-validated admin status */}
              {userData?.isAdmin && (
                <div className="flex items-center gap-4">
                  <Link href="/admin" className="font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                    Admin
                  </Link>
                  
                </div>
              )}
              <Link href="/profile" className="text-gray-600 hover:text-pink-500 transition-colors">
                Profile
              </Link>
              <button onClick={handleLogout} className="text-gray-600 hover:text-pink-500 transition-colors">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login" onClick={(e) => { e.preventDefault(); navigateWithFade('/login'); }} className="text-gray-600 hover:text-pink-500 transition-colors">
                Login
              </Link>
              <Link href="/signup" onClick={(e) => { e.preventDefault(); navigateWithFade('/signup'); }} className="text-gray-600 hover:text-pink-500 transition-colors">
                Sign Up
              </Link>
            </>
          )}
        </div>
        
        {/* Mobile Menu Button */}
        <div className="md:hidden">
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-gray-600 hover:text-pink-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path></svg>
            </button>
        </div>
      </nav>

      {/* Mobile Menu - Using your preferred UI that pushes content down */}
      <div
        className={`md:hidden mt-2 origin-top grid transition-all duration-300 ease-out overflow-hidden
          ${isMenuOpen ? 'grid-rows-[1fr] opacity-100 translate-y-0' : 'grid-rows-[0fr] opacity-0 -translate-y-1'}`}
        aria-hidden={!isMenuOpen}
      >
        <div className="min-h-0 flex flex-col items-center space-y-4 py-2">
          <Link href="/#services" onClick={(e) => handleSmoothScroll(e, 'services')} className="text-brand-brown/80 hover:text-brand-brown">Design Tiers</Link>
          <Link href="/#reviews" onClick={(e) => handleSmoothScroll(e, 'reviews')} className="text-brand-brown/80 hover:text-brand-brown">Reviews</Link>
          <Link href="/#gallery" onClick={(e) => handleSmoothScroll(e, 'gallery')} className="text-brand-brown/80 hover:text-brand-brown">Portfolio</Link>
          <hr className="w-full border-t border-gray-200" />
          {user ? (
            <>
              {userData?.isAdmin && (
                <>
                  <Link href="/admin" onClick={closeMenu} className="font-semibold text-blue-600 hover:text-blue-800">Admin</Link>
                  <Link href="/admin/photos" onClick={closeMenu} className="font-semibold text-rose-600 hover:text-rose-800">Photos</Link>
                </>
              )}
              <Link href="/profile" onClick={closeMenu} className="text-gray-600 hover:text-pink-500">Profile</Link>
              <button onClick={handleLogout} className="text-gray-600 hover:text-pink-500">Logout</button>
            </>
          ) : (
            <>
              <Link href="/login" onClick={(e) => { e.preventDefault(); setIsMenuOpen(false); navigateWithFade('/login'); }} className="text-gray-600 hover:text-pink-500">Login</Link>
              <Link href="/signup" onClick={(e) => { e.preventDefault(); setIsMenuOpen(false); navigateWithFade('/signup'); }} className="text-gray-600 hover:text-pink-500">Sign Up</Link>
            </>
          )}
        </div>
      </div>

      {/* Fade overlay for navigation */}
      {overlayVisible && (
        <div className={`fixed inset-0 z-[60] bg-white flex items-center justify-center ${overlayOpaque ? 'opacity-100' : 'opacity-0'}`}>
          <LoadingSpinner size="md" />
        </div>
      )}
    </header>
  );
}