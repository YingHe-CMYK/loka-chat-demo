const KEY = "loka-review-identity";
export function readIdentity(storage) {
  try {
    const v = JSON.parse(storage.getItem(KEY) || "null");
    return v && typeof v.personalId === "string" && typeof v.aiId === "string"
      ? v
      : null;
  } catch {
    return null;
  }
}
export function establishIdentity(
  storage,
  { email, username },
  uuid = () => crypto.randomUUID(),
  now = () => new Date().toISOString(),
) {
  const existing = readIdentity(storage);
  const normalized = email.trim().toLowerCase();
  if (existing && existing.email !== normalized)
    throw new Error("This preview belongs to another email. Continue with the original email.");
  const identity = existing
    ? { ...existing, username: username.trim() }
    : {
        personalId: `demo_person_${uuid()}`,
        aiId: `demo_ai_${uuid()}`,
        email: normalized,
        username: username.trim(),
        bornAt: now(),
      };
  storage.setItem(KEY, JSON.stringify(identity));
  return identity;
}
