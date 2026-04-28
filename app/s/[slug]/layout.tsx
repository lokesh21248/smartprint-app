import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

interface LayoutProps {
  children: React.ReactNode;
  params: { slug: string };
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const supabase = await createClient();
  const { data: shop } = await supabase
    .from("shops")
    .select("name, address, slug")
    .eq("slug", params.slug)
    .maybeSingle();

  if (!shop) {
    return {
      title: "Shop Not Found | SmartPrint",
    };
  }

  const title = `${shop.name} | Print Online at SmartPrint`;
  const description = `Order high-quality prints from ${shop.name} at ${shop.address}. Upload PDF, pay via UPI, and pick up when ready.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `https://smartprint.in/s/${shop.slug}`,
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
