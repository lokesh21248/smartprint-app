import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <h1 className="mb-2 text-4xl font-black text-gray-900">404 - Page Not Found</h1>
      <p className="mb-6 text-gray-500">The page you are looking for doesn't exist.</p>
      <Link 
        href="/"
        className="rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-emerald-700"
      >
        Return Home
      </Link>
    </div>
  );
}
