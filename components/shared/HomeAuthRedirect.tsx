'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';

/**
 * Invisible component that client-side redirects authenticated/returning users.
 * - Logged-in user → /dashboard
 * - Logged-out returning visitor → /login
 * - Logged-out first-time visitor → Show homepage, sets visited flag
 */
export function HomeAuthRedirect() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    console.log("[HomeAuthRedirect] Auth status: isLoaded =", isLoaded, ", isSignedIn =", isSignedIn);
    
    if (isLoaded) {
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
          console.log("[HomeAuthRedirect] First-time visitor. Setting localStorage 'scan2paper_visited' = 'true' and showing homepage.");
          localStorage.setItem("scan2paper_visited", "true");
        }
      }
    }
  }, [isLoaded, isSignedIn, router]);

  return null;
}

