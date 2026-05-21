import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

// ISR: revalidate shop layout data every 5 minutes.
// Vercel Edge will serve the cached HTML to ALL customers globally
// without hitting Supabase on every request.
export const revalidate = 300;

interface LayoutProps {
  children: React.ReactNode;
  params: { slug: string };
}

/**
 * Pre-render the top 50 shops at build time.
 * New / less-visited shops fall back to dynamic rendering.
 */
export async function generateStaticParams() {
  try {
    const supabase = createAdminClient();
    const { data: shops } = await supabase
      .from("shops")
      .select("slug")
      .eq("is_approved", true)
      .order("created_at", { ascending: false })
      .limit(50);
    return (shops ?? []).map((s) => ({ slug: s.slug as string }));
  } catch {
    // Don’t fail the build if Supabase is unreachable
    return [];
  }
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const supabase = createAdminClient();
  const { data: shop } = await supabase
    .from("shops")
    .select("name, address_line1, slug")
    .eq("slug", params.slug)
    .maybeSingle();

  if (!shop) {
    return {
      title: "Shop Not Found | SmartPrint",
    };
  }

  const title = `${shop.name} | Print Online at SmartPrint`;
  const description = `Order high-quality prints from ${shop.name} at ${shop.address_line1}. Upload PDF, pay via UPI, and pick up when ready.`;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://smartprint.in";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `${appUrl}/s/${shop.slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
