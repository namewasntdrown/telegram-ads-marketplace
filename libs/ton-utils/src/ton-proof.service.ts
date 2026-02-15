import { Address, Cell, contractAddress } from '@ton/ton';
import { sha256 } from '@ton/crypto';
import nacl from 'tweetnacl';

const TON_PROOF_PREFIX = 'ton-proof-item-v2/';
const TON_CONNECT_PREFIX = 'ton-connect';

export interface TonProofPayload {
  address: string;
  proof: {
    timestamp: number;
    domain: {
      lengthBytes: number;
      value: string;
    };
    signature: string;
    payload: string;
    stateInit: string;
  };
}

export interface TonProofVerifyOptions {
  /** Allowed domain for proof validation */
  allowedDomain: string;
  /** Max age of proof in seconds (default: 300 = 5 minutes) */
  maxAgeSeconds?: number;
}

interface ParsedStateInit {
  code: Cell | null;
  data: Cell | null;
}

/**
 * Verifies a TON Connect proof of wallet ownership.
 *
 * Verification steps:
 * 1. Check timestamp freshness
 * 2. Validate domain
 * 3. Parse wallet address
 * 4. Extract public key from stateInit
 * 5. Verify stateInit matches the claimed address
 * 6. Construct the signed message
 * 7. Verify the signature with nacl
 */
