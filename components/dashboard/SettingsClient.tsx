"use client";

import { toast } from "sonner";
import {
  Bell, Volume2, VolumeX, Zap, Globe, LogOut, MessageSquare, Coins, BellRing, Radio, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useShopStore } from "@/stores/shopStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { audioManager } from "@/lib/audioManager";
import { useClerk } from "@clerk/nextjs";
import { useState, useEffect } from "react";

interface SettingsClientProps {
  shopId: string | null;
  shopName: string;
  shopEmail: string;
  shopLocation: string;
}

const AVAILABLE_SOUNDS = [
  {
    id: "whatsapp",
    name: "WhatsApp Merchant",
    description: "Double chime alert ideal for retail messaging.",
    icon: MessageSquare,
    color: "from-[#25D366] to-[#128C7E]",
  },
  {
    id: "cash",
    name: "Cash Register",
    description: "Classic register cha-ching! for successful sales.",
    icon: Coins,
    color: "from-[#F59E0B] to-[#D97706]",
  },
  {
    id: "bell",
    name: "Service Bell",
    description: "A ringing desk bell chime that grabs attention.",
    icon: BellRing,
    color: "from-[#3B82F6] to-[#2563EB]",
  },
  {
    id: "ding",
    name: "Minimalist Ding",
    description: "A short, clean, modern high-frequency beep.",
    icon: Radio,
    color: "from-[#EC4899] to-[#DB2777]",
  }
];

export function SettingsClient({ shopId, shopName, shopEmail, shopLocation }: SettingsClientProps) {
  const { signOut } = useClerk();
  
  // Synchronized sound settings from database-backed Zustand store
  const {
    soundEnabled, setSoundEnabled,
    notificationSound, setNotificationSound,
  } = useSettingsStore();

  // Legacy local-storage store for order automation
  const {
    setSoundEnabled: setShopStoreSoundEnabled,
    autoAccept, setAutoAccept,
    autoAcceptWindow, setAutoAcceptWindow,
  } = useShopStore();
  
  // mounted guard: needed only to prevent hydration mismatch from Zustand-persisted
  // values which may differ between server and client.
  const [mounted, setMounted] = useState(false);
  const [language, setLanguage] = useState("en");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="animate-pulse space-y-6 max-w-2xl">
      <div className="h-48 bg-gray-100 rounded-2xl" />
      <div className="h-48 bg-gray-100 rounded-2xl" />
    </div>;
  }

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut({ redirectUrl: "/login" });
      toast.success("Logged out. See you soon! 👋");
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
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-sm">
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
                setSoundEnabled(v, shopId);
                setShopStoreSoundEnabled(v);
                toast.success(v ? "🔔 Sound alerts enabled" : "🔇 Sound alerts disabled");
              }}
            />
          }
        />

        {soundEnabled && (
          <div className="mt-6 border-t border-[#F3F4F6] pt-6 animate-fade-in">
            <h3 className="text-sm font-semibold text-[#374151] mb-3 flex items-center gap-2">
              <span>Notification Sound Choice</span>
              <span className="text-xs font-normal text-[#9CA3AF]">(Select to preview)</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {AVAILABLE_SOUNDS.map((sound) => {
                const isSelected = notificationSound === sound.id;
                const IconComponent = sound.icon;
                return (
                  <button
                    key={sound.id}
                    onClick={async () => {
                      await setNotificationSound(sound.id as any, shopId);
                      audioManager.play(sound.id);
                    }}
                    className={`relative flex items-start text-left p-4 rounded-xl border text-sm transition-all duration-300 ${
                      isSelected
                        ? "border-[#10B981] bg-[#ECFDF5]/50 shadow-[0_4px_16px_-4px_rgba(16,185,129,0.15)] ring-1 ring-[#10B981]"
                        : "border-[#E5E7EB] bg-white hover:border-[#D1D5DB] hover:bg-[#F9FAFB]"
                    }`}
                  >
                    <div className={`p-2.5 rounded-lg bg-gradient-to-br ${sound.color} text-white mr-3 flex-shrink-0`}>
                      <IconComponent className="h-4 w-4" />
                    </div>
                    <div className="flex-1 pr-5">
                      <p className="font-semibold text-[#111827]">{sound.name}</p>
                      <p className="text-xs text-[#6B7280] mt-1 leading-normal">{sound.description}</p>
                    </div>
                    {isSelected && (
                      <div className="absolute top-3 right-3 text-[#10B981]">
                        <CheckCircle2 className="h-5 w-5 fill-[#ECFDF5]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-[#F3F4F6] pt-4">
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
            {shopName[0]?.toUpperCase() ?? "S"}
          </div>
          <div>
            <p className="font-bold text-[#111827]">{shopName}</p>
            <p className="text-sm text-[#6B7280]">{shopEmail}</p>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              {shopLocation}
            </p>
          </div>
        </div>

        {/* Sign Out — compact secondary action */}
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-[#9CA3AF]">
            You&apos;ll need to sign in again to manage orders
          </p>
          <button
            id="logout-btn"
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="
              inline-flex items-center gap-2
              h-[38px] px-4
              rounded-lg
              border border-red-200
              bg-white
              text-sm font-medium text-red-500
              shadow-none
              transition-all duration-200 ease-in-out
              hover:bg-red-50 hover:border-red-300 hover:text-red-600 hover:shadow-sm
              active:scale-[0.97]
              disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-1
            "
          >
            {loggingOut ? (
              <svg
                className="h-4 w-4 animate-spin text-red-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            ) : (
              <LogOut className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{loggingOut ? "Signing out…" : "Sign Out"}</span>
          </button>
        </div>
      </div>

      {/* App info */}
      <div className="text-center py-4 text-xs text-[#9CA3AF]">
        <p>Scan2Paper Shop Panel · v1.0.0</p>
        <p className="mt-0.5">Built for Indian Xerox shop owners 🇮🇳</p>
      </div>
    </div>
  );
}
