// A browser capability is independent of email. Only its SHA-256 digest is stored.
export async function cartOwner(
  req: Request,
  userId: string | null,
): Promise<string | null> {
  if (userId) return "u:" + userId;
  const key = req.headers.get("x-wf-cart-key") || "";
  if (!/^[a-f0-9]{64}$/.test(key)) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return "g:" +
    Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, "0"))
      .join("");
}
export async function jobAllowed(
  req: Request,
  secret: string | undefined,
): Promise<boolean> {
  if (req.method !== "POST" || !secret || secret.length < 32) return false;
  const got = req.headers.get("x-wf-job-token") || "";
  // Compare fixed-length digests; don't accept public apikeys or unverified JWT claims.
  const hash = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    );
  const [a, b] = await Promise.all([hash(got), hash(secret)]);
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}
