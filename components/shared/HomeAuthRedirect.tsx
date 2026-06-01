'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';

/**
 * Invisible component that client-side redirects authenticated users to /dashboard.
 * Renders nothing — only triggers navigation when Clerk confirms an active session.
 * This allows Googlebot (no session) to always see the homepage content,
 * while authenticated shop owners are seamlessly sent to their dashboard.
 */
export function HomeAuthRedirect() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace('/dashboard');
    }
  }, [isLoaded, isSignedIn, router]);

  return null;
}
