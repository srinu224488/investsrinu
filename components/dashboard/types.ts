export type ProfilePayload = {
  user_name?: string;
  user_id?: string;
  email?: string;
  broker?: string;
};

export type OrderRow = Record<string, unknown>;

export type WebhookRow = {
  id: string;
  receivedAt: string;
  body: unknown;
};

export type ProfileState = {
  connected: boolean;
  profile?: ProfilePayload;
  error?: string;
} | null;

export type KiteRedirectMsg = {
  type: "ok" | "err";
  text: string;
};