export async function verifyTonProof(
  payload: TonProofPayload,
  options: TonProofVerifyOptions,
): Promise<{ valid: boolean; address?: string; error?: string }> {
  const { proof, address: rawAddress } = payload;
  const maxAge = options.maxAgeSeconds ?? 300;

  // 1. Check timestamp freshness
  const now = Math.floor(Date.now() / 1000);
  if (now - proof.timestamp > maxAge) {
    return { valid: false, error: 'Proof expired' };
  }
  if (proof.timestamp > now + 60) {
    return { valid: false, error: 'Proof timestamp is in the future' };
  }

  // 2. Validate domain
  const proofDomain = proof.domain.value;
  const domainParts = options.allowedDomain
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
    .split(':');
  const allowedDomain = domainParts[0] ?? '';

  if (proofDomain !== allowedDomain) {
    return { valid: false, error: `Domain mismatch: ${proofDomain} !== ${allowedDomain}` };
  }

  // 3. Parse wallet address
  let address: Address;
  try {
    address = Address.parse(rawAddress);
  } catch {
    return { valid: false, error: 'Invalid wallet address' };
  }

  // 4. Extract public key from stateInit
  let publicKey: Buffer;
  try {
    const stateInitBoc = Buffer.from(proof.stateInit, 'base64');
    const stateInitCell = Cell.fromBoc(stateInitBoc)[0];
    if (!stateInitCell) {
      return { valid: false, error: 'Invalid stateInit BOC' };
    }
    const stateInit = loadStateInit(stateInitCell.beginParse());
    publicKey = extractPublicKey(stateInit);

    // 5. Verify stateInit matches the claimed address
    if (!stateInit.code || !stateInit.data) {
      return { valid: false, error: 'StateInit missing code or data' };
    }
    const computedAddress = contractAddress(address.workChain, {
      code: stateInit.code,
      data: stateInit.data,
    });
    if (!computedAddress.equals(address)) {
      return { valid: false, error: 'StateInit does not match address' };
    }
  } catch (e) {
    return {
      valid: false,
      error: `Failed to extract public key: ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }

  // 6. Construct the signed message
  const domainBuffer = Buffer.from(proofDomain, 'utf-8');
  const domainLengthBuf = Buffer.alloc(4);
  domainLengthBuf.writeUInt32LE(domainBuffer.length, 0);

  const timestampBuf = Buffer.alloc(8);
  timestampBuf.writeBigUInt64LE(BigInt(proof.timestamp), 0);

  // Address: workchain(4 bytes BE) + hash(32 bytes)
  const workchainBuf = Buffer.alloc(4);
  workchainBuf.writeInt32BE(address.workChain, 0);
  const addressHashBuf = Buffer.from(address.hash);

  const payloadBuf = Buffer.from(proof.payload, 'utf-8');

  // Message = "ton-proof-item-v2/" + address_wc + address_hash + domain_len + domain + timestamp + payload
  const message = Buffer.concat([
    Buffer.from(TON_PROOF_PREFIX, 'utf-8'),
    workchainBuf,
    addressHashBuf,
    domainLengthBuf,
    domainBuffer,
    timestampBuf,
    payloadBuf,
  ]);

  const messageHash = await sha256(message);

  // Full message for signing: sha256(0xffff + "ton-connect" + sha256(message))
  const fullMessage = Buffer.concat([
    Buffer.from([0xff, 0xff]),
    Buffer.from(TON_CONNECT_PREFIX, 'utf-8'),
    Buffer.from(messageHash),
  ]);

  const fullMessageHash = await sha256(fullMessage);

  // 7. Verify signature
  const signature = Buffer.from(proof.signature, 'base64');
  const isValid = nacl.sign.detached.verify(
    new Uint8Array(fullMessageHash),
    new Uint8Array(signature),
    new Uint8Array(publicKey),
  );

  if (!isValid) {
    return { valid: false, error: 'Invalid signature' };
  }

  // Return normalized non-bounceable address
  const normalizedAddress = address.toString({ bounceable: false, testOnly: false });
  return { valid: true, address: normalizedAddress };
}

/**
 * Load StateInit from a Slice.
 * StateInit TLB:
 * _ split_depth:(Maybe (## 5)) special:(Maybe TickTock) code:(Maybe ^Cell) data:(Maybe ^Cell) library:(HashmapE 256 SimpleLib)
 */
function loadStateInit(slice: ReturnType<Cell['beginParse']>): ParsedStateInit {
  const hasSplitDepth = slice.loadBit();
  if (hasSplitDepth) {
    slice.loadUint(5);
  }

  const hasSpecial = slice.loadBit();
  if (hasSpecial) {
    slice.loadUint(2); // TickTock
  }

  const hasCode = slice.loadBit();
  const code = hasCode ? slice.loadRef() : null;

  const hasData = slice.loadBit();
  const data = hasData ? slice.loadRef() : null;

  // Skip library
  slice.loadBit();

  return { code, data };
}

/**
 * Extract public key from StateInit data cell.
 * Supports wallet v3/v4 (seqno + subwallet + pubkey) and v1/v2 (seqno + pubkey).
 */
function extractPublicKey(stateInit: ParsedStateInit): Buffer {
  if (!stateInit.data) {
    throw new Error('No data cell in stateInit');
  }

  // Try wallet v4/v3r2 format: seqno(32) + subwallet_id(32) + pubkey(256)
  try {
    const dataSlice = stateInit.data.beginParse();
    dataSlice.loadUint(32); // seqno
    dataSlice.loadUint(32); // subwallet_id
    const pubkey = dataSlice.loadBuffer(32);
    return pubkey;
  } catch {
    // Not v3/v4 format
  }

  // Try wallet v1/v2 format: seqno(32) + pubkey(256)
  try {
    const dataSlice2 = stateInit.data.beginParse();
    dataSlice2.loadUint(32); // seqno
    const pubkey = dataSlice2.loadBuffer(32);
    return pubkey;
  } catch {
    // Not v1/v2 format
  }

  // Try high-load wallet v2: subwallet_id(32) + last_cleaned(64) + pubkey(256) + ...
  try {
    const dataSlice3 = stateInit.data.beginParse();
    dataSlice3.loadUint(32); // subwallet_id
    dataSlice3.loadUint(64); // last_cleaned
    const pubkey = dataSlice3.loadBuffer(32);
    return pubkey;
  } catch {
    // Not high-load v2
  }

  throw new Error('Unable to extract public key from stateInit - unsupported wallet type');
}

/**
 * Generate a TON proof payload string.
 * Format: "appname-{timestamp}-{random}"
 */
export function generateTonProofPayload(appName = 'tam'): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const random = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('');
  return `${appName}-${timestamp}-${random}`;
}
