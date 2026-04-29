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

  // Generate a consistent, unique slug
  const slug = `shop-${userId.slice(-6)}-${Date.now()}`;

  const { data, error } = await supabase
    .from("shops")
    .upsert({
      owner_id: userId,
      owner_email: email,
      name: name || "My Shop",
      slug: slug,
      phone: phone || "TBD",
      address: address || "TBD",
      price_bw_per_page: 1.00,
      price_color_per_page: 5.00,
      is_approved: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_id' })
    .select()
    .single();

  if (error) {
    console.error("[upsertShop] Error:", error.message);
    throw error;
  }

  // Also ensure the owner is in shop_staff
  if (data) {
    await supabase
      .from('shop_staff')
      .upsert({
        shop_id: data.id,
        user_id: userId,
        email: email,
        role: 'owner',
        is_active: true,
        accepted_at: new Date().toISOString()
      }, { onConflict: 'shop_id, user_id' });
  }

  return data;
}
