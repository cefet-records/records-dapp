
import { Hex, hexToBytes } from "viem";
import { encrypt, decrypt as eciesDecryptEth } from "eth-ecies";
import { Buffer } from "buffer";
import { toBuffer } from "ethereumjs-util";

async function encryptAESGCM(plaintext: string, keyBytes: Uint8Array): Promise<Hex> {
    const data = new TextEncoder().encode(plaintext);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const keyBuffer = new Uint8Array(keyBytes);

    const key = await crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, ["encrypt"]);
    const buffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);

    const ciphertext = new Uint8Array(buffer);
    const fullEncryptedData = new Uint8Array(iv.length + ciphertext.length);

    fullEncryptedData.set(iv, 0);
    fullEncryptedData.set(ciphertext, iv.length);
    return `0x${Buffer.from(fullEncryptedData).toString("hex")}` as Hex;
}

async function encryptECIES(keyBytes: Uint8Array, recipientPublicKey: Hex): Promise<Hex> {
    let cleanPublicKey = recipientPublicKey.startsWith("0x") ? recipientPublicKey.slice(2) : recipientPublicKey;
    if (cleanPublicKey.length === 130 && cleanPublicKey.startsWith("04")) { 
        cleanPublicKey = cleanPublicKey.slice(2); 
    }
    if (cleanPublicKey.length !== 128) {
        console.error("ERRO: Chave pública final tem tamanho incorreto. Tamanho:", cleanPublicKey.length);
        console.error("O ECIES requer 128 caracteres (64 bytes) de X e Y.");
        throw new Error("Invalid public key format for ECIES (expected 64 bytes / 128 hex chars).");
    }
    const pkBuffer = Buffer.from(cleanPublicKey, "hex");
    const data = Buffer.from(keyBytes);
    const encryptedBuffer = encrypt(pkBuffer, data); 
    return `0x${encryptedBuffer.toString("hex")}` as Hex;
}

async function decryptAESGCM(encryptedHex: Hex, keyBytes: Uint8Array): Promise<string> {
    const fullEncryptedData = hexToBytes(encryptedHex);    
    const iv = fullEncryptedData.slice(0, 12);
    const ciphertext = fullEncryptedData.slice(12);
    
    const keyBuffer = new Uint8Array(keyBytes);
    const key = await crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, ["decrypt"]);
    const decryptedBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decryptedBuffer);
}

async function decryptECIES(encryptedHex: Hex, privateKey: Hex): Promise<Uint8Array> {
    const privateKeyBuffer = toBuffer(privateKey);
    const encryptedBuffer = Buffer.from(hexToBytes(encryptedHex));
    const decryptedBuffer = eciesDecryptEth(privateKeyBuffer, encryptedBuffer);
    return new Uint8Array(decryptedBuffer);
}

export { encryptAESGCM, encryptECIES, decryptAESGCM, decryptECIES };