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

// ─── Singleton Admin Client ───────────────────────────────────────────────────
// One shared instance per cold-start (serverless function lifetime).
// Safe: service-role key, stateless, no session, no user context to leak.
// Benefit: avoids re-allocating the HTTP connection pool on every API call.
let _adminClient: SupabaseClient<FlexDatabase> | null = null;

export function createAdminClient(): SupabaseClient<FlexDatabase> {
  if (_adminClient) return _adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for admin operations");
  }
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for admin operations");
  }

  _adminClient = createClient<FlexDatabase>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _adminClient;
}
