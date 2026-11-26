export type Companion = {
  ai_id: string;
  name: string;
  appearance: string;
  created_at: string;
  updated_at: string;
};
export type Account = {
  id: string;
  email: string | null;
  profile: { username: string } | null;
  wallets: { address: string }[];
};
export type ModelAction =
  | "observe"
  | "verify"
  | "learn"
  | "propose"
  | "execute"
  | "stop";
export interface JudgmentRequest {
  requestId: string;
  aiId: string;
  stateVersion: string;
  experienceRefs: string[];
  permissionRefs: string[];
  budgetCap: number;
}
export interface JudgmentResponse {
  requestId: string;
  stateVersion: string;
  action: ModelAction;
  evidenceRefs: string[];
  reason: string;
  requiresConfirmation: boolean;
}
export interface WalletAdapter {
  create(): Promise<void>;
  recover(): Promise<void>;
  getAddresses(): Promise<string[]>;
}
export interface ModelAdapter {
  judge(
    input: JudgmentRequest,
    signal?: AbortSignal,
  ): Promise<JudgmentResponse>;
}

/** Server-authoritative contract. No confidence, quote or paid status is trusted from a client. */
export interface JudgmentOffer {
  judgmentId: string;
  judgmentVersion: string;
  tier: 'ordinary' | 'verified';
  summary: string;
  evidenceRefs: string[];
  verification: {
    status: 'pending' | 'correct' | 'wrong' | 'unverifiable' | 'disputed';
    policyId: string;
    resultRef?: string;
    observeBy?: string;
  };
  calibration?: { domain: string; modelVersion: string; sampleSize: number; evaluatedAt: string; reportRef: string };
  quote?: { id: string; amountMinor: number; currency: 'QB' | 'AIUSD'; expiresAt: string };
}
export interface JudgmentPaymentOrder {
  id: string;
  judgmentId: string;
  judgmentVersion: string;
  quoteId: string;
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'refund_pending' | 'refunded';
  amountMinor: number;
  currency: 'QB' | 'AIUSD';
  receiptRef?: string;
}
export interface JudgmentPaymentAdapter {
  getOffer(judgmentId: string, signal?: AbortSignal): Promise<JudgmentOffer>;
  /** Recheck ownership, version, verification and expiry; enforce idempotency server-side. */
  createOrder(input: { judgmentId: string; judgmentVersion: string; quoteId: string; idempotencyKey: string; consentVersion: string }, signal?: AbortSignal): Promise<JudgmentPaymentOrder>;
  getOrder(orderId: string, signal?: AbortSignal): Promise<JudgmentPaymentOrder>;
  dispute(input: { orderId: string; reason: string; evidenceRefs: string[]; idempotencyKey: string }, signal?: AbortSignal): Promise<{ disputeId: string; status: 'pending' }>;
}
