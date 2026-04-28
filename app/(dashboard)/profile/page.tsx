"use client";

import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { Check, Copy, Download, Edit, Hash, Loader2, Mail, MapPin, Phone, Printer, QrCode, Store, User } from "lucide-react";
import { useShopStore } from "@/stores/shopStore";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface ShopRow {
  id: string;
  name: string | null;
  shop_name: string | null;
  owner_email: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  shop_code: string | null;
  qr_code_url: string | null;
  qr_scan_count: number | null;
  code_use_count: number | null;
  slug: string | null;
  is_open: boolean | null;
  is_active: boolean | null;
}

export default function ProfilePage() {
  const shop = useShopStore((s) => s.shop) as unknown as ShopRow | null;
  const setShop = useShopStore((s) => s.setShop);
  const { user } = useUser();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const qrRef = useRef<HTMLDivElement>(null);

  if (!shop) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const isOpen = !!shop.is_open;
  const shopName = shop.shop_name ?? shop.name ?? "";
  const ownerEmail =
    user?.emailAddresses[0]?.emailAddress ??
    shop.owner_email ??
    shop.email ??
    "";
  const fullAddress = [shop.address, shop.city, shop.state, shop.pincode]
    .filter(Boolean)
    .join(", ");

  const startEdit = () => {
    setForm({
      name: shopName,
      phone: shop.phone ?? "",
      address: shop.address ?? "",
    });
    setEditing(true);
  };

  const shopCode = (shop.shop_code ?? shop.slug ?? "").toUpperCase();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");
  const qrUrl =
    shop.qr_code_url ??
    (shop.shop_code ? `${appUrl}/s/${shop.shop_code}` : "") ??
    (shop.slug ? `${appUrl}/s/${shop.slug}` : "");

  const copyShopCode = async () => {
    try {
      await navigator.clipboard.writeText(shopCode);
      setCopiedCode(true);
      toast.success("Shop code copied");
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const copyQrLink = async () => {
    try {
      await navigator.clipboard.writeText(qrUrl);
      setCopiedLink(true);
      toast.success("Link copied");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const downloadQr = () => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) {
      toast.error("QR code not ready");
      return;
    }
    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `${(shopName || "shop").replace(/\s+/g, "_")}_QR.png`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("QR downloaded");
  };

  const printPoster = () => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas || !shopCode) {
      toast.error("QR or code not ready");
      return;
    }
    const dataUrl = canvas.toDataURL("image/png");
    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) {
      toast.error("Please allow popups to print");
      return;
    }

    const doc = win.document;
    doc.open();
    doc.title = `SmartPrint Poster — ${shopName}`;

    const style = doc.createElement("style");
    style.textContent = `
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:40px;background:#fff}
      .poster{max-width:600px;margin:0 auto;padding:48px;border:4px solid #2E8B57;border-radius:24px;text-align:center}
      .shop-name{font-size:36px;font-weight:700;color:#2E8B57;margin-bottom:6px}
      .address{font-size:15px;color:#666}
      .options{display:flex;gap:24px;justify-content:center;align-items:center;margin:32px 0}
      .label{font-size:13px;font-weight:600;color:#2E8B57;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
      .qr{width:240px;height:240px}
      .or{font-size:18px;font-weight:600;color:#666}
      .code-box{padding:20px 28px;border:3px solid #2E8B57;border-radius:14px;background:#F0FDF4}
      .code{font-size:42px;font-weight:700;color:#2E8B57;letter-spacing:5px;font-family:monospace}
      .cta{font-size:20px;font-weight:600;color:#2E8B57;margin-top:16px}
      .footer{margin-top:28px;font-size:12px;color:#999}
      @media print{body{padding:0}}
    `;
    doc.head.appendChild(style);

    const poster = doc.createElement("div");
    poster.className = "poster";
    poster.innerHTML = `
      <div class="shop-name"></div>
      <div class="address"></div>
      <div class="options">
        <div>
          <div class="label">Scan QR</div>
          <img class="qr" alt="QR" />
        </div>
        <div class="or">OR</div>
        <div>
          <div class="label">Use Code</div>
          <div class="code-box"><div class="code"></div></div>
        </div>
      </div>
      <div class="cta">Scan or enter code to order</div>
      <div class="footer">Powered by SmartPrint</div>
    `;
    poster.querySelector(".shop-name")!.textContent = shopName;
    poster.querySelector(".address")!.textContent = fullAddress;
    poster.querySelector(".code")!.textContent = shopCode;
    (poster.querySelector(".qr") as HTMLImageElement).src = dataUrl;
    doc.body.appendChild(poster);
    doc.close();

    setTimeout(() => win.print(), 300);
    toast.success("Opening print dialog…");
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Shop name is required");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const nameField = shop.shop_name !== null ? "shop_name" : "name";
      const { data, error } = await supabase
        .from("shops")
        .update({
          [nameField]: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", shop.id)
        .select()
        .single();

      if (error) throw error;

      setShop(data as never);
      setEditing(false);
      toast.success("Profile updated");
    } catch (err) {
      toast.error(
        "Failed to save: " + (err instanceof Error ? err.message : "Unknown error"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage shop info and share your code or QR with customers
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
            isOpen
              ? "bg-emerald-100 text-emerald-800"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isOpen ? "bg-emerald-500" : "bg-gray-400"
            }`}
          />
          {isOpen ? "Open" : "Closed"}
        </span>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" /> Shop Information
              </CardTitle>
              <CardDescription>Basic details customers will see</CardDescription>
            </div>
            {!editing && (
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Edit className="mr-1 h-4 w-4" /> Edit
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {editing ? (
              <>
                <Field label="Shop name *">
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="My Print Shop"
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="9876543210"
                    inputMode="tel"
                  />
                </Field>
                <Field label="Address">
                  <Input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Street, City"
                  />
                </Field>
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving
                      </>
                    ) : (
                      "Save"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setEditing(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <InfoRow icon={<Store className="h-4 w-4" />} label="Shop name" value={shopName} />
                <InfoRow icon={<User className="h-4 w-4" />} label="Owner" value={(user?.fullName ?? user?.firstName) ?? "—"} />
                <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={ownerEmail} />
                <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={shop.phone} />
                <InfoRow icon={<MapPin className="h-4 w-4" />} label="Address" value={fullAddress} />
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5" /> Shop Code
            </CardTitle>
            <CardDescription>
              Customers enter this short code to find you
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100 p-8 text-center">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Your code
              </p>
              <div className="break-all font-mono text-4xl font-bold tracking-[0.25em] text-emerald-700">
                {shopCode || "—"}
              </div>
              <p className="mt-3 text-sm text-emerald-600">
                Easy to remember, easy to share
              </p>
            </div>

            <Button
              onClick={copyShopCode}
              variant="outline"
              className="mt-4 w-full"
              disabled={!shopCode}
            >
              {copiedCode ? (
                <>
                  <Check className="mr-2 h-4 w-4" /> Copied
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" /> Copy code
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" /> QR Code
            </CardTitle>
            <CardDescription>Customers scan to open your shop</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              ref={qrRef}
              className="flex flex-col items-center rounded-xl bg-gray-50 p-6"
            >
              <div className="rounded-lg bg-white p-3">
                {qrUrl ? (
                  <QRCodeCanvas
                    value={qrUrl}
                    size={200}
                    level="H"
                    marginSize={4}
                    fgColor="#2E8B57"
                  />
                ) : (
                  <div className="flex h-[200px] w-[200px] items-center justify-center text-xs text-gray-400">
                    No QR configured
                  </div>
                )}
              </div>
              <p className="mt-3 text-sm font-semibold">{shopName || "My Shop"}</p>
              <p className="text-xs text-gray-500">Scan to order</p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                onClick={downloadQr}
                variant="outline"
                size="sm"
                disabled={!qrUrl}
              >
                <Download className="mr-1 h-4 w-4" /> Download
              </Button>
              <Button
                onClick={copyQrLink}
                variant="outline"
                size="sm"
                disabled={!qrUrl}
              >
                {copiedLink ? (
                  <>
                    <Check className="mr-1 h-4 w-4" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-4 w-4" /> Copy link
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50 to-blue-50">
        <CardContent className="p-6">
          <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold">
            <Printer className="h-5 w-5" /> Combined Poster
          </h3>
          <p className="mb-4 text-sm text-gray-600">
            Print one poster with both your QR code and shop code. Display it at
            your counter so customers can pick whichever is easier.
          </p>
          <Button
            onClick={printPoster}
            disabled={!qrUrl}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Printer className="mr-2 h-4 w-4" /> Print poster (QR + code)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-gray-400">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="break-words text-sm font-medium">{value || "—"}</p>
      </div>
    </div>
  );
}
