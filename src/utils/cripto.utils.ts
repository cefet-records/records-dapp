import * as secp from "@noble/secp256k1";
import { gcm } from "@noble/ciphers/aes.js";
import { randomBytes } from "@noble/ciphers/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes, concat, Hex } from "viem";
import { Base64 } from 'js-base64';

async function encryptECIES(
  plaintext: string,
  recipientPublicKeyHex: Hex
): Promise<string> {
  const recipientPublicKeyBytes = hexToBytes(recipientPublicKeyHex);
  if (recipientPublicKeyBytes.length !== 65) {
    console.warn(
      `Chave pública do destinatário não parece estar 
            no formato NÃO comprimido (65 bytes). Verifique sua origem.`
    );
  }
  const ephemeralPrivateKey = randomBytes(32);
  const ephemeralPublicKey = secp.getPublicKey(ephemeralPrivateKey, false);
  const sharedSecret = secp.getSharedSecret(
    ephemeralPrivateKey,
    recipientPublicKeyBytes, false
  );
  const aesKey = sha256(sharedSecret);
  const iv = randomBytes(12);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const aes = gcm(aesKey, iv);
  const encryptedResult = aes.encrypt(plaintextBytes);
  const finalPayload = concat([ephemeralPublicKey, iv, encryptedResult]);
  const base64Payload = Base64.fromUint8Array(finalPayload);
  return base64Payload;
}

async function decryptECIES(
  encryptedDataBase64: string,
  privateKey: Hex
): Promise<string> {
  const payloadBytes = Base64.toUint8Array(encryptedDataBase64);
  const ephemeralPublicKey = payloadBytes.slice(0, 65);
  const iv = payloadBytes.slice(65, 77);
  const fullEncryptedContent = payloadBytes.slice(77);
  const recipientPrivateKeyBytes = hexToBytes(privateKey);
  const sharedSecret = secp.getSharedSecret(
    recipientPrivateKeyBytes,
    ephemeralPublicKey,
    false
  );
  const aesKey = sha256(sharedSecret);
  let decryptedBytes: Uint8Array;
  try {
    const aes = gcm(aesKey, iv);
    decryptedBytes = aes.decrypt(fullEncryptedContent);
  } catch (e: any) {
    console.error("Erro durante descriptografia AES-GCM:", e);
    throw new Error(`Falha na descriptografia AES-GCM: ${e.message}`);
  }
  return new TextDecoder().decode(decryptedBytes);
}

export { encryptECIES, decryptECIES };