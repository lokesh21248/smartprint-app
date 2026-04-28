import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function POST(req: Request) {
  // You can find this in the Clerk Dashboard -> Webhooks -> choose the webhook
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    throw new Error('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local')
  }

  // Get the headers
  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error occured -- no svix headers', {
      status: 400,
    })
  }

  // Get the body
  const payload = await req.json()
  const body = JSON.stringify(payload)

  // Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET)

  let evt: WebhookEvent

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent
  } catch (err) {
    console.error('Error verifying webhook:', err)
    return new Response('Error occured', {
      status: 400,
    })
  }

  // Handle the webhook
  const eventType = evt.type

  if (eventType === 'user.created') {
    const { id, email_addresses, public_metadata } = evt.data
    const email = email_addresses && email_addresses.length > 0 ? email_addresses[0].email_address : null
    
    try {
      // Insert into shops table with Clerk user ID (TEXT)
      const { data: shopData, error: shopError } = await supabase
        .from('shops')
        .insert({
          owner_id: id,                                      // Clerk user ID (TEXT)
          owner_email: email || '',
          name: (public_metadata?.shopName as string) || 'My Shop',
          slug: `shop-${Date.now()}`,                       // Generate unique slug
          phone: (public_metadata?.phone as string) || '',
          address: (public_metadata?.location as string) || 'TBD',
          is_approved: false,
          is_open: true,
        })
        .select()
        .single()

      if (shopError) {
        console.error('Error inserting shop into Supabase:', shopError)
        return new Response('Error inserting shop', { status: 500 })
      }

      // Insert into shop_staff table for the owner
      if (shopData) {
        const { error: staffError } = await supabase
          .from('shop_staff')
          .insert({
            shop_id: shopData.id,
            user_id: id,                                     // Clerk user ID (TEXT)
            email: email || '',
            role: 'owner',
            is_active: true,
            accepted_at: new Date().toISOString()
          })
          
        if (staffError) {
          console.error('Error inserting shop staff into Supabase:', staffError)
          // Don't fail webhook if staff insertion fails
        }
      }

      // ─── NEW: Link staff if they were invited ─────────────────────────────────
      if (email) {
        const { data: pendingInvite, error: inviteError } = await supabase
          .from('shop_staff')
          .select('id')
          .eq('email', email)
          .is('user_id', null)
          .maybeSingle();

        if (pendingInvite) {
          await supabase
            .from('shop_staff')
            .update({
              user_id: id,
              accepted_at: new Date().toISOString(),
              is_active: true
            })
            .eq('id', pendingInvite.id);
          
          console.log(`Linked staff member ${email} to shop via invite`);
        }
      }
      // ───────────────────────────────────────────────────────────────────────────

    } catch (err) {
      console.error('Supabase error:', err)
      return new Response('Database error', { status: 500 })
    }
  }

  return new Response('', { status: 200 })
}
