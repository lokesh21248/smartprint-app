"use client";

import { useState } from "react";
import { 
  Store, MapPin, Phone, Mail, 
  ShieldCheck, AlertCircle, 
  ArrowLeft, ExternalLink,
  ShoppingBag, IndianRupee, Clock
} from "lucide-react";
import Link from "next/link";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { Shop, Order } from "@/types";

interface AdminShop extends Shop {
  name: string; // The component uses .name instead of .shop_name
  owner_email?: string;
}

interface AdminShopDetailClientProps {
  shop: AdminShop;
  orders: Order[];
}

export function AdminShopDetailClient({ shop, orders }: AdminShopDetailClientProps) {
  const [isActive, setIsActive] = useState(shop.is_active);

  const completedOrders = orders.filter(o => o.order_status === "COMPLETED");
  const totalRevenue = completedOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link 
          href="/admin/shops"
          className="p-3 rounded-2xl bg-white border border-gray-100 text-gray-400 hover:text-gray-900 transition-all shadow-sm"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{shop.name}</h1>
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${shop.is_approved ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>
              {shop.is_approved ? "Approved" : "Pending Approval"}
            </span>
          </div>
          <p className="text-gray-500 mt-1 flex items-center gap-2 text-sm">
            <Store className="h-4 w-4" />
            ID: <span className="font-mono text-xs">{shop.id}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Shop Profile Section */}
          <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
            <h3 className="text-xl font-black text-gray-900 mb-6">Shop Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
                    <MapPin className="h-5 w-5 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Address</p>
                    <p className="text-sm font-semibold text-gray-800 leading-relaxed">{shop.address}</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
                    <Phone className="h-5 w-5 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Phone</p>
                    <p className="text-sm font-semibold text-gray-800">{shop.phone}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Owner Email</p>
                    <p className="text-sm font-semibold text-gray-800">{shop.owner_email || "N/A"}</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
                    <Clock className="h-5 w-5 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Joined Date</p>
                    <p className="text-sm font-semibold text-gray-800">{formatDateTime(shop.created_at)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Performance Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-emerald-50 rounded-3xl p-6 border border-emerald-100">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center mb-4">
                <IndianRupee className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="text-[10px] text-emerald-800 font-bold uppercase tracking-widest">Lifetime Revenue</p>
              <p className="text-2xl font-black text-emerald-900 mt-1">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="bg-blue-50 rounded-3xl p-6 border border-blue-100">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center mb-4">
                <ShoppingBag className="h-5 w-5 text-blue-600" />
              </div>
              <p className="text-[10px] text-blue-800 font-bold uppercase tracking-widest">Total Orders</p>
              <p className="text-2xl font-black text-blue-900 mt-1">{orders.length}</p>
            </div>
            <div className="bg-purple-50 rounded-3xl p-6 border border-purple-100">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center mb-4">
                <ShieldCheck className="h-5 w-5 text-purple-600" />
              </div>
              <p className="text-[10px] text-purple-800 font-bold uppercase tracking-widest">Completion Rate</p>
              <p className="text-2xl font-black text-purple-900 mt-1">
                {orders.length > 0 ? Math.round((completedOrders.length / orders.length) * 100) : 0}%
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {/* Admin Actions */}
          <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-6">Admin Controls</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-gray-50">
                <div>
                  <p className="text-sm font-bold text-gray-900">Active Status</p>
                  <p className="text-[10px] text-gray-500 uppercase font-bold tracking-tighter">Disable shop access</p>
                </div>
                <button 
                  onClick={() => setIsActive(!isActive)}
                  className={`w-12 h-6 rounded-full transition-all relative ${isActive ? "bg-emerald-500" : "bg-gray-300"}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isActive ? "right-1" : "left-1"}`} />
                </button>
              </div>

              {!shop.is_approved && (
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 rounded-2xl shadow-lg shadow-emerald-600/20">
                  Approve Shop Partner
                </Button>
              )}
              
              <Button variant="outline" className="w-full h-12 rounded-2xl border-gray-200 text-gray-600 hover:bg-gray-50">
                Message Owner
              </Button>

              <Button variant="ghost" className="w-full h-12 rounded-2xl text-red-500 hover:bg-red-50 hover:text-red-600">
                Suspend Account
              </Button>
            </div>
          </div>

          <div className="bg-gray-900 rounded-3xl p-8 text-white">
            <AlertCircle className="h-8 w-8 text-orange-400 mb-4" />
            <h4 className="font-bold text-lg mb-2">Important Note</h4>
            <p className="text-sm text-gray-400 leading-relaxed">
              Suspended shops will lose access to their dashboard and their public listing will be hidden immediately.
            </p>
            <a 
              href={`/s/${shop.slug}`} 
              target="_blank" 
              className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-orange-400 hover:underline"
            >
              View Public Page
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
