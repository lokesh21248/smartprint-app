'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';

/**
 * Client-side redirect for users visiting the homepage.
 * - Logged-in user → /dashboard
 * - Logged-out returning visitor → /login
 * - Logged-out first-time visitor → Show homepage, sets visited flag
 */
export function HomeAuthRedirect() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const [redirectTimedOut, setRedirectTimedOut] = useState(false);
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    // 3-second fallback timeout to prevent infinite loading
    const timer = setTimeout(() => {
      if (!hasCheckedRef.current) {
        console.log("[HomeAuthRedirect] ⏰ Redirect timeout reached (3s). Removing 'js-redirecting' and showing homepage.");
        document.documentElement.classList.remove('js-redirecting');
        setRedirectTimedOut(true);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (redirectTimedOut) {
      console.log("[HomeAuthRedirect] Skip redirect check: already timed out.");
      return;
    }
    if (hasCheckedRef.current) {
      return;
    }

    console.log("[HomeAuthRedirect] Auth status check: isLoaded =", isLoaded, ", isSignedIn =", isSignedIn);
    
    if (isLoaded) {
      hasCheckedRef.current = true;
      if (isSignedIn) {
        console.log("[HomeAuthRedirect] User is signed in. Redirecting to /dashboard.");
        router.replace('/dashboard');
      } else {
        const hasVisited = localStorage.getItem("scan2paper_visited");
        console.log("[HomeAuthRedirect] User is signed out. localStorage 'scan2paper_visited' =", hasVisited);
        
        if (hasVisited) {
          console.log("[HomeAuthRedirect] Returning visitor. Redirecting to /login.");
          router.replace('/login');
        } else {
          console.log("[HomeAuthRedirect] First-time visitor. Showing homepage immediately.");
          document.documentElement.classList.remove('js-redirecting');
          localStorage.setItem("scan2paper_visited", "true");
        }
      }
    }
  }, [isLoaded, isSignedIn, router, redirectTimedOut]);

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            try {
              if (localStorage.getItem('scan2paper_visited') || document.cookie.indexOf('__session') !== -1) {
                document.documentElement.classList.add('js-redirecting');
              }
            } catch (e) {}
          `,
        }}
      />
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .redirect-overlay {
              display: none;
            }
            .js-redirecting .redirect-overlay {
              display: flex !important;
              position: fixed;
              inset: 0;
              background: linear-gradient(to bottom right, #f0fdf4, #ffffff, #eff6ff);
              z-index: 99999;
              align-items: center;
              justify-content: center;
              flex-direction: column;
            }
            .js-redirecting main {
              display: none !important;
            }
          `,
        }}
      />
      <div className="redirect-overlay">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-emerald-100 border-t-emerald-600 animate-spin" />
          <p className="text-gray-600 font-semibold text-base animate-pulse">
            Redirecting you...
          </p>
        </div>
      </div>
    </>
  );
}


