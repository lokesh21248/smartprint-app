# Performance Measurement Script for scan2paper.com
# Run: powershell -ExecutionPolicy Bypass -File scripts\perf-check.ps1

$ErrorActionPreference = "SilentlyContinue"

Write-Host "===== DNS LOOKUP (scan2paper.com) =====" -ForegroundColor Cyan
$dnsStart = Get-Date
$dnsResult = Resolve-DnsName scan2paper.com -Type A
$dnsEnd = Get-Date
$dnsDuration = ($dnsEnd - $dnsStart).TotalMilliseconds
Write-Host "DNS Resolution Time: $dnsDuration ms"
$dnsResult | Select-Object Name, Type, TTL, IPAddress | Format-Table -AutoSize

Write-Host ""
Write-Host "===== REDIRECT CHAIN (scan2paper.com) =====" -ForegroundColor Cyan
$urls = @("https://scan2paper.com", "https://www.scan2paper.com", "http://scan2paper.com")
foreach ($url in $urls) {
    Write-Host "Testing: $url"
    $req = [System.Net.HttpWebRequest]::Create($url)
    $req.AllowAutoRedirect = $false
    $req.Timeout = 10000
    try {
        $resp = $req.GetResponse()
        Write-Host "  Status: $([int]$resp.StatusCode) ($($resp.StatusCode))"
        $loc = $resp.GetResponseHeader("Location")
        if ($loc) { Write-Host "  Redirects to: $loc" }
        $server = $resp.GetResponseHeader("Server")
        $cf = $resp.GetResponseHeader("CF-Ray")
        $via = $resp.GetResponseHeader("Via")
        if ($server) { Write-Host "  Server: $server" }
        if ($cf)     { Write-Host "  CF-Ray: $cf" }
        if ($via)    { Write-Host "  Via: $via" }
        $resp.Close()
    } catch {
        $ex = $_.Exception.InnerException
        if ($ex -and $ex.Response) {
            $code = [int]$ex.Response.StatusCode
            Write-Host "  Status: $code ($($ex.Response.StatusCode))"
            $loc = $ex.Response.GetResponseHeader("Location")
            if ($loc) { Write-Host "  Redirects to: $loc" }
        } else {
            Write-Host "  Error: $($_.Exception.Message)"
        }
    }
}

Write-Host ""
Write-Host "===== TTFB + TOTAL LOAD (scan2paper.com) =====" -ForegroundColor Cyan
function Measure-TTFB {
    param([string]$Url, [string]$Label)
    Write-Host "`n-- $Label ($Url) --"
    $req = [System.Net.HttpWebRequest]::Create($Url)
    $req.AllowAutoRedirect = $true
    $req.Timeout = 30000
    $req.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    $totalStart = Get-Date
    try {
        $resp = $req.GetResponse()
        $ttfb = (Get-Date) - $totalStart
        Write-Host "  TTFB: $($ttfb.TotalMilliseconds.ToString('F0')) ms"
        Write-Host "  Status: $([int]$resp.StatusCode)"

        # Read full body
        $stream = $resp.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        $totalEnd = Get-Date
        $totalLoad = ($totalEnd - $totalStart).TotalMilliseconds
        $bodySize = [System.Text.Encoding]::UTF8.GetByteCount($body)

        Write-Host "  Total Load Time: $($totalLoad.ToString('F0')) ms"
        Write-Host "  Response Body Size: $([math]::Round($bodySize / 1024, 1)) KB"

        # Print relevant response headers
        $headers = @("Server","CF-Cache-Status","CF-Ray","X-Vercel-Id","Cache-Control","Content-Encoding","X-Cache","Age","Vary")
        foreach ($h in $headers) {
            $v = $resp.GetResponseHeader($h)
            if ($v) { Write-Host "  $h`: $v" }
        }
        $resp.Close()
    } catch {
        Write-Host "  Error: $($_.Exception.Message)"
    }
}

Measure-TTFB -Url "https://scan2paper.com" -Label "scan2paper.com (production)"
Measure-TTFB -Url "https://www.scan2paper.com" -Label "www.scan2paper.com (should redirect)"

Write-Host ""
Write-Host "===== SSL CERTIFICATE CHECK =====" -ForegroundColor Cyan
$hostname = "scan2paper.com"
try {
    $client = New-Object System.Net.Sockets.TcpClient($hostname, 443)
    $sslStream = New-Object System.Net.Security.SslStream($client.GetStream(), $false, { $true })
    $start = Get-Date
    $sslStream.AuthenticateAsClient($hostname)
    $sslTime = ((Get-Date) - $start).TotalMilliseconds
    $cert = $sslStream.RemoteCertificate
    Write-Host "SSL Handshake Time: $($sslTime.ToString('F0')) ms"
    Write-Host "Certificate Subject: $($cert.Subject)"
    Write-Host "Certificate Issuer:  $($cert.Issuer)"
    Write-Host "Valid From: $($cert.GetEffectiveDateString())"
    Write-Host "Expires:    $($cert.GetExpirationDateString())"
    $sslStream.Close()
    $client.Close()
} catch {
    Write-Host "SSL Error: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "===== DONE =====" -ForegroundColor Green
