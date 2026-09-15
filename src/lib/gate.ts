/** SHA-256 of the site password. Regenerate with: echo -n 'haslo' | shasum -a 256 */
const PASSWORD_SHA256 =
  "d48fff5413d963aa76f41e27639788329a28b61a139466e45d64c5dc0c852032";

const REMEMBER_KEY = "plan-zajec-remember-unlock";
const REMEMBER_DAYS = 30;
const REMEMBER_MS = REMEMBER_DAYS * 24 * 60 * 60 * 1000;

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function passwordMatches(input: string) {
  const hash = await sha256Hex(input.trim());
  return hash === PASSWORD_SHA256;
}

export function rememberUnlock() {
  try {
    localStorage.setItem(
      REMEMBER_KEY,
      JSON.stringify({
        hash: PASSWORD_SHA256,
        expiresAt: Date.now() + REMEMBER_MS,
      }),
    );
  } catch {
    // Private mode or blocked storage — just skip remembering.
  }
}

export function forgetUnlock() {
  try {
    localStorage.removeItem(REMEMBER_KEY);
  } catch {
    // Ignore.
  }
}

export function hasRememberedUnlock() {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return false;

    const parsed = JSON.parse(raw) as { hash?: string; expiresAt?: number };
    if (
      parsed.hash !== PASSWORD_SHA256 ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now()
    ) {
      forgetUnlock();
      return false;
    }

    return true;
  } catch {
    forgetUnlock();
    return false;
  }
}
