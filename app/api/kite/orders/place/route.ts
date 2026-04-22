import { NextRequest, NextResponse } from "next/server";
import { placeKiteOrder, type KitePlaceOrderBody } from "@/lib/kite-place-order";
import { getKiteAccessToken } from "@/lib/kite-session";

export async function POST(req: NextRequest) {
  const token = await getKiteAccessToken();
  if (!token) {
    return NextResponse.json(
      {
        status: "error",
        message: "Not logged in to Kite",
        error_type: "TokenException",
      },
      { status: 401 },
    );
  }

  let body: KitePlaceOrderBody;
  try {
    body = (await req.json()) as KitePlaceOrderBody;
  } catch {
    return NextResponse.json({
      status: "error",
      message: "Invalid JSON body",
      error_type: "InputException",
    });
  }

  const env = await placeKiteOrder(token, body);
  return NextResponse.json(env);
}
