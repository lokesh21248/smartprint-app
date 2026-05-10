import { NextResponse } from "next/server";

/**
 * @deprecated This route used the legacy nested pricing schema and is no longer functional.
 * Order creation has moved to POST /api/orders.
 *
 * Returning 410 Gone so any stale clients surface a clear error rather than a silent failure.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "This endpoint is deprecated. Use POST /api/orders instead.",
      docs: "/api/orders",
    },
    { status: 410 }
  );
}
