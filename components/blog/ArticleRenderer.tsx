import { type BlockType } from "@/lib/blog/posts";
import Image from "next/image";
import Link from "next/link";

interface Props {
  blocks: BlockType[];
}

export function ArticleRenderer({ blocks }: Props) {
  // Collect all FAQ items from the post to build a single FAQPage JSON-LD
  const faqBlocks = blocks.filter((b): b is Extract<BlockType, { type: "faq" }> => b.type === "faq");
  const allFaqItems = faqBlocks.flatMap((b) => b.items);

  const faqJsonLd =
    allFaqItems.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: allFaqItems.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.a,
            },
          })),
        }
      : null;

  return (
    <div className="space-y-5 text-gray-700 leading-relaxed">
      {/* Inject FAQPage JSON-LD once at the top of the article body */}
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}

      {blocks.map((block, i) => {
        switch (block.type) {
          case "h2":
            return (
              <h2
                key={i}
                className="text-2xl font-bold text-gray-900 mt-10 mb-2 first:mt-0"
              >
                {block.text}
              </h2>
            );
          case "h3":
            return (
              <h3
                key={i}
                className="text-lg font-semibold text-gray-800 mt-6 mb-1.5"
              >
                {block.text}
              </h3>
            );
          case "p":
            return (
              <p key={i} className="text-[15px] leading-7">
                {block.text}
              </p>
            );
          case "ul":
            return (
              <ul
                key={i}
                className="list-disc list-outside pl-5 space-y-1.5 text-[15px]"
              >
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol
                key={i}
                className="list-decimal list-outside pl-5 space-y-1.5 text-[15px]"
              >
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ol>
            );
          case "callout":
            return (
              <div
                key={i}
                className="my-6 p-4 bg-emerald-50 border-l-4 border-emerald-500 rounded-r-xl"
              >
                <p className="text-[14px] text-emerald-900 leading-6">
                  {block.text}
                </p>
              </div>
            );
          case "image":
            return (
              <figure key={i} className="my-6">
                <div className="relative w-full h-64 rounded-xl overflow-hidden">
                  <Image
                    src={block.src}
                    alt={block.alt}
                    fill
                    className="object-cover"
                    sizes="(max-width: 672px) 100vw, 672px"
                  />
                </div>
                {block.caption && (
                  <figcaption className="mt-2 text-xs text-center text-gray-400">
                    {block.caption}
                  </figcaption>
                )}
              </figure>
            );

          // -----------------------------------------------------------------------
          // FAQ block — renders a styled Q&A list.
          // FAQPage JSON-LD is injected once at the top of the component (above).
          // -----------------------------------------------------------------------
          case "faq":
            return (
              <section
                key={i}
                aria-labelledby={`faq-heading-${i}`}
                className="mt-10"
              >
                <h2
                  id={`faq-heading-${i}`}
                  className="text-2xl font-bold text-gray-900 mb-6"
                >
                  Frequently Asked Questions
                </h2>
                <div className="space-y-4">
                  {block.items.map((item, j) => (
                    <div
                      key={j}
                      className="border border-gray-100 rounded-xl overflow-hidden"
                    >
                      <div className="px-5 py-4 bg-gray-50">
                        <p className="text-[15px] font-semibold text-gray-900">
                          {item.q}
                        </p>
                      </div>
                      <div className="px-5 py-4 bg-white">
                        <p className="text-[14px] text-gray-600 leading-6">
                          {item.a}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );

          // -----------------------------------------------------------------------
          // Links block — renders a curated internal/external link list
          // -----------------------------------------------------------------------
          case "links":
            return (
              <nav
                key={i}
                aria-label={block.heading ?? "Related links"}
                className="mt-10 pt-6 border-t border-gray-100"
              >
                {block.heading && (
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
                    {block.heading}
                  </p>
                )}
                <ul className="space-y-2">
                  {block.items.map((link, j) =>
                    link.external ? (
                      <li key={j}>
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[14px] text-emerald-700 hover:underline flex items-center gap-1"
                        >
                          {link.label}
                          <span aria-hidden="true" className="text-xs opacity-60">↗</span>
                        </a>
                      </li>
                    ) : (
                      <li key={j}>
                        <Link
                          href={link.href}
                          className="text-[14px] text-emerald-700 hover:underline"
                        >
                          {link.label}
                        </Link>
                      </li>
                    )
                  )}
                </ul>
              </nav>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
