import { Printer } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#E8F5EE] via-white to-[#E8F1F8] flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-[#2E8B57]/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-[#1F4E79]/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Brand */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-[#2E8B57] flex items-center justify-center shadow-lg">
            <Printer className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#111827]">SmartPrint</h1>
            <p className="text-sm text-[#6B7280]">Shop Owner Panel</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
