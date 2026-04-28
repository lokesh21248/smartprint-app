'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Hash, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function FindShopPage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedCode = code.trim().toUpperCase();
    if (trimmedCode.length !== 6) {
      toast.error('Code must be exactly 6 characters');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .rpc('find_shop_by_code', { p_code: trimmedCode });

      if (error) throw error;
      
      if (!data || data.length === 0) {
        toast.error('Shop not found. Please check the code.');
        return;
      }

      const shop = data[0];
      
      if (!shop.is_active) {
        toast.error('This shop is currently unavailable');
        return;
      }

      router.push(`/shop/${shop.id}`);
    } catch (err: unknown) {
      toast.error('Failed to find shop: ' + ((err as Error).message || 'Try again'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-blue-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Hash className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Enter Shop Code</h1>
          <p className="text-gray-600">Type the 6-letter code your shop gave you</p>
        </div>

        <form onSubmit={handleSearch} className="space-y-4">
          <input
            type="text"
            placeholder="ABC123"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
            maxLength={6}
            autoFocus
            autoComplete="off"
            className="w-full h-16 text-center text-3xl font-bold tracking-[0.5em] font-mono border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none uppercase"
          />

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition"
          >
            {loading ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Finding shop...</>
            ) : (
              <>Find Shop <ArrowRight className="w-5 h-5" /></>
            )}
          </button>
        </form>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>You can also scan the shop&apos;s QR code with your camera to skip typing.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
