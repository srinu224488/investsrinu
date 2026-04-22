import { useKiteSession } from "./KiteSessionProvider";

export function KiteConnectSection() {
  const { profile } = useKiteSession();

  if (profile === null) {
    return (
      <section
        id="kite"
        className="scroll-mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Kite Connect
        </h2>
        <p className="mt-3 text-sm text-zinc-500">Checking session…</p>
      </section>
    );
  }

  if (profile.connected && profile.profile) {
    return <div id="kite" className="scroll-mt-6" aria-hidden="true" />;
  } 

  return null;
}
