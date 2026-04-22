/**
 * Kite postbacks are documented as raw JSON but are commonly sent with
 * Content-Type: application/x-www-form-urlencoded (see Kite developer forum).
 * Accept plain JSON, URL-decoded JSON, or a single form field whose value is JSON.
 */
export function parseKitePostbackBody(raw: string): unknown | undefined {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) return null;

  const tryJson = (s: string): unknown | undefined => {
    try {
      return JSON.parse(s) as unknown;
    } catch {
      return undefined;
    }
  };

  const direct = tryJson(text);
  if (direct !== undefined) return direct;

  try {
    const decoded = decodeURIComponent(text.replace(/\+/g, " "));
    const fromDecoded = tryJson(decoded);
    if (fromDecoded !== undefined) return fromDecoded;
  } catch {
    // invalid % sequences
  }

  if (text.includes("=")) {
    const params = new URLSearchParams(text);
    for (const value of params.values()) {
      let candidate = value;
      try {
        candidate = decodeURIComponent(value.replace(/\+/g, " "));
      } catch {
        /* use raw value */
      }
      const parsed = tryJson(candidate);
      if (parsed !== undefined) return parsed;
    }
  }

  return undefined;
}
