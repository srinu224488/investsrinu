import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.KITE_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      { error: "KITE_API_KEY is not configured" },
      { status: 500 },
    );
  }
  const url = `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(key)}`;
  return NextResponse.redirect(url);
}
