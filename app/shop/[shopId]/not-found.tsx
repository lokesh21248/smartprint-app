import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-blue-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-amber-600" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Shop Not Found</h1>
        <p className="text-gray-600 mb-6">This QR code is invalid or the shop doesn&apos;t exist.</p>
        <Link href="/" className="inline-block px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition">
          Go Home
        </Link>
      </div>
    </div>
  );
}
