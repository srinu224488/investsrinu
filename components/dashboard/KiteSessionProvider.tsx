"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  fetchKiteProfile,
  isInvalidKiteCredentialsError,
  postKiteLogout,
} from "./kite-fetch";
import type { KiteRedirectMsg, ProfileState } from "./types";

type KiteSessionContextValue = {
  profile: ProfileState;
  isLoggingOut: boolean;
  loadProfile: () => Promise<void>;
  logout: () => Promise<void>;
  kiteRedirectMsg: KiteRedirectMsg | null;
  dismissKiteMsg: () => void;
};

const KiteSessionContext = createContext<KiteSessionContextValue | null>(null);

export function KiteSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileState>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [kiteRedirectMsg, setKiteRedirectMsg] = useState<KiteRedirectMsg | null>(
    null,
  );

  const loadProfile = useCallback(async () => {
    const j = await fetchKiteProfile();
    if (!j.connected && isInvalidKiteCredentialsError(j.error)) {
      await postKiteLogout();
      window.location.assign("/api/kite/login");
      return;
    }
    setProfile({
      connected: Boolean(j.connected),
      profile: j.profile,
      error: j.error,
    });
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const kite = params.get("kite");
    if (!kite) return;
    const text = decodeURIComponent(kite.replace(/\+/g, " "));
    if (kite === "ok") {
      setKiteRedirectMsg({ type: "ok", text: "Kite session active." });
    } else if (kite === "denied") {
      setKiteRedirectMsg({
        type: "err",
        text: "Login was cancelled or failed.",
      });
    } else if (kite === "config") {
      setKiteRedirectMsg({
        type: "err",
        text: "Set KITE_API_KEY and KITE_API_SECRET on the server.",
      });
    } else {
      setKiteRedirectMsg({ type: "err", text });
    }
    router.replace(window.location.pathname);
  }, [router]);

  useEffect(() => {
    if (kiteRedirectMsg?.type === "ok") void loadProfile();
  }, [kiteRedirectMsg?.type, loadProfile]);

  const logout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await postKiteLogout();
      setProfile({ connected: false });
    } finally {
      setIsLoggingOut(false);
    }
  }, []);

  const dismissKiteMsg = useCallback(() => setKiteRedirectMsg(null), []);

  const value = useMemo(
    () => ({
      profile,
      isLoggingOut,
      loadProfile,
      logout,
      kiteRedirectMsg,
      dismissKiteMsg,
    }),
    [
      profile,
      isLoggingOut,
      loadProfile,
      logout,
      kiteRedirectMsg,
      dismissKiteMsg,
    ],
  );

  return (
    <KiteSessionContext.Provider value={value}>{children}</KiteSessionContext.Provider>
  );
}

export function useKiteSession(): KiteSessionContextValue {
  const ctx = useContext(KiteSessionContext);
  if (!ctx) {
    throw new Error("useKiteSession must be used within KiteSessionProvider");
  }
  return ctx;
}
