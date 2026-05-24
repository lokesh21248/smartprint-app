import { createBrowserClient } from "@supabase/ssr";

// NOTE: We do NOT use a module-level singleton here.
// A module-level `let client = null` causes stale references during Next.js
// Hot Module Replacement (HMR), which is a known trigger for the
// `options.factory` webpack runtime error. Instead, we create the client
// lazily per-call, which is safe because createBrowserClient is idempotent
// and returns a stable instance internally.
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

let cachedClient: ReturnType<typeof createBrowserClient<FlexDatabase>> | null = null;

export function createClient() {
  if (cachedClient) return cachedClient as any;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local"
    );
  }

  cachedClient = createBrowserClient<FlexDatabase>(url, anonKey);
  return cachedClient as any;
}
