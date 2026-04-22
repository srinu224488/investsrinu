import type { KiteRedirectMsg } from "./types";

type Props = {
  kiteRedirectMsg: KiteRedirectMsg | null;
  onDismissKiteMsg: () => void;
};

export function DashboardHeader({ kiteRedirectMsg, onDismissKiteMsg }: Props) {
  if (!kiteRedirectMsg) return null;

  return (
    <div
      className={`rounded-lg px-4 py-3 text-sm ${
        kiteRedirectMsg.type === "ok"
          ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
          : "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200"
      }`}
      role="status"
    >
      {kiteRedirectMsg.text}
      <button
        type="button"
        onClick={onDismissKiteMsg}
        className="ml-3 underline opacity-80 hover:opacity-100"
      >
        Dismiss
      </button>
    </div>
  );
}
