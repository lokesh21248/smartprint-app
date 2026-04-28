"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { UserPlus, Trash2, Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StaffInviteSchema, type StaffInviteInput } from "@/lib/validators";
import type { ShopStaff } from "@/types";

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  owner: { label: "Owner", color: "bg-purple-100 text-purple-700" },
  manager: { label: "Manager", color: "bg-blue-100 text-blue-700" },
  staff: { label: "Staff", color: "bg-gray-100 text-gray-700" },
};

interface StaffListProps {
  initialStaff: ShopStaff[];
  shopId: string;
}

export function StaffList({ initialStaff }: StaffListProps) {
  const [staff, setStaff] = useState(initialStaff);
  const [inviting, setInviting] = useState(false);
  const [role, setRole] = useState<"manager" | "staff">("staff");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<StaffInviteInput>({
    resolver: zodResolver(StaffInviteSchema),
    defaultValues: { role: "staff" },
  });

  const handleInvite = async (data: StaffInviteInput) => {
    setInviting(true);
    try {
      const res = await fetch("/api/staff/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to invite");

      setStaff((prev) => [result.staff, ...prev]);
      toast.success(`📧 Invitation sent to ${data.email}!`);
      reset();
    } catch (err: any) {
      toast.error(err.message || "Failed to invite staff");
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (staffId: string) => {
    if (!confirm("Are you sure you want to remove this team member?")) return;
    
    try {
      const res = await fetch(`/api/staff/${staffId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || "Failed to remove");
      }

      setStaff((prev) => prev.filter((s) => s.id !== staffId));
      toast.success("Staff member removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to remove staff");
    }
  };

  return (
    <div className="space-y-6">
      {/* Invite form */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
        <h2 className="text-lg font-bold text-[#111827] mb-4 flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Invite Team Member
        </h2>
        <form onSubmit={handleSubmit((d) => handleInvite({ ...d, role }))} className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Input
                id="invite-email"
                label="Email Address"
                type="email"
                placeholder="staff@yourshop.com"
                error={errors.email?.message}
                {...register("email")}
              />
            </div>
            <div className="w-40">
              <label className="block text-sm font-medium text-[#374151] mb-1.5">Role</label>
              <Select value={role} onValueChange={(v) => setRole(v as "manager" | "staff")}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="submit" loading={inviting} id="send-invite-btn">
            <UserPlus className="h-4 w-4" />
            Send Invitation
          </Button>
        </form>
      </div>

      {/* Staff list */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <div className="p-5 border-b border-[#F3F4F6]">
          <h2 className="text-lg font-bold text-[#111827]">
            Team Members ({staff.length})
          </h2>
        </div>
        <div className="divide-y divide-[#F3F4F6]">
          {staff.map((member) => {
            const roleInfo = ROLE_LABELS[member.role] ?? ROLE_LABELS.staff;
            return (
              <div
                key={member.id}
                className="flex items-center gap-4 p-5 hover:bg-[#FAFAFA] transition-colors"
              >
                {/* Avatar */}
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#2E8B57] to-[#1F4E79] flex items-center justify-center text-white font-bold flex-shrink-0">
                  {(member.user?.user_metadata?.name?.[0] ?? "S").toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-[#374151]">
                      {member.user?.user_metadata?.name ?? "Team Member"}
                    </p>
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${roleInfo.color}`}>
                      {roleInfo.label}
                    </span>
                  </div>
                  <p className="text-sm text-[#6B7280] mt-0.5">{member.user?.email ?? "—"}</p>
                  <p className="text-xs text-[#9CA3AF] mt-0.5">
                    Joined {new Date(member.created_at).toLocaleDateString("en-IN", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </p>
                </div>

                {/* Role icon */}
                <div className="flex-shrink-0 p-2 rounded-lg bg-[#F3F4F6] text-[#6B7280]">
                  {member.role === "owner" ? (
                    <Shield className="h-5 w-5" />
                  ) : (
                    <User className="h-5 w-5" />
                  )}
                </div>

                {/* Remove */}
                {member.role !== "owner" && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-[#EF4444] hover:bg-[#FEE2E2] flex-shrink-0"
                    onClick={() => handleRemove(member.id)}
                    aria-label={`Remove ${member.user?.user_metadata?.name ?? "staff"}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
