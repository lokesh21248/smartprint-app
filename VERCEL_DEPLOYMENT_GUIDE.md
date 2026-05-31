# 🚀 Vercel Deployment Guide: Scan2Paper SaaS

Your application is now fully optimized for Vercel. Follow these steps to launch.

## 1. Environment Variables (CRITICAL)
Vercel requires these variables to be set in the **Dashboard > Settings > Environment Variables** section. Copy them exactly from your `.env.local`.

### 🔑 Authentication (Clerk)
| Variable | Value (Example) |
| :--- | :--- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_...` |
| `CLERK_SECRET_KEY` | `sk_test_...` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/login` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/signup` |

### 🗄️ Database (Supabase)
| Variable | Value (Example) |
| :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://your-project.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `your-anon-key` |
| `SUPABASE_SERVICE_ROLE_KEY` | `your-service-role-key` |

### 🛠️ Monitoring (Sentry)
| Variable | Value (Example) |
| :--- | :--- |
| `SENTRY_AUTH_TOKEN` | *Required for source map upload* |
| `NEXT_PUBLIC_SENTRY_DSN` | `https://...` |

### ⏲️ Security & Cron
| Variable | Value (Example) |
| :--- | :--- |
| `CRON_SECRET` | *Any random secure string* |

---

## 2. Deployment Steps

1. **Push to GitHub/GitLab**: Ensure all your local changes (especially `next.config.js` and `vercel.json`) are committed and pushed.
2. **Import Project**:
   - Go to [vercel.com/new](https://vercel.com/new).
   - Select your repository.
3. **Configure Build Settings**:
   - **Framework Preset**: Next.js (Automatic).
   - **Build Command**: `npm run build`.
   - **Install Command**: `npm install`.
4. **Add Environment Variables**: Paste the variables listed above.
5. **Deploy**: Click **Deploy**.

---

## 3. Post-Deployment Verification

### ✅ Verify Sentry Tunnel
Check your Vercel logs for requests to `/monitoring`. If you see 200/204 status codes, error reporting is working through the tunnel (bypassing ad-blockers).

### ✅ Verify Clerk Middleware
Navigate to `/dashboard` while logged out. It should correctly redirect you to `/login`.

### ✅ Verify Cron Jobs
Go to **Settings > Cron Jobs** in Vercel to confirm that `/api/cron/cleanup` is registered.

---

### 💡 Pro Tip: Custom Domain
Since you mentioned Namecheap/GoDaddy, you can point your domain to Vercel by:
1. Adding the domain in **Vercel Dashboard > Settings > Domains**.
2. Updating your DNS settings at Namecheap/GoDaddy to use Vercel's Nameservers or adding the provided `CNAME`/`A` records.

**Your project is now architecturally robust and ready for production scale on Vercel.**
