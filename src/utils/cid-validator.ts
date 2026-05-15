export function validateCID(cid: string): boolean {
  const trimmed = cid.trim();
  const v0Regex = /^Qm[a-zA-Z0-9]{44}$/;
  const v1Regex = /^[a-zA-Z0-9]{59,}$/;
  return v0Regex.test(trimmed) || v1Regex.test(trimmed);
}
