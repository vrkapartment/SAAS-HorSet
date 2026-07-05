const ENCRYPTION_KEY = "horset-liff-symmetric-key-2026"
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "")
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function bytesToUuid(bytes: Uint8Array): string {
  let hex = ""
  for (let i = 0; i < 16; i++) {
    let h = bytes[i].toString(16)
    if (h.length < 2) h = "0" + h
    hex += h
  }
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32)
  ].join("-")
}

function rc4(key: string, input: Uint8Array): Uint8Array {
  const s = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    s[i] = i
  }
  let j = 0
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key.charCodeAt(i % key.length)) % 256
    const temp = s[i]
    s[i] = s[j]
    s[j] = temp
  }
  let i = 0
  j = 0
  const output = new Uint8Array(input.length)
  for (let k = 0; k < input.length; k++) {
    i = (i + 1) % 256
    j = (j + s[i]) % 256
    const temp = s[i]
    s[i] = s[j]
    s[j] = temp
    const t = (s[i] + s[j]) % 256
    output[k] = input[k] ^ s[t]
  }
  return output
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)
  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
}

function base64UrlDecode(base64url: string): Uint8Array {
  let base64 = base64url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
  while (base64.length % 4) {
    base64 += "="
  }
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Packs workspaceId and roomId (UUIDs) into a highly compacted, encrypted URL-safe Base64 token.
 * Output length is exactly 43 characters!
 */
export function packWorkspaceAndRoom(workspaceId: string, roomId: string): string {
  try {
    if (!uuidRegex.test(workspaceId) || !uuidRegex.test(roomId)) {
      return ""
    }
    const wsBytes = uuidToBytes(workspaceId)
    const roomBytes = uuidToBytes(roomId)
    const combined = new Uint8Array(32)
    combined.set(wsBytes, 0)
    combined.set(roomBytes, 16)
    
    const encrypted = rc4(ENCRYPTION_KEY, combined)
    return base64UrlEncode(encrypted)
  } catch (e) {
    console.error("Failed to pack workspace and room ID:", e)
    return ""
  }
}

/**
 * Unpacks the encrypted 43-character token back into workspaceId and roomId.
 */
export function unpackWorkspaceAndRoom(packed: string): { workspaceId: string, roomId: string } | null {
  try {
    if (!packed) return null
    const encrypted = base64UrlDecode(packed)
    if (encrypted.length !== 32) return null
    
    const decrypted = rc4(ENCRYPTION_KEY, encrypted)
    const wsBytes = decrypted.slice(0, 16)
    const roomBytes = decrypted.slice(16, 32)
    
    const workspaceId = bytesToUuid(wsBytes)
    const roomId = bytesToUuid(roomBytes)
    
    if (!uuidRegex.test(workspaceId) || !uuidRegex.test(roomId)) {
      return null
    }
    
    return { workspaceId, roomId }
  } catch (e) {
    console.error("Failed to unpack workspace and room ID:", e)
    return null
  }
}
