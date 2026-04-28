"use client";

import { PromptInputBox } from "@/components/ui/ai-prompt-box";

const DemoOne = () => {
  const handleSendMessage = (message: string, files?: File[]) => {
    console.log("Message:", message);
    console.log("Files:", files);
  };
  const unsplashBg =
    "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=80";

  return (
    <div
      className="relative flex h-screen w-full items-center justify-center"
      style={{
        backgroundImage: `linear-gradient(rgba(17, 24, 39, 0.65), rgba(17, 24, 39, 0.65)), url(${unsplashBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="w-[500px] p-4">
        <PromptInputBox onSend={handleSendMessage} />
      </div>
    </div>
  );
};

export { DemoOne };
