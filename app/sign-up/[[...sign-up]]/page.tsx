import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-[#E8F5EE] via-white to-[#E8F1F8]">
      <SignUp routing="path" path="/sign-up" />
    </div>
  );
}
