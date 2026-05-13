"use client";

import { useRef } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface OrderFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  sortBy: "newest" | "amount";
  onSortChange: (v: "newest" | "amount") => void;
  dateFilter: string;
  onDateFilterChange: (v: string) => void;
}

export function OrderFilters({
  search,
  onSearchChange,
  sortBy,
  onSortChange,
  dateFilter,
  onDateFilterChange,
}: OrderFiltersProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSearch = (v: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSearchChange(v), 300);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
        <input
          id="order-search"
          type="search"
          placeholder="Search by order #, customer name or phone…"
          defaultValue={search}
          onChange={(e) => debouncedSearch(e.target.value)}
          className="w-full h-11 pl-10 pr-4 rounded-xl border border-[#E5E7EB] bg-white text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2E8B57] focus:border-transparent"
        />
      </div>

      {/* Date filter */}
      <Select value={dateFilter} onValueChange={onDateFilterChange}>
        <SelectTrigger id="date-filter" className="h-11 w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="week">This Week</SelectItem>
          <SelectItem value="month">This Month</SelectItem>
          <SelectItem value="all">All Time</SelectItem>
        </SelectContent>
      </Select>

      {/* Sort */}
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-[#6B7280]" />
        <Select value={sortBy} onValueChange={onSortChange as (v: string) => void}>
          <SelectTrigger id="sort-by" className="h-11 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="amount">Highest Amount</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
