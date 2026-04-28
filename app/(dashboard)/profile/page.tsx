'use client';

import { useEffect, useState, useRef } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import { createClient } from '@/lib/supabase/client';
import { QRCodeCanvas } from 'qrcode.react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Printer, Copy, Check, Edit, Loader2, Store, User as UserIcon, Mail, Phone, MapPin, Hash, QrCode } from 'lucide-react';
import { toast } from 'sonner';

interface Shop {
  id: string;
  shop_name: string;
  owner_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  shop_code: string;
  qr_code_url: string;
  qr_scan_count: number;
  code_use_count: number;
  is_active: boolean;
}

export default function ProfilePage() {
  const { user, isLoaded: userLoaded } = useUser();
  const { userId, isLoaded: authLoaded } = useAuth();
  
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const [formData, setFormData] = useState({
    shop_name: '',
    owner_name: '',
    phone: '',
    address: '',
    city: '',
  });

  useEffect(() => { 
    if (authLoaded && userId) {
      loadShop(); 
    }
  }, [authLoaded, userId]);

  const loadShop = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('shops')
        .select('*')
        .eq('owner_id', userId)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        setShop(null);
        return;
      }
      
      setShop(data);
      setFormData({
        shop_name: data.shop_name || '',
        owner_name: data.owner_name || '',
        phone: data.phone || '',
        address: data.address || '',
        city: data.city || '',
      });
    } catch (err: unknown) {
      toast.error('Failed to load profile: ' + ((err as Error).message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!shop) return;
    
    if (!formData.shop_name.trim()) {
      toast.error('Shop name is required');
      return;
    }
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('shops')
        .update({
          shop_name: formData.shop_name.trim(),
          phone: formData.phone.trim(),
          address: formData.address.trim(),
          city: formData.city.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', shop.id);

      if (error) throw error;
      toast.success('Profile updated successfully');
      setEditing(false);
      await loadShop();
    } catch (err: unknown) {
      toast.error('Failed to save: ' + ((err as Error).message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const downloadQR = () => {
    if (!shop) return;
    try {
      const canvas = qrRef.current?.querySelector('canvas');
      if (!canvas) {
        toast.error('QR code not ready');
        return;
      }
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${shop.shop_name.replace(/\s+/g, '_')}_QR.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('QR code downloaded');
    } catch {
      toast.error('Download failed');
    }
  };

  const printPoster = () => {
    if (!shop) return;
    try {
      const canvas = qrRef.current?.querySelector('canvas');
      if (!canvas) {
        toast.error('QR code not ready');
        return;
      }
      const dataUrl = canvas.toDataURL('image/png');
      const printWindow = window.open('', '_blank', 'width=800,height=900');
      if (!printWindow) {
        toast.error('Please allow popups to print');
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>SmartPrint Poster - ${shop.shop_name}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 40px; background: white; }
            .poster { max-width: 600px; margin: 0 auto; padding: 48px; border: 4px solid #2E8B57; border-radius: 24px; text-align: center; background: white; }
            .header { margin-bottom: 24px; }
            .shop-name { font-size: 38px; font-weight: 700; color: #2E8B57; margin-bottom: 8px; }
            .address { font-size: 16px; color: #666; }
            .divider { border-top: 2px dashed #2E8B57; margin: 32px 0; opacity: 0.3; }
            .options { display: flex; gap: 32px; justify-content: center; align-items: center; margin: 24px 0; }
            .option { flex: 1; }
            .option-label { font-size: 14px; font-weight: 600; color: #2E8B57; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
            .qr-img { width: 280px; height: 280px; }
            .code-box { display: inline-block; padding: 24px 32px; border: 3px solid #2E8B57; border-radius: 16px; background: #F0FDF4; }
            .code { font-size: 56px; font-weight: 700; color: #2E8B57; letter-spacing: 6px; font-family: monospace; }
            .or-text { font-size: 18px; font-weight: 600; color: #666; padding: 0 16px; }
            .scan-text { font-size: 22px; font-weight: 600; color: #2E8B57; margin-top: 20px; }
            .instructions { font-size: 14px; color: #666; margin-top: 16px; line-height: 1.6; }
            .footer { margin-top: 32px; font-size: 12px; color: #999; }
            @media print {
              body { padding: 0; }
              .poster { border: 4px solid #2E8B57; box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="poster">
            <div class="header">
              <div class="shop-name">${shop.shop_name}</div>
              <div class="address">${shop.address || ''}, ${shop.city || ''}</div>
            </div>
            
            <div class="options">
              <div class="option">
                <div class="option-label">Scan QR</div>
                <img src="${dataUrl}" class="qr-img" alt="QR Code" />
              </div>
              
              <div class="or-text">OR</div>
              
              <div class="option">
                <div class="option-label">Use Code</div>
                <div class="code-box">
                  <div class="code">${shop.shop_code}</div>
                </div>
              </div>
            </div>
            
            <div class="scan-text">Scan QR or Enter Code to Order</div>
            <div class="instructions">
              1. Open SmartPrint app<br/>
              2. Scan the QR or enter code "${shop.shop_code}"<br/>
              3. Upload your files & place order
            </div>
            
            <div class="footer">Powered by SmartPrint</div>
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 500);
            };
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
      toast.success('Opening print dialog...');
    } catch {
      toast.error('Print failed');
    }
  };

  const copyShopCode = async () => {
    if (!shop) return;
    try {
      await navigator.clipboard.writeText(shop.shop_code);
      setCopiedCode(true);
      toast.success('Shop code copied');
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const copyLink = async () => {
    if (!shop) return;
    try {
      await navigator.clipboard.writeText(shop.qr_code_url);
      setCopiedLink(true);
      toast.success('Link copied');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  if (loading || !userLoaded || !authLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Profile not found. Please contact support.</p>
      </div>
    );
  }

  const metadata = user?.publicMetadata as any;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Profile</h1>
          <p className="text-gray-600 mt-1">Manage shop info, share your code or QR with customers</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          shop.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
        }`}>
          {shop.is_active ? '● Active' : '● Inactive'}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Store className="w-5 h-5" /> Shop Information
              </CardTitle>
              <CardDescription>Your shop details</CardDescription>
            </div>
            {!editing && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Edit className="w-4 h-4 mr-1" /> Edit
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {editing ? (
              <>
                <div className="space-y-2">
                  <Label>Shop Name *</Label>
                  <Input value={formData.shop_name} onChange={(e) => setFormData({...formData, shop_name: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input value={formData.city} onChange={(e) => setFormData({...formData, city: e.target.value})} />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                    {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving</> : 'Save'}
                  </Button>
                  <Button variant="outline" onClick={() => { setEditing(false); loadShop(); }} disabled={saving}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <InfoRow icon={<Store className="w-4 h-4" />} label="Shop Name" value={shop.shop_name} />
                <InfoRow icon={<UserIcon className="w-4 h-4" />} label="Owner" value={metadata?.ownerName || 'N/A'} />
                <InfoRow icon={<Mail className="w-4 h-4" />} label="Email" value={user?.emailAddresses[0]?.emailAddress || 'N/A'} />
                <InfoRow icon={<Phone className="w-4 h-4" />} label="Phone" value={shop.phone} />
                <InfoRow icon={<MapPin className="w-4 h-4" />} label="Address" value={`${shop.address}, ${shop.city}`} />
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="w-5 h-5" /> Your Shop Code
            </CardTitle>
            <CardDescription>Customers type this 6-letter code to find you</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-8 rounded-xl border-2 border-emerald-200 text-center">
              <p className="text-xs uppercase tracking-wider text-emerald-700 font-semibold mb-3">Shop Code</p>
              <div className="text-5xl font-bold text-emerald-700 tracking-[0.3em] font-mono mb-2">
                {shop.shop_code}
              </div>
              <p className="text-sm text-emerald-600 mt-3">Easy to remember, easy to share</p>
            </div>

            <Button onClick={copyShopCode} variant="outline" className="w-full mt-4">
              {copiedCode ? <><Check className="w-4 h-4 mr-2" /> Copied!</> : <><Copy className="w-4 h-4 mr-2" /> Copy Code</>}
            </Button>

            <div className="mt-4 p-3 bg-emerald-50 rounded-lg">
              <p className="text-sm">
                <span className="font-semibold text-emerald-800">{shop.code_use_count || 0}</span>
                <span className="text-emerald-700"> times used</span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" /> Your QR Code
            </CardTitle>
            <CardDescription>Customers scan to open your shop</CardDescription>
          </CardHeader>
          <CardContent>
            <div ref={qrRef} className="bg-gray-50 p-6 rounded-xl flex flex-col items-center">
              <div className="bg-white p-3 rounded-lg">
                <QRCodeCanvas value={shop.qr_code_url || `https://smartprint.com/shop/${shop.id}`} size={200} level="H" includeMargin={true} fgColor="#2E8B57" />
              </div>
              <p className="mt-3 font-semibold text-sm">{shop.shop_name}</p>
              <p className="text-xs text-gray-500">Scan to Order</p>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4">
              <Button onClick={downloadQR} variant="outline" size="sm">
                <Download className="w-4 h-4 mr-1" />
              </Button>
              <Button onClick={copyLink} variant="outline" size="sm">
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
              <Button onClick={printPoster} variant="outline" size="sm" className="col-span-1">
                <Printer className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-1">
              <p className="text-xs text-center text-gray-500">Download</p>
              <p className="text-xs text-center text-gray-500">{copiedLink ? 'Copied' : 'Copy Link'}</p>
              <p className="text-xs text-center text-gray-500">Print</p>
            </div>

            <div className="mt-4 p-3 bg-emerald-50 rounded-lg">
              <p className="text-sm">
                <span className="font-semibold text-emerald-800">{shop.qr_scan_count || 0}</span>
                <span className="text-emerald-700"> total scans</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gradient-to-r from-emerald-50 to-blue-50 border-emerald-200">
        <CardContent className="p-6">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Printer className="w-5 h-5" /> Print Combined Poster
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Print a poster with BOTH your QR code and shop code. Display it at your shop counter for customers.
          </p>
          <Button onClick={printPoster} className="bg-emerald-600 hover:bg-emerald-700">
            <Printer className="w-4 h-4 mr-2" /> Print Combined Poster (QR + Code)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-gray-400 mt-1">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium break-words">{value || '-'}</p>
      </div>
    </div>
  );
}
