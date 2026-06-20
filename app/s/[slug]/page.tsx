import { 
  AlertCircle, 
  ShieldCheck,
  MapPin,
  Smartphone,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Scan2PaperLogo } from "@/components/shared/Scan2PaperLogo";
import { createAdminClient } from "@/lib/supabase/admin";
import { StartSessionForm } from "@/components/shop/StartSessionForm";

interface PageProps {
  params: { slug: string };
}

export default async function QRLandingPage({ params }: PageProps) {
  const slug = params.slug;
  const supabase = createAdminClient();

  const { data: rawShop, error } = await supabase
    .from("shops")
    .select("id, name, slug, address_line1, city, state, pincode, owner_phone, is_open, price_bw_per_page, price_color_per_page, business_hours, is_active")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !rawShop || !rawShop.is_active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full text-center border border-gray-100/80 animate-slide-in-up">
          <div className="w-20 h-20 rounded-3xl bg-rose-50 flex items-center justify-center mx-auto mb-6 shadow-inner">
            <AlertCircle className="w-10 h-10 text-rose-500" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">Shop Not Found</h1>
          <p className="text-gray-500 font-medium mb-8 leading-relaxed">The link you followed might be broken or the shop has been removed.</p>
          <a href="/">
            <Button 
              className="w-full h-14 rounded-2xl bg-gray-900 hover:bg-black text-white font-bold transition-all duration-300"
            >
              Go Home
            </Button>
          </a>
        </div>
      </div>
    );
  }

  const bh = rawShop.business_hours as Record<string, any> | null;
  const shop = {
    id: rawShop.id,
    name: rawShop.name,
    slug: rawShop.slug,
    address: [rawShop.address_line1, rawShop.city, rawShop.state, rawShop.pincode]
      .filter(Boolean)
      .join(", "),
    phone: rawShop.owner_phone,
    is_open: rawShop.is_open,
    price_bw_per_page: Number(rawShop.price_bw_per_page) || 0,
    price_color_per_page: Number(rawShop.price_color_per_page) || 0,
    opening_time: bh?.opening_time || "09:00",
    closing_time: bh?.closing_time || "21:00",
    services: bh?.services || [],
    working_days: bh?.working_days || [],
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-emerald-50/50 via-slate-50 to-white pb-24 font-sans antialiased font-medium">
      {/* Sticky Premium Minimal Navbar */}
      <nav className="sticky top-0 z-50 bg-white/70 backdrop-blur-md border-b border-slate-100/80 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Scan2PaperLogo variant="icon" size={30} color="color" />
            <span className="font-extrabold text-sm tracking-tight text-slate-800">Scan2Paper</span>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${shop.is_open !== false ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {shop.is_open !== false && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
            )}
            {shop.is_open !== false ? "Open Now" : "Closed"}
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto pt-10 px-4 space-y-8">
        
        {/* Dynamic Hero Section */}
        <div className="text-center space-y-4 animate-slide-in-up">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-500/10 rounded-full text-emerald-700 text-[10px] font-extrabold uppercase tracking-widest">
            <Sparkles className="w-3 h-3 text-emerald-600 animate-pulse" /> Self-Service Smart Print
          </div>
          
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 leading-tight">
            Instant Printing at <br/>
            <span className="bg-gradient-to-r from-emerald-600 to-teal-700 bg-clip-text text-transparent font-extrabold">
              {shop.name}
            </span>
          </h1>

          <div className="flex items-center justify-center gap-1.5 text-slate-500 text-sm font-semibold">
            <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="truncate max-w-[90%]">{shop.address}</span>
          </div>
        </div>

        {/* Pricing & Opening Info Grid */}
        <div className="grid grid-cols-2 gap-4 animate-slide-in-up [animation-delay:100ms]">
          <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-100 shadow-sm shadow-slate-100/50 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Black & White</span>
              <p className="text-3xl font-black text-slate-800 mt-1">
                {formatCurrency(Number(shop.price_bw_per_page))}
                <span className="text-xs font-semibold text-slate-400 ml-0.5">/page</span>
              </p>
            </div>
            <div className="mt-4 text-[10px] font-bold text-slate-400 uppercase">Standard Laser Print</div>
          </div>

          <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-slate-100 shadow-sm shadow-slate-100/50 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Color Print</span>
              <p className="text-3xl font-black text-emerald-600 mt-1">
                {formatCurrency(Number(shop.price_color_per_page))}
                <span className="text-xs font-semibold text-slate-400 ml-0.5">/page</span>
              </p>
            </div>
            <div className="mt-4 text-[10px] font-bold text-emerald-600 uppercase">Vivid High-Ink</div>
          </div>
        </div>

        {/* Store Overview & Services Card */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 md:p-8 space-y-6 animate-slide-in-up [animation-delay:150ms]">
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight mb-2">About Our Store</h2>
            <p className="text-sm text-slate-500 leading-relaxed font-medium">
              Welcome to {shop.name}, your trusted local document printing partner at {shop.address}. 
              We offer instant cloud print services with counter pick-up. Enter your name, upload your files securely, 
              and collect your prints whenever you are ready!
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 border-t border-slate-50">
            <div>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Services Offered</h3>
              <div className="flex flex-wrap gap-2">
                {shop.services && (shop.services as string[]).length > 0 ? (
                  (shop.services as string[]).map((service: string, idx: number) => (
                    <span key={idx} className="px-3 py-1 bg-slate-50 border border-slate-100/50 text-slate-700 rounded-lg text-xs font-semibold">
                      {service}
                    </span>
                  ))
                ) : (
                  <>
                    <span className="px-3 py-1 bg-slate-50 border border-slate-100/50 text-slate-700 rounded-lg text-xs font-semibold">B&W Printing</span>
                    <span className="px-3 py-1 bg-slate-50 border border-slate-100/50 text-slate-700 rounded-lg text-xs font-semibold">Color Printing</span>
                    <span className="px-3 py-1 bg-slate-50 border border-slate-100/50 text-slate-700 rounded-lg text-xs font-semibold">Scanning</span>
                  </>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Operating Hours</h3>
              <div className="space-y-1.5 text-xs text-slate-600 font-semibold">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Timing:</span>
                  <span>{shop.opening_time} - {shop.closing_time}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Working Days:</span>
                  <span>
                    {shop.working_days && (shop.working_days as string[]).length > 0 
                      ? (shop.working_days as string[]).join(", ") 
                      : "Monday - Saturday"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Entry Form Card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-emerald-900/[0.03] border border-slate-100/80 p-8 md:p-10 space-y-8 animate-slide-in-up [animation-delay:200ms]">
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Let&apos;s get started</h2>
            <p className="text-sm text-slate-500 font-medium">Enter your name below to start your private upload session.</p>
          </div>

          <StartSessionForm shopSlug={shop.slug} />
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-slide-in-up [animation-delay:250ms]">
          {[
            { icon: Smartphone, title: "Zero Apps Required", desc: "No downloads, no logins. Upload and check out directly inside your web browser." },
            { icon: ShieldCheck, title: "Auto-Deletion Privacy", desc: "For absolute safety, your printed files are permanently wiped after 2 hours." }
          ].map((item, i) => (
            <div key={i} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm shadow-slate-500/[0.01] flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0 text-emerald-600 border border-emerald-100/50">
                <item.icon className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-extrabold text-slate-800 text-base tracking-tight">{item.title}</h3>
                <p className="text-slate-500 text-xs leading-relaxed font-medium">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Process Steps */}
        <div className="space-y-6 pt-4 animate-slide-in-up [animation-delay:300ms]">
          <h2 className="text-xl font-black text-slate-800 tracking-tight text-center">Seamless 3-Step Print</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { step: "01", title: "Detail", desc: "Enter your name" },
              { step: "02", title: "Upload", desc: "Choose PDF files" },
              { step: "03", title: "Print", desc: "Ready at counter" },
            ].map((item) => (
              <div key={item.step} className="bg-white/80 backdrop-blur-md rounded-2xl p-4 border border-slate-100 text-center flex flex-col items-center">
                <span className="text-[10px] font-black text-emerald-500 tracking-widest px-2 py-0.5 bg-emerald-50 rounded-full mb-2">{item.step}</span>
                <h3 className="font-extrabold text-slate-800 text-sm mb-1">{item.title}</h3>
                <p className="text-slate-400 text-[10px] font-medium leading-normal">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Branding Footer */}
        <div className="pt-8 text-center text-slate-300 font-bold uppercase tracking-[0.3em] text-[9px]">
          Scan2Paper — Secure Print Cloud
        </div>
      </div>
    </div>
  );
}
