import { type BlockType } from "@/lib/blog/posts";
import Image from "next/image";

interface Props {
  blocks: BlockType[];
}

export function ArticleRenderer({ blocks }: Props) {
  return (
    <div className="space-y-5 text-gray-700 leading-relaxed">
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
          default:
            return null;
        }
      })}
    </div>
  );
}
