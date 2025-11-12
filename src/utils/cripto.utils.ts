// src/utils/cripto.utils.ts
import * as secp from "@noble/secp256k1";
import { gcm } from "@noble/ciphers/aes.js";
import { randomBytes } from "@noble/ciphers/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { toBytes, hexToBytes, bytesToHex, concat, Hex } from "viem";
import { Base64 } from 'js-base64';

async function encryptECIES(plaintext: string, recipientPublicKeyHex: Hex): Promise<string> {
    console.log("plaintext", plaintext);
    console.log("recipientPublicKeyHex", recipientPublicKeyHex);
    
    // Garantir que a chave pública do destinatário esteja no formato NÃO COMPRIMIDO (0x04...)
    // A função secp.getSharedSecret espera a chave pública do receptor como NÃO COMPRIMIDA (65 bytes + 0x)
    // Se 'recipientPublicKeyHex' vier do contrato, ela DEVE ser não comprimida (0x04...)
    const recipientPublicKeyBytes = hexToBytes(recipientPublicKeyHex);
    if (recipientPublicKeyBytes.length !== 65) {
        console.warn("Chave pública do destinatário não parece estar no formato NÃO comprimido (65 bytes). Verifique sua origem.");
        // Em um ambiente de produção, você pode querer lançar um erro ou tentar normalizar.
        // Por enquanto, seguimos com ela, assumindo que foi registrada corretamente como 0x04...
    }


    // 1. Gerar uma chave efêmera para o remetente
    const ephemeralPrivateKey = randomBytes(32); // Use randomBytes do @noble/ciphers/utils
    // A chave pública efêmera também deve ser NÃO COMPRIMIDA para gerar o Shared Secret com a chave privada do receptor.
    // E também é mais fácil de lidar na concatenação se ambas as chaves públicas (receptor e efêmera)
    // tiverem o mesmo formato (não comprimido) ao derivar o shared secret.
    const ephemeralPublicKey = secp.getPublicKey(ephemeralPrivateKey, false); // false = NÃO COMPRIMIDA (0x04...) - 65 bytes

    // Geração do Shared Secret
    // ephemeralPrivateKey (32 bytes) + recipientPublicKeyBytes (65 bytes, NÃO COMPRIMIDA) -> sharedSecret (32 bytes)
    const sharedSecret = secp.getSharedSecret(ephemeralPrivateKey, recipientPublicKeyBytes, false); // false para NÃO COMPRIMIDA no final

    // KDF: SHA256 do shared secret para chave AES
    const aesKey = sha256(sharedSecret); 
    
    // 3. Gerar IV (Nonce) de 12 bytes para GCM
    const iv = randomBytes(12); // GCM usualmente usa 12 bytes para IV
    const plaintextBytes = new TextEncoder().encode(plaintext);

    console.log("--- ENCRYPT ECIES DEBUG ---");
    console.log("Plaintext:", plaintext);
    console.log("Recipient Public Key (Input, Hex):", recipientPublicKeyHex);
    console.log("Recipient Public Key Length:", recipientPublicKeyBytes.length, "bytes");
    console.log("Ephemeral Private Key (Generated, Hex):", bytesToHex(ephemeralPrivateKey)); 
    console.log("Ephemeral Public Key (Generated, Hex):", bytesToHex(ephemeralPublicKey));
    console.log("Ephemeral Public Key Length:", ephemeralPublicKey.length, "bytes");
    console.log("Shared Secret (Derived, Hex):", bytesToHex(sharedSecret));
    console.log("AES Key (Derived, Hex):", bytesToHex(aesKey));
    console.log("IV (Generated, Hex):", bytesToHex(iv));
    console.log("---------------------------");

    // Criptografa usando @noble/ciphers. 
    // O resultado 'encryptedResult' conterá o ciphertext CONCATENADO com o authentication tag.
    const aes = gcm(aesKey, iv);
    const encryptedResult = aes.encrypt(plaintextBytes); // Este Uint8Array já contém ciphertext + tag

    // 4. Concatenar: PublicKeyEfêmera (NÃO comprimida - 65 bytes) + IV (12 bytes) + EncryptedResult (Ciphertext + Tag)
    // Tamanho total do payload = 65 (PK Efêmera) + 12 (IV) + X (Ciphertext + Tag)
    const finalPayload = concat([
        ephemeralPublicKey, // 65 bytes (NÃO comprimida)
        iv,                 // 12 bytes
        encryptedResult     // Contém o ciphertext e o tag JUNTOS
    ]);

    const base64Payload = Base64.fromUint8Array(finalPayload);
    return base64Payload;
}

async function decryptECIES(encryptedDataBase64: string, privateKey: Hex): Promise<string> { // Recebe string (Base64)
    // Decodificar a string Base64 de volta para bytes
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

    console.log("--- DECRYPT ECIES DEBUG ---");
    console.log("Input encryptedData (Base64):", encryptedDataBase64);
    console.log("Private Key (Input, Hex):", privateKey); 
    console.log("Extracted Ephemeral Public Key (Hex):", bytesToHex(ephemeralPublicKey));
    console.log("Ephemeral Public Key Length:", ephemeralPublicKey.length, "bytes");
    console.log("Extracted IV (Hex):", bytesToHex(iv));
    console.log("Derived Shared Secret (Hex):", bytesToHex(sharedSecret)); 
    console.log("Derived AES Key (Hex):", bytesToHex(aesKey)); 
    console.log("Full Encrypted Content Length (ciphertext + tag):", fullEncryptedContent.length);
    console.log("---------------------------");

    let decryptedBytes: Uint8Array;
    try {
        const aes = gcm(aesKey, iv);
        decryptedBytes = aes.decrypt(fullEncryptedContent); 
    } catch (e: any) {
        console.error("Erro durante descriptografia AES-GCM:", e);
        throw new Error(`Falha na descriptografia AES-GCM: ${e.message || 'Tag inválido ou dados corrompidos'}`);
    }
    
    return new TextDecoder().decode(decryptedBytes);
}

export { encryptECIES, decryptECIES };