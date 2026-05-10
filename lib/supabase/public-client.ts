import { createBrowserClient } from "@supabase/ssr";

/**
 * PUBLIC SUPABASE CLIENT
 * 
 * ⚠️ WARNING: This client uses the 'anon' key and is exposed to the browser.
 * It is ONLY for non-sensitive public operations like:
 * - Real-time subscriptions (protected by RLS)
 * - Public storage access
 * 
 * 🚫 NEVER use this for data fetching where RLS is Deny-All.
 * 🚫 NEVER use this for administrative tasks.
 * Use the Server-Side API routes instead.
 */

type FlexRelationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type FlexDatabase = {
  public: {
    Tables: {
      [tableName: string]: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Row: Record<string, any>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Insert: Record<string, any>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Update: Record<string, any>;
        Relationships: FlexRelationship[];
      };
    };
    Views: {
      [viewName: string]: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Row: Record<string, any>;
        Relationships: FlexRelationship[];
      };
    };
    Functions: {
      [funcName: string]: {
        Args: Record<string, unknown>;
        Returns: unknown;
      };
    };
  };
};

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local"
    );
  }

  // Create a fresh client instance per call. This avoids HMR-related stale
  // reference issues. createBrowserClient is idempotent and internally stable.
  return createBrowserClient<FlexDatabase>(url, anonKey);
}
