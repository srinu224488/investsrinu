import { cookies } from "next/headers";

const COOKIE = "kite_at";

/** For server-side hooks (e.g. TradingView) where no browser cookie exists. */
export function getKiteAccessTokenFromEnv(): string | null {
  return process.env.KITE_ACCESS_TOKEN?.trim() || null;
}

export async function getKiteAccessToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}

export const KITE_ACCESS_COOKIE_NAME = COOKIE;
