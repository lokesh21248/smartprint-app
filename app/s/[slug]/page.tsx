"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  Loader2, 
  AlertCircle, 
  Upload, 
  FileText, 
  Store, 
  Clock, 
  Zap, 
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  MapPin,
  Smartphone
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Shop } from "@/types";
import { Button } from "@/components/ui/button";
import { ShopStructuredData } from "@/components/seo/ShopStructuredData";

export default function QRLandingPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [shop, setShop] = useState<Partial<Shop> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchShop = async () => {
      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from("shops")
          .select("id, name, address, phone, is_open, price_bw_per_page, price_color_per_page, opening_time, closing_time")
          .eq("slug", slug)
          .maybeSingle();

        if (fetchError || !data) {
          setError("Shop not found");
          setIsLoading(false);
          return;
        }

        setShop(data);
        setIsLoading(false);
      } catch (err) {
        setError("Failed to load shop information");
        setIsLoading(false);
      }
    };

    fetchShop();
  }, [slug]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAFAFA]">
        <Loader2 className="w-12 h-12 animate-spin text-emerald-600 mb-4" />
        <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Connecting to Shop...</p>
      </div>
    );
  }

  if (error || !shop) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] p-6">
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-10 max-w-md w-full text-center border border-gray-100">
          <div className="w-20 h-20 rounded-3xl bg-rose-50 flex items-center justify-center mx-auto mb-6 shadow-inner">
            <AlertCircle className="w-10 h-10 text-rose-500" />
          </div>
          <h1 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">Shop Not Found</h1>
          <p className="text-gray-500 font-medium mb-8 leading-relaxed">The link you followed might be broken or the shop has been removed.</p>
          <Button onClick={() => router.push("/")} className="w-full h-14 rounded-2xl bg-gray-900 hover:bg-black text-white font-black">Go Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] pb-20">
      <ShopStructuredData shop={shop} />
      <div className="max-w-2xl mx-auto pt-12 px-4">
        {/* Hero Section */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-full text-emerald-700 text-xs font-black uppercase tracking-widest mb-4">
            <Zap className="w-3 h-3 fill-emerald-700" /> Powered by SmartPrint
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight leading-tight">{shop.name}</h1>
          <div className="flex items-center justify-center gap-2 text-gray-400 mt-3 font-medium">
            <MapPin className="w-4 h-4 text-emerald-500" /> {shop.address}
          </div>
        </div>

        {/* Shop Info Card */}
        <div className="bg-white rounded-[3rem] shadow-2xl shadow-emerald-900/5 overflow-hidden border border-gray-100">
          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-10 text-white relative">
            <div className="absolute top-6 right-6 opacity-10">
              <Store className="w-32 h-32" />
            </div>
            
            <div className="flex items-center justify-between mb-8">
              <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur-md ${shop.is_open ? "bg-white/20 text-white" : "bg-rose-500/80 text-white"}`}>
                {shop.is_open ? "● Open Now" : "● Closed"}
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-emerald-100">
                {shop.opening_time?.slice(0, 5)} - {shop.closing_time?.slice(0, 5)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/10">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100 mb-2">Black & White</p>
                <p className="text-3xl font-black">₹{Number(shop.price_bw_per_page).toFixed(0)}<span className="text-xs font-medium ml-1">/page</span></p>
              </div>
              <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/10">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100 mb-2">Color Print</p>
                <p className="text-3xl font-black text-orange-200">₹{Number(shop.price_color_per_page).toFixed(0)}<span className="text-xs font-medium ml-1">/page</span></p>
              </div>
            </div>
          </div>

          <div className="p-10 space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {[
                { icon: Smartphone, title: "No App Required", desc: "Just upload and track via your browser" },
                { icon: ShieldCheck, title: "Encrypted Flow", desc: "Your documents are securely processed" }
              ].map((item, i) => (
                <div key={i} className="flex gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100">
                    <item.icon className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-black text-gray-900 tracking-tight">{item.title}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed font-medium">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <Button
              onClick={() => router.push(`/order-upload?shopSlug=${slug}`)}
              className="w-full h-20 rounded-[1.5rem] bg-emerald-600 hover:bg-emerald-700 text-white font-black text-2xl shadow-2xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              Start Printing <ChevronRight className="w-8 h-8" />
            </Button>
          </div>
        </div>

        {/* How it Works */}
        <div className="mt-12 space-y-8">
          <h2 className="text-2xl font-black text-gray-900 tracking-tight text-center">Simple 3-Step Process</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { step: "01", title: "Upload", desc: "Choose your PDF and configuration" },
              { step: "02", title: "Verify", desc: "Secure OTP via SMS" },
              { step: "03", title: "Track", desc: "Real-time updates to your phone" },
            ].map((item) => (
              <div key={item.step} className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                <p className="text-4xl font-black text-emerald-500/20 mb-4">{item.step}</p>
                <h3 className="font-black text-gray-900 mb-2 tracking-tight">{item.title}</h3>
                <p className="text-sm text-gray-400 font-medium leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 text-center">
          <div className="h-px bg-gray-200 w-full mb-8" />
          <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em]">SmartPrint Pilot v1.0</p>
        </div>
      </div>
    </div>
  );
}
