import { createClient, SupabaseClient } from "@supabase/supabase-js";

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

export function createAdminClient(): SupabaseClient<FlexDatabase> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for admin operations");
  }
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for admin operations");
  }

  // Create a fresh client instance per call. This avoids HMR-related stale
  // reference issues that occur with module-level singletons.
  // Supabase client internally manages connection pooling.
  return createClient<FlexDatabase>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
