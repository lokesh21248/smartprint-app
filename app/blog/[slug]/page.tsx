import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { blogPosts } from "../page";

// ---------------------------------------------------------------------------
// Static generation
// Pre-render every known blog post at build time.
// New posts added to `blogPosts` in page.tsx will be generated on the next
// deployment (or on demand with ISR if you add `revalidate`).
// ---------------------------------------------------------------------------
export function generateStaticParams() {
  return blogPosts.map((p) => ({ slug: p.slug }));
}

// ---------------------------------------------------------------------------
// Dynamic SEO metadata per post
// ---------------------------------------------------------------------------
export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const post = blogPosts.find((p) => p.slug === params.slug);

  if (!post) {
    // Unknown slug — tell Google not to index
    return {
      title: "Post Not Found | Scan2Paper Blog",
      robots: { index: false, follow: true },
    };
  }

  const url = `https://scan2paper.com/blog/${post.slug}`;

  return {
    title: `${post.title} | Scan2Paper Blog`,
    description: post.description,
    alternates: {
      canonical: url,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      type: "article",
      publishedTime: post.date,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

// ---------------------------------------------------------------------------
// Full article content map
// In production, replace with a CMS/MDX fetch keyed by slug.
// ---------------------------------------------------------------------------
const articleContent: Record<string, React.ReactNode> = {
  "how-to-manage-print-orders-online": (
    <>
      <p>
        Managing print orders manually — with paper slips or WhatsApp messages
        — is error-prone and slow. Scan2Paper replaces that workflow with a
        real-time digital dashboard visible to you and your staff from any
        device.
      </p>
      <h2>Step 1: Set up your shop</h2>
      <p>
        After signing up, create your shop profile. You'll get a unique 6-letter
        code and a QR code customers can scan.
      </p>
      <h2>Step 2: Share your QR code</h2>
      <p>
        Print the QR code and display it at your counter. Customers scan it,
        upload their PDF, configure print settings, and submit — all before
        standing in a queue.
      </p>
      <h2>Step 3: Accept and process orders</h2>
      <p>
        Each new order appears instantly on your dashboard. Accept it with one
        tap. When printing is done, mark it complete and the customer receives
        a notification.
      </p>
    </>
  ),
  "upi-payments-for-xerox-shops": (
    <>
      <p>
        Cash-only print shops lose customers who don't carry change. UPI
        payments — via Scan2Paper — let customers pay before even arriving at
        your counter.
      </p>
      <h2>How it works</h2>
      <p>
        After uploading their documents, customers see the total amount and a
        UPI payment link. Payment is confirmed in seconds. You see the payment
        status on your dashboard before printing a single page.
      </p>
      <h2>Benefits</h2>
      <ul>
        <li>No cash-handling errors</li>
        <li>Faster counter checkout</li>
        <li>Built-in payment record for every order</li>
      </ul>
    </>
  ),
  "qr-code-shop-discovery": (
    <>
      <p>
        Instead of handing out business cards, give customers a QR code. One
        scan takes them directly to your Scan2Paper shop page where they can
        place an order.
      </p>
      <h2>Where to place your QR code</h2>
      <ul>
        <li>Counter display</li>
        <li>Near college notice boards</li>
        <li>On delivery packaging</li>
        <li>In WhatsApp status / Instagram bio</li>
      </ul>
      <h2>What happens after the scan</h2>
      <p>
        The customer lands on your branded shop page, sees your location and
        hours, uploads files, and pays — without ever speaking to anyone.
      </p>
    </>
  ),
  "staff-management-for-print-shops": (
    <>
      <p>
        A busy print shop needs more than one person. Scan2Paper lets you add
        staff members who can view and process orders without accessing your
        account settings or revenue data.
      </p>
      <h2>Role-based access</h2>
      <p>
        Assign the <strong>Staff</strong> role to counter operators. They can
        accept, process, and complete orders. Only the shop owner can see
        revenue, edit shop settings, or manage staff.
      </p>
      <h2>Remote monitoring</h2>
      <p>
        Track how many orders each staff member processed today from the
        Analytics tab — even if you're not at the shop.
      </p>
    </>
  ),
  "increase-revenue-print-shop": (
    <>
      <p>
        Most print shops price identically to competitors. Here are five ways to
        differentiate and earn more.
      </p>
      <h2>1. Offer colour printing prominently</h2>
      <p>
        Customers often don't ask for colour because they assume it's
        unavailable. Display it as a clear option during upload.
      </p>
      <h2>2. Bundle copies at a discount</h2>
      <p>
        Charge ₹1.50/page for 1–10 pages, ₹1/page for 11+ pages. Customers
        naturally order more.
      </p>
      <h2>3. Reduce wait time</h2>
      <p>
        Pre-received orders mean you can print in advance. Customers who
        experience zero wait return every time.
      </p>
      <h2>4. Send notifications</h2>
      <p>
        The "Ready for pickup" notification creates a positive last impression
        and reduces counter congestion.
      </p>
      <h2>5. Collect reviews</h2>
      <p>
        A Google Business listing with 20+ five-star reviews brings more walk-in
        traffic than any flyer.
      </p>
    </>
  ),
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function BlogPostPage({
  params,
}: {
  params: { slug: string };
}) {
  const post = blogPosts.find((p) => p.slug === params.slug);
  if (!post) notFound();

  const content = articleContent[post.slug];

  // JSON-LD Article structured data — helps Google understand this is an article
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: {
      "@type": "Organization",
      name: "Scan2Paper",
      url: "https://scan2paper.com",
    },
    publisher: {
      "@type": "Organization",
      name: "Scan2Paper",
      url: "https://scan2paper.com",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://scan2paper.com/blog/${post.slug}`,
    },
  };

  return (
    <>
      {/* Article structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50 px-4 py-16">
        <div className="max-w-2xl mx-auto">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-8 text-sm text-gray-500">
            <Link href="/" className="hover:text-emerald-700 transition">
              Home
            </Link>
            <span className="mx-2">›</span>
            <Link
              href="/blog"
              className="hover:text-emerald-700 transition"
            >
              Blog
            </Link>
            <span className="mx-2">›</span>
            <span className="text-gray-700">{post.title}</span>
          </nav>

          {/* Article header */}
          <article>
            <header className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-3">
                {post.title}
              </h1>
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <time dateTime={post.date}>{formatDate(post.date)}</time>
                <span>·</span>
                <span>{post.readingTime}</span>
              </div>
            </header>

            {/* Article body */}
            <div className="prose prose-emerald max-w-none text-gray-700 space-y-4">
              {content ?? (
                <p>
                  This article is coming soon. Check back shortly for the full
                  guide.
                </p>
              )}
            </div>
          </article>

          {/* CTA */}
          <div className="mt-12 p-6 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
            <p className="text-gray-700 font-medium mb-3">
              Ready to digitalise your print shop?
            </p>
            <Link
              href="/login"
              className="inline-block px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition text-sm"
            >
              Get Started Free
            </Link>
          </div>

          {/* Back to blog */}
          <div className="mt-8 text-center">
            <Link
              href="/blog"
              className="text-sm text-emerald-600 hover:underline"
            >
              ← Back to Blog
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
