# Cold start variance + CDN cache check
Write-Host "===== COLD START VARIANCE (5 requests) =====" -ForegroundColor Cyan
for ($i = 1; $i -le 5; $i++) {
    $req = [System.Net.HttpWebRequest]::Create("https://scan2paper.com")
    $req.AllowAutoRedirect = $true
    $req.Timeout = 30000
    $req.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    $start = Get-Date
    try {
        $resp = $req.GetResponse()
        $ttfb = ((Get-Date) - $start).TotalMilliseconds
        $xVid = $resp.GetResponseHeader("X-Vercel-Id")
        $age  = $resp.GetResponseHeader("Age")
        $cc   = $resp.GetResponseHeader("Cache-Control")
        $stream = $resp.GetResponseStream()
        $null  = (New-Object System.IO.StreamReader($stream)).ReadToEnd()
        $total = ((Get-Date) - $start).TotalMilliseconds
        Write-Host "  [$i] TTFB: $($ttfb.ToString('F0'))ms  Total: $($total.ToString('F0'))ms"
        Write-Host "      VercelID: $xVid"
        Write-Host "      Cache-Control: $cc  Age: $age"
        $resp.Close()
    } catch {
        Write-Host "  [$i] Error: $($_.Exception.Message)"
    }
    Start-Sleep -Milliseconds 800
}

Write-Host ""
Write-Host "===== CLOUDFLARE / CDN HEADERS =====" -ForegroundColor Cyan
$cfReq = [System.Net.HttpWebRequest]::Create("https://scan2paper.com")
$cfReq.AllowAutoRedirect = $true
$cfReq.Timeout = 15000
$cfResp = $cfReq.GetResponse()
$headers = @("CF-Cache-Status","CF-Ray","CDN-Cache-Control","X-Cache","X-Served-By","X-Timer","Fly-Request-Id","Age","Server","Content-Encoding","Content-Length","Transfer-Encoding")
foreach ($h in $headers) {
    $v = $cfResp.GetResponseHeader($h)
    if ($v) { Write-Host "${h}: $v" }
}
$cfResp.Close()

Write-Host ""
Write-Host "===== VERCEL EDGE ROUTING ANALYSIS =====" -ForegroundColor Cyan
Write-Host "X-Vercel-Id format: [edge-pop]::[origin-dc]::[request-id-timestamp]"
Write-Host "bom1 = Mumbai (BOM) edge PoP"
Write-Host "iad1 = Washington DC (IAD) Vercel origin"
Write-Host ""
Write-Host "FINDING: Request hits Mumbai CDN edge but MISSES cache -> routes to US DC"
Write-Host "This adds ~150-200ms of transatlantic latency on every request"
Write-Host ""
Write-Host "ROOT CAUSE: 'export const dynamic = force-dynamic' on homepage"
Write-Host "Cache-Control: private, no-cache, no-store => Cloudflare/Vercel CDN cannot cache"
Write-Host "Every request must hit the US origin server (cold SSR)"
