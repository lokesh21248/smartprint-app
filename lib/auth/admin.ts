import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function requireAdmin() {
  const { userId } = await auth();
  
  if (!userId) {
    return { 
      authorized: false, 
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) 
    };
  }

  const user = await currentUser();
  const role = user?.publicMetadata?.role;

  if (role !== "admin") {
    console.warn(JSON.stringify({
      status: "unauthorized_access_attempt",
      userId,
      timestamp: new Date().toISOString()
    }));
    
    return { 
      authorized: false, 
      response: NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 }) 
    };
  }

  return { authorized: true, userId };
}

export function logAdminAction(params: {
  userId: string;
  action: string;
  affectedCount?: number;
  ip?: string;
  isDryRun?: boolean;
}) {
  console.log(JSON.stringify({
    status: "admin_action",
    ...params,
    timestamp: new Date().toISOString()
  }));
}
