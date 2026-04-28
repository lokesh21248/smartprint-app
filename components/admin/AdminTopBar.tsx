"use client";

import { UserResource } from "@clerk/types";
import { UserButton } from "@clerk/nextjs";
import { Search, Bell } from "lucide-react";

interface AdminTopBarProps {
  user: any;
}

export function AdminTopBar({ user }: AdminTopBarProps) {
  return (
    <header className="h-20 bg-white border-b border-gray-200 px-6 flex items-center justify-between">
      <div className="flex-1 max-w-md relative hidden sm:block">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input 
          type="text" 
          placeholder="Search shops, users, transactions..."
          className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
        />
      </div>

      <div className="flex items-center gap-4">
        <button className="p-2.5 rounded-xl text-gray-500 hover:bg-gray-100 relative">
          <Bell className="h-5 w-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
        </button>
        <div className="h-8 w-[1px] bg-gray-200 mx-2" />
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-gray-900">{user.fullName || "Admin"}</p>
            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-tighter">System Administrator</p>
          </div>
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </div>
    </header>
  );
}
