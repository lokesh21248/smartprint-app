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
    if (isLoaded) {
      if (isSignedIn) {
        router.replace('/dashboard');
      } else {
        const hasVisited = localStorage.getItem("scan2paper_visited");
        if (hasVisited) {
          router.replace('/login');
        } else {
          localStorage.setItem("scan2paper_visited", "true");
        }
      }
    }
  }, [isLoaded, isSignedIn, router]);

  return null;
}

