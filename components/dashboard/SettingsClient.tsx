"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Bell, Volume2, VolumeX, Zap, Globe, LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useShopStore } from "@/stores/shopStore";
import { useClerk } from "@clerk/nextjs";
import { useState } from "react";

export function SettingsClient() {
  const router = useRouter();
  const { signOut } = useClerk();
  const {
    soundEnabled, setSoundEnabled,
    autoAccept, setAutoAccept,
    autoAcceptWindow, setAutoAcceptWindow,
    shop,
  } = useShopStore();
  const [language, setLanguage] = useState("en");
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut();
      toast.success("Logged out. See you soon! 👋");
      router.push("/login");
    } catch {
      toast.error("Logout failed");
      setLoggingOut(false);
    }
  };

  const SettingRow = ({
    icon: Icon,
    title,
    description,
    control,
    id,
  }: {
    icon: React.ElementType;
    title: string;
    description: string;
    control: React.ReactNode;
    id: string;
  }) => (
    <div id={id} className="flex items-center justify-between gap-4 py-4 border-b border-[#F3F4F6] last:border-0">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#F3F4F6] flex items-center justify-center flex-shrink-0">
          <Icon className="h-4 w-4 text-[#6B7280]" />
        </div>
        <div>
          <p className="font-semibold text-[#374151] text-sm">{title}</p>
          <p className="text-xs text-[#9CA3AF] mt-0.5">{description}</p>
        </div>
      </div>
      <div className="flex-shrink-0">{control}</div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Notifications */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
        <h2 className="text-lg font-bold text-[#111827] mb-1">Notifications</h2>
        <p className="text-sm text-[#6B7280] mb-5">Manage how you get alerted for new orders</p>

        <SettingRow
          id="sound-toggle"
          icon={soundEnabled ? Volume2 : VolumeX}
          title="Sound Alerts"
          description="Play a sound when a new order arrives"
          control={
            <Switch
              checked={soundEnabled}
              onCheckedChange={(v) => {
                setSoundEnabled(v);
                toast.success(v ? "🔔 Sound alerts on" : "🔇 Sound alerts off");
              }}
            />
          }
        />
        <SettingRow
          id="browser-notify-toggle"
          icon={Bell}
          title="Browser Notifications"
          description="Show desktop popup when you're on another tab"
          control={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (typeof Notification !== "undefined") {
                  Notification.requestPermission().then((perm) => {
                    toast.success(
                      perm === "granted"
                        ? "✅ Browser notifications enabled"
                        : "Browser notifications blocked"
                    );
                  });
                }
              }}
            >
              Enable
            </Button>
          }
        />
      </div>

      {/* Order Automation */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
        <h2 className="text-lg font-bold text-[#111827] mb-1">Order Automation</h2>
        <p className="text-sm text-[#6B7280] mb-5">Reduce manual work for simple orders</p>

        <SettingRow
          id="auto-accept-toggle"
          icon={Zap}
          title="Auto-Accept Orders"
          description="Automatically accept new orders without manual review"
          control={
            <Switch
              checked={autoAccept}
              onCheckedChange={(v) => {
                setAutoAccept(v);
                toast.success(v ? "⚡ Auto-accept enabled" : "Auto-accept disabled");
              }}
            />
          }
        />

        {autoAccept && (
          <div className="mt-4 p-4 bg-[#FEF3C7] rounded-xl border border-[#FCD34D]">
            <p className="text-sm text-[#92400E] font-medium mb-2">
              Auto-accept window
            </p>
            <div className="flex items-center gap-3">
              <Select
                value={autoAcceptWindow.toString()}
                onValueChange={(v) => setAutoAcceptWindow(parseInt(v))}
              >
                <SelectTrigger id="auto-accept-window" className="w-40 h-10 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 10, 15, 30, 60].map((m) => (
                    <SelectItem key={m} value={m.toString()}>
                      {m} minutes
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-[#92400E]">after order is placed</p>
            </div>
          </div>
        )}
      </div>

      {/* Language */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
        <h2 className="text-lg font-bold text-[#111827] mb-1">Language</h2>
        <p className="text-sm text-[#6B7280] mb-5">Interface display language</p>

        <SettingRow
          id="language-select"
          icon={Globe}
          title="Language"
          description="Choose your preferred interface language"
          control={
            <Select value={language} onValueChange={(v) => { setLanguage(v); toast.info("Language support coming soon!"); }}>
              <SelectTrigger id="lang-trigger" className="w-36 h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">🇬🇧 English</SelectItem>
                <SelectItem value="hi">🇮🇳 हिंदी (Hindi)</SelectItem>
                <SelectItem value="te">🌿 తెలుగు (Telugu)</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </div>

      {/* Account */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6">
        <h2 className="text-lg font-bold text-[#111827] mb-4">Account</h2>
        <div className="flex items-center gap-4 p-4 bg-[#F9FAFB] rounded-xl mb-5">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#2E8B57] to-[#1F4E79] flex items-center justify-center text-white font-bold text-lg">
            {shop?.shop_name?.[0]?.toUpperCase() ?? "S"}
          </div>
          <div>
            <p className="font-bold text-[#111827]">{shop?.shop_name ?? "My Shop"}</p>
            <p className="text-sm text-[#6B7280]">{shop?.email ?? "owner@shop.com"}</p>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              {shop?.city}, {shop?.state}
            </p>
          </div>
        </div>

        {/* Logout — big red */}
        <Button
          id="logout-btn"
          variant="destructive"
          size="lg"
          className="w-full"
          loading={loggingOut}
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5" />
          Sign Out of Dashboard
        </Button>
        <p className="text-xs text-[#9CA3AF] text-center mt-2">
          You&apos;ll need to sign in again to manage orders
        </p>
      </div>

      {/* App info */}
      <div className="text-center py-4 text-xs text-[#9CA3AF]">
        <p>SmartPrint Shop Panel · v1.0.0</p>
        <p className="mt-0.5">Built for Indian Xerox shop owners 🇮🇳</p>
      </div>
    </div>
  );
}
