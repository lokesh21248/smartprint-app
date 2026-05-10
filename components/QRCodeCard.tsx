"use client"

import { useState, useEffect } from "react"
import { QRCodeSVG } from "qrcode.react"
import { Download, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export default function QRCodeCard({
  slug,
  shopCode,
  shopName,
}: {
  slug?: string
  shopCode?: string
  shopName?: string
}) {
  const [mounted, setMounted] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Return null on server to prevent hydration mismatch
  if (!mounted) return null

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
  // Slug is the canonical identifier — always set at shop creation.
  const shopUrl = slug?.trim() ? `${baseUrl}/s/${slug.trim().toLowerCase()}` : ""

  if (!slug?.trim()) {
    return (
      <div className="flex items-center justify-center h-[200px] w-full rounded-lg bg-gray-50 border">
        <p className="text-gray-400 text-sm">No shop code found</p>
      </div>
    )
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shopUrl)
      setCopied(true)
      toast.success("Shop link copied!")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Failed to copy link")
    }
  }

  const downloadQR = () => {
    // Find the SVG element and convert to downloadable PNG
    const svg = document.getElementById("shop-qr-svg")
    if (!svg) return

    const canvas = document.createElement("canvas")
    canvas.width = 400
    canvas.height = 400
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const xml = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([xml], { type: "image/svg+xml" })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      ctx.fillStyle = "white"
      ctx.fillRect(0, 0, 400, 400)
      ctx.drawImage(img, 0, 0, 400, 400)
      URL.revokeObjectURL(url)
      const link = document.createElement("a")
      link.download = `${(shopName || "QR").replace(/\s+/g, "_")}_QR.png`
      link.href = canvas.toDataURL("image/png")
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success("QR downloaded!")
    }
    img.src = url
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="p-3 border rounded-xl bg-white shadow-sm">
        <QRCodeSVG
          id="shop-qr-svg"
          value={shopUrl}
          size={180}
          level="H"
          includeMargin
        />
      </div>

      <div className="text-center">
        <p className="font-semibold text-sm">{shopName}</p>
        <p className="text-xs text-gray-500 mt-0.5">Scan to place an order</p>
      </div>

      <div className="flex w-full gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={copyLink}
        >
          {copied
            ? <Check className="mr-1.5 h-3.5 w-3.5" />
            : <Copy className="mr-1.5 h-3.5 w-3.5" />}
          {copied ? "Copied!" : "Copy Link"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={downloadQR}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Download
        </Button>
      </div>
    </div>
  )
}
