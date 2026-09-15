/** SHA-256 of the site password. Regenerate with: echo -n 'haslo' | shasum -a 256 */
const PASSWORD_SHA256 =
  "d48fff5413d963aa76f41e27639788329a28b61a139466e45d64c5dc0c852032";

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
