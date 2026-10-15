import Link from "next/link";
import { Scan2PaperLogo } from "@/components/shared/Scan2PaperLogo";
import { ShieldCheck, Mail, MapPin } from "lucide-react";

export function PublicFooter() {
  return (
    <footer className="w-full bg-slate-900 text-slate-400 border-t border-slate-800 text-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
          {/* Brand info */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="inline-flex items-center gap-2" aria-label="Scan2Paper Home">
              <Scan2PaperLogo variant="icon" size={32} color="mono" className="brightness-200" />
              <span className="font-extrabold text-xl text-white tracking-tight">
                Scan<span className="text-emerald-500">2</span>Paper
              </span>
            </Link>
            <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
              India&apos;s smart online document printing platform built for xerox shops, copy centres, and document service providers. Accept orders online, reduce counter queues, and grow revenue effortlessly.
            </p>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-3 py-1.5 rounded-xl w-fit">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>100% Secure &amp; 2-Hour Auto-Delete Privacy Guarantee</span>
            </div>
          </div>

          {/* Product links */}
          <div>
            <h3 className="font-bold text-white text-sm mb-4 tracking-wide uppercase text-xs">
              Product
            </h3>
            <ul className="space-y-2.5">
              <li>
                <Link href="/features" className="hover:text-emerald-400 transition">
                  Features &amp; Tools
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-emerald-400 transition">
                  Pricing Plans
                </Link>
              </li>
              <li>
                <Link href="/find-shop" className="hover:text-emerald-400 transition">
                  Find Print Shop Near You
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-emerald-400 transition">
                  Shop Owner Dashboard
                </Link>
              </li>
              <li>
                <Link href="/signup" className="hover:text-emerald-400 transition">
                  Register Your Shop
                </Link>
              </li>
            </ul>
          </div>

          {/* Solutions & Use cases */}
          <div>
            <h3 className="font-bold text-white text-sm mb-4 tracking-wide uppercase text-xs">
              Solutions
            </h3>
            <ul className="space-y-2.5">
              <li>
                <Link href="/features" className="hover:text-emerald-400 transition">
                  Online Xerox Printing
                </Link>
              </li>
              <li>
                <Link href="/features" className="hover:text-emerald-400 transition">
                  QR Code Counter Ordering
                </Link>
              </li>
              <li>
                <Link href="/features" className="hover:text-emerald-400 transition">
                  PDF &amp; Document Upload
                </Link>
              </li>
              <li>
                <Link href="/features" className="hover:text-emerald-400 transition">
                  Color &amp; B&amp;W Printing
                </Link>
              </li>
              <li>
                <Link href="/blog" className="hover:text-emerald-400 transition">
                  Print Shop Business Tips
                </Link>
              </li>
            </ul>
          </div>

          {/* Company & Support */}
          <div>
            <h3 className="font-bold text-white text-sm mb-4 tracking-wide uppercase text-xs">
              Company
            </h3>
            <ul className="space-y-2.5">
              <li>
                <Link href="/about" className="hover:text-emerald-400 transition">
                  About Scan2Paper
                </Link>
              </li>
              <li>
                <Link href="/blog" className="hover:text-emerald-400 transition">
                  Blog &amp; Knowledge Base
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-emerald-400 transition">
                  Contact Support
                </Link>
              </li>
              <li className="pt-2 flex items-center gap-1.5 text-xs text-slate-400">
                <Mail className="w-3.5 h-3.5 text-emerald-500" />
                <a href="mailto:support@scan2paper.com" className="hover:text-emerald-400 transition">
                  support@scan2paper.com
                </a>
              </li>
              <li className="flex items-center gap-1.5 text-xs text-slate-400">
                <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                <span>Pan-India Print Network</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Local SEO city footer links */}
        <div className="pt-8 pb-6 border-t border-slate-800 text-xs text-slate-500">
          <p className="font-semibold text-slate-400 mb-2">
            Online Printing &amp; Xerox Services across India:
          </p>
          <p className="leading-relaxed">
            Hyderabad · Bengaluru · Mumbai · Delhi NCR · Chennai · Pune · Kolkata · Ahmedabad · Jaipur · Lucknow · Vijayawada · Visakhapatnam · Guntur · Warangal · Tirupati · Coimbatore · Kochi · Bhopal · Patna · Chandigarh
          </p>
        </div>

        {/* Bottom copyright row */}
        <div className="pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} Scan2Paper. All rights reserved. Made for Indian Print &amp; Xerox Businesses.</p>
          <div className="flex gap-6">
            <Link href="/about" className="hover:text-slate-400 transition">
              About
            </Link>
            <Link href="/contact" className="hover:text-slate-400 transition">
              Help &amp; Support
            </Link>
            <Link href="/find-shop" className="hover:text-slate-400 transition">
              Find a Shop
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
