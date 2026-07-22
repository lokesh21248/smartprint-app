'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';

/**
 * Client-side redirect for users visiting the homepage.
 * - Logged-in user → /dashboard
 * - Logged-out user → Show homepage instantly
 */
export function HomeAuthRedirect() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const [redirectTimedOut, setRedirectTimedOut] = useState(false);
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    // 2-second fallback timeout to prevent infinite loading
    const timer = setTimeout(() => {
      if (!hasCheckedRef.current) {
        if (process.env.NODE_ENV !== 'production') {
          console.log("[HomeAuthRedirect] ⏰ Redirect timeout reached (2s). Removing 'js-redirecting' and showing homepage.");
        }
        document.documentElement.classList.remove('js-redirecting');
        setRedirectTimedOut(true);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (redirectTimedOut) {
      return;
    }
    if (hasCheckedRef.current) {
      return;
    }

    if (isLoaded) {
      hasCheckedRef.current = true;
      if (isSignedIn) {
        if (process.env.NODE_ENV !== 'production') {
          console.log("[HomeAuthRedirect] User is signed in. Redirecting to /dashboard.");
        }
        router.replace('/dashboard');
      } else {
        if (process.env.NODE_ENV !== 'production') {
          console.log("[HomeAuthRedirect] User is signed out. Showing homepage.");
        }
        document.documentElement.classList.remove('js-redirecting');
      }
    }
  }, [isLoaded, isSignedIn, router, redirectTimedOut]);

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            try {
              if (document.cookie.indexOf('__session') !== -1) {
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
      <div className="redirect-overlay" role="status" aria-label="Loading, please wait">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-emerald-100 border-t-emerald-600 animate-spin" />
          <p className="text-gray-600 font-semibold text-base animate-pulse">
            Redirecting to your dashboard...
          </p>
        </div>
      </div>
    </>
  );
}


