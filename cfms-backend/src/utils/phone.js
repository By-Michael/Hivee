// Turns a raw phone number (any format: spaces, dashes, +country code...)
// into the indexed lookup key stored in Resident.phoneSearchKey — the last
// 9 digits, digits-only. 9 covers a typical national significant number
// without the country code, so "+251 91 123 4567" and "0911234567" both
// normalize to the same key.
//
// Returns null when there aren't enough digits to be a real phone number
// (avoids short/junk input colliding with real numbers on the shared key).
function phoneSearchKeyFor(rawPhone) {
  if (!rawPhone) return null;
  const digits = String(rawPhone).replace(/[^\d]/g, '');
  if (digits.length < 7) return null;
  return digits.slice(-9);
}

module.exports = { phoneSearchKeyFor };
