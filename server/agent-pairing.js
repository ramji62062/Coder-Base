const crypto = require("crypto");
const { validateTerminalAccess } = require("./terminal-auth");

const PAIRING_TTL_MS = Number(process.env.AGENT_PAIRING_TTL_MS || 5 * 60 * 1000);
const pairings = new Map();

function now() {
  return Date.now();
}

function cleanupExpiredPairings() {
  const cutoff = now();
  for (const [token, pairing] of pairings.entries()) {
    if (pairing.expiresAt <= cutoff || pairing.revoked) {
      pairings.delete(token);
    }
  }
}

async function createPairing({ authToken, roomId, userId }) {
  cleanupExpiredPairings();
  const auth = await validateTerminalAccess(authToken, roomId, userId);
  if (!auth.ok) return auth;

  const token = `ct_pair_${crypto.randomBytes(24).toString("base64url")}`;
  const expiresAt = now() + PAIRING_TTL_MS;
  pairings.set(token, {
    roomId: auth.roomId,
    userId: auth.userId,
    createdAt: now(),
    expiresAt,
    revoked: false,
  });

  return {
    ok: true,
    token,
    roomId: auth.roomId,
    userId: auth.userId,
    expiresAt,
    ttlMs: PAIRING_TTL_MS,
  };
}

function consumePairing(token, roomId) {
  cleanupExpiredPairings();
  const pairing = pairings.get(String(token || ""));
  if (!pairing) return { ok: false, error: "Invalid or expired local-agent pairing token." };
  if (pairing.revoked) return { ok: false, error: "Local-agent pairing token was revoked." };
  if (roomId && pairing.roomId !== roomId) return { ok: false, error: "Pairing token does not match this room." };
  return { ok: true, ...pairing };
}

function revokePairing(token) {
  const pairing = pairings.get(String(token || ""));
  if (pairing) pairing.revoked = true;
}

module.exports = {
  createPairing,
  consumePairing,
  revokePairing,
  cleanupExpiredPairings,
  PAIRING_TTL_MS,
};
