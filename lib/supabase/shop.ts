import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Standardized shop creation/upsert logic to ensure data consistency
 * across Clerk Webhooks, Signup Flows, and Dashboard Fallbacks.
 */
export async function upsertShop(
  supabase: SupabaseClient,
  params: {
    userId: string;
    email: string;
    name?: string;
    address?: string;
    phone?: string;
  }
) {
  const { userId, email, name, address, phone } = params;

  try {
    // 1. Check for existing shop (Idempotent Fetch)
    const { data: existing, error: fetchError } = await supabase
      .from("shops")
      .select("id, clerk_owner_id, owner_email, name, address_line1, owner_phone")
      .eq("clerk_owner_id", userId)
      .maybeSingle();

    if (fetchError) throw new Error(`Fetch failed: ${fetchError.message}`);

    // 2. Build precision payload (Strictly non-null fields)
    const payload: Record<string, unknown> = {
      clerk_owner_id: userId,
      updated_at: new Date().toISOString(),
      ...(email && { owner_email: email }),
      ...(name && { name }),
      ...(address && { address_line1: address }),
      ...(phone && { owner_phone: phone }),
    };

    // Apply critical defaults ONLY for new shops
    if (!existing) {
      Object.assign(payload, {
        name: (payload.name as string) || "New Shop",
        owner_name: "Shop Owner",
        owner_email: (payload.owner_email as string) || email || "unknown@example.com",
        owner_phone: (payload.owner_phone as string) || "0000000000",
        address_line1: (payload.address_line1 as string) || "TBD",
        city: "TBD",
        state: "TBD",
        pincode: "000000",
        is_approved: true,
      });
    }

    // 3. Atomic Upsert
    const { data, error: upsertError } = await supabase
      .from("shops")
      .upsert(payload, { onConflict: 'clerk_owner_id' })
      .select()
      .single();

    if (upsertError) throw new Error(`Upsert failed: ${upsertError.message}`);

    // 4. Staff Relationship Sync (Idempotent)
    const { error: staffError } = await supabase
      .from('shop_staff')
      .upsert({
        shop_id: data.id,
        user_id: userId,
        role: 'owner',
        permissions: { all: true }
      }, { onConflict: 'shop_id, user_id' });

    if (staffError) {
      console.warn(JSON.stringify({
        status: "warning",
        context: "staff_sync_failed",
        error: staffError.message,
        userId,
        timestamp: new Date().toISOString()
      }));
    }

    return data;
  } catch (err: unknown) {
    const error = err as Error;
    console.error(JSON.stringify({
      status: "error",
      context: "upsert_shop",
      error: error.message,
      userId,
      timestamp: new Date().toISOString()
    }));
    throw err;
  }
}

/**
 * Safely deletes a shop and cleans up related records
 * when a user is deleted from Clerk.
 */
export async function deleteShop(supabase: SupabaseClient, userId: string) {
  try {
    // Rely on CASCADE deletes if configured in Supabase, 
    // otherwise manually delete staff first if needed.
    // For now, we delete the shop directly.
    const { error } = await supabase
      .from("shops")
      .delete()
      .eq("clerk_owner_id", userId);

    if (error) throw new Error(`Delete failed: ${error.message}`);
    
    console.log(JSON.stringify({
      status: "success",
      context: "delete_shop",
      userId,
      timestamp: new Date().toISOString()
    }));
  } catch (err: unknown) {
    const error = err as Error;
    console.error(JSON.stringify({
      status: "error",
      context: "delete_shop",
      error: error.message,
      userId,
      timestamp: new Date().toISOString()
    }));
    throw err;
  }
}
