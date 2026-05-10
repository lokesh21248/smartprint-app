import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Store, MapPin, ArrowRight, AlertCircle, Hash } from 'lucide-react';

export default async function ShopLandingPage({ params }: { params: { shopId: string } }) {
  const supabase = createAdminClient();

  const { data: shop, error } = await supabase
    .from('shops')
    .select('id, name, address_line1, city, owner_phone, is_active, shop_code')
    .eq('id', params.shopId)
    .maybeSingle();

  if (error || !shop) {
    notFound();
  }

  // Track scan in DB
  try {
    await supabase.rpc('increment_qr_scan', { p_shop_id: params.shopId });
  } catch (e) {
    console.error("Failed to increment scan count", e);
  }

  if (!shop.is_active) {
    return <UnavailableShop />;
  }

  return <ShopWelcome shop={shop} />;
}

function UnavailableShop() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-blue-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-600" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Shop Unavailable</h1>
        <p className="text-gray-600 mb-6">This shop is not accepting orders right now.</p>
        <Link href="/" className="inline-block px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition">
          Find Other Shops
        </Link>
      </div>
    </div>
  );
}

function ShopWelcome({ shop }: { shop: {
  id: string;
  name: string;
  shop_code: string;
  address_line1: string;
  city: string;
} }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 p-4">
      <div className="max-w-md mx-auto pt-8">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-emerald-600 p-6 text-white text-center">
            <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3">
              <Store className="w-10 h-10" />
            </div>
            <h1 className="text-2xl font-bold">{shop.name}</h1>
            <p className="text-emerald-100 mt-1">Welcome! Place your print order</p>
          </div>

          <div className="p-6 space-y-4">
            <div className="flex items-center justify-center gap-2 bg-emerald-50 py-2 px-4 rounded-lg">
              <Hash className="w-4 h-4 text-emerald-700" />
              <span className="font-mono font-bold text-emerald-700 tracking-wider">{shop.shop_code}</span>
            </div>

            <div className="flex items-start gap-2">
              <MapPin className="w-5 h-5 text-gray-400 mt-0.5 shrink-0" />
              <p className="text-gray-700">{shop.address_line1}, {shop.city}</p>
            </div>

            <Link
              href={`/shop/${shop.id}/order`}
              className="flex w-full bg-emerald-600 hover:bg-emerald-700 text-white text-center py-4 rounded-xl font-semibold text-lg transition items-center justify-center gap-2"
            >
              Place Order Here <ArrowRight className="w-5 h-5" />
            </Link>

            <div className="bg-gray-50 rounded-lg p-4 mt-4">
              <p className="text-sm text-gray-600 text-center">
                Upload documents, choose print options,<br/>and we&apos;ll get them ready for pickup.
              </p>
            </div>
          </div>
        </div>
        <p className="text-center text-gray-500 text-sm mt-6">Powered by SmartPrint</p>
      </div>
    </div>
  );
}
