"use client";

import { useState } from "react";
import Link from "next/link";
import { Scan2PaperLogo } from "@/components/shared/Scan2PaperLogo";
import { Menu, X, ArrowRight, Store, Search } from "lucide-react";

export function PublicNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-slate-100/90 transition-all">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
        {/* Brand / Logo */}
        <Link href="/" className="flex items-center gap-2 group transition" aria-label="Scan2Paper Home">
          <Scan2PaperLogo variant="icon" size={30} color="color" />
          <span className="font-extrabold text-xl tracking-tight text-slate-900 group-hover:text-emerald-700 transition">
            Scan<span className="text-emerald-600">2</span>Paper
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav aria-label="Main Navigation" className="hidden md:flex items-center gap-7 text-sm font-semibold text-slate-600">
          <Link href="/features" className="hover:text-emerald-700 transition">
            Features
          </Link>
          <Link href="/pricing" className="hover:text-emerald-700 transition">
            Pricing
          </Link>
          <Link href="/find-shop" className="hover:text-emerald-700 transition flex items-center gap-1.5 text-emerald-700 font-bold bg-emerald-50/80 px-3 py-1.5 rounded-full border border-emerald-100/60">
            <Search className="w-3.5 h-3.5 text-emerald-600" />
            Find a Shop
          </Link>
          <Link href="/blog" className="hover:text-emerald-700 transition">
            Blog
          </Link>
          <Link href="/about" className="hover:text-emerald-700 transition">
            About
          </Link>
          <Link href="/contact" className="hover:text-emerald-700 transition">
            Contact
          </Link>
        </nav>

        {/* Desktop Action Buttons */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-bold text-slate-700 hover:text-emerald-700 rounded-xl hover:bg-slate-50 transition"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-sm hover:shadow transition active:scale-95"
          >
            <Store className="w-4 h-4" />
            Register Shop
          </Link>
        </div>

        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition"
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-slate-100 px-5 pt-3 pb-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <nav aria-label="Mobile Navigation" className="flex flex-col space-y-3 font-semibold text-slate-700 text-base">
            <Link
              href="/features"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-xl hover:bg-slate-50 transition"
            >
              Features
            </Link>
            <Link
              href="/pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-xl hover:bg-slate-50 transition"
            >
              Pricing
            </Link>
            <Link
              href="/find-shop"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-800 font-bold flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <Search className="w-4 h-4 text-emerald-600" />
                Find a Print Shop
              </span>
              <ArrowRight className="w-4 h-4 text-emerald-600" />
            </Link>
            <Link
              href="/blog"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-xl hover:bg-slate-50 transition"
            >
              Blog & Guides
            </Link>
            <Link
              href="/about"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-xl hover:bg-slate-50 transition"
            >
              About Scan2Paper
            </Link>
            <Link
              href="/contact"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-xl hover:bg-slate-50 transition"
            >
              Contact Support
            </Link>
          </nav>

          <div className="pt-2 border-t border-slate-100 flex flex-col gap-2.5">
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center py-2.5 rounded-xl font-bold text-slate-700 border border-slate-200 hover:bg-slate-50 transition"
            >
              Sign In to Dashboard
            </Link>
            <Link
              href="/signup"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center py-2.5 rounded-xl font-bold bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 transition"
            >
              Register Your Print Shop
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
