// src/app/api/dynamic-webhook/route.ts

import { NextResponse } from 'next/server';
import { Buffer } from 'buffer';
import * as crypto from 'crypto'; 

// --- VARIÁVEIS DE AMBIENTE ---
const WEBHOOK_SECRET = process.env.DYNAMIC_WEBHOOK_SECRET!; 
const DEVELOPER_RSA_PRIVATE_KEY = process.env.DEVELOPER_RSA_PRIVATE_KEY!;

// Cache da chave privada para evitar leituras repetidas do disco
let cachedDeveloperRSAPrivateKey: string | null = null;

// Função para ler e cachear a chave privada
function getDeveloperRSAPrivateKey(): string {
    if (cachedDeveloperRSAPrivateKey) {
        return cachedDeveloperRSAPrivateKey;
    }
    if (!DEVELOPER_RSA_PRIVATE_KEY) {
        throw new Error("DEVELOPER_RSA_PRIVATE_KEY não configurado no .env");
    }
    cachedDeveloperRSAPrivateKey = DEVELOPER_RSA_PRIVATE_KEY;
    return cachedDeveloperRSAPrivateKey;
}

// Implementação REAL da descriptografia RSA e AES (abordagem híbrida)
async function decryptDelegatedMaterial(encryptedPayload: any): Promise<string> {
    try {
        const developerPrivateKeyPem = getDeveloperRSAPrivateKey();

        // 1. Descriptografar a chave AES com a sua chave privada RSA
        const encryptedAesKeyBase64 = encryptedPayload.ek; 
        const encryptedAesKey = Buffer.from(encryptedAesKeyBase64, 'base64');

        const aesKey = crypto.privateDecrypt(
            {
                key: developerPrivateKeyPem,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256', 
            },
            encryptedAesKey
        );

        // 2. Descriptografar o Ciphertext (dados reais) com a chave AES descriptografada
        const cipherTextBase64 = encryptedPayload.ct;
        const ivBase64 = encryptedPayload.iv;
        const tagBase64 = encryptedPayload.tag;

        const cipherText = Buffer.from(cipherTextBase64, 'base64');
        const iv = Buffer.from(ivBase64, 'base64');
        const tag = Buffer.from(tagBase64, 'base64');

        // Cria o descifrador AES-256-GCM
        const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
        decipher.setAuthTag(tag); 

        // === CORREÇÃO AQUI ===
        // Quando o 'data' é um Buffer, o segundo argumento (inputEncoding) pode ser omitido
        // ou definido como 'undefined'. O outputEncoding é 'utf8' para obter a string final.
        let decrypted = decipher.update(cipherText, undefined, 'utf8');
        decrypted += decipher.final('utf8'); 

        return decrypted;

    } catch (error) {
        console.error("Erro detalhado na descriptografia RSA/AES:", error);
        throw new Error(`Falha na descriptografia do material delegado: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// --- API ROUTE HANDLER ---
export async function POST(request: Request) {
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody);
    
    // 1. VERIFICAÇÃO DE ASSINATURA (CRÍTICO EM PRODUÇÃO!)
    const signature = request.headers.get('dynamic-signature');
    // ... Implementação da verificação de assinatura aqui ...

    if (payload.eventName === 'wallet.delegation.created') {
        try {
            const { encryptedDelegatedShare, encryptedWalletApiKey, walletId, userId } = payload.data;
            
            // 2. DESCRIPTOGRAFAR A CHAVE DELEGEDA (DELEGATED SHARE)
            const delegatedShare = await decryptDelegatedMaterial(encryptedDelegatedShare);

            // 3. DESCRIPTOGRAFAR A API KEY
            const walletApiKey = await decryptDelegatedMaterial(encryptedWalletApiKey);

            // 4. ARMAZENAMENTO SEGURO
            console.log(`[DELEGATION SUCCESS] Wallet: ${walletId} | User: ${userId}`);
            console.log(`[DECRYPTED SHARE] ${delegatedShare}`); 
            console.log(`[DECRYPTED API KEY] ${walletApiKey}`); 
            
            return NextResponse.json({ success: true, message: 'Delegation materials received and processed' });

        } catch (error) {
            console.error('Erro ao processar a chave delegada:', error);
            return NextResponse.json({ success: false, error: 'Failed to process key material' }, { status: 500 });
        }
    }

    if (payload.eventName === 'wallet.delegation.revoked') {
        console.log(`[DELEGATION REVOKED] Wallet: ${payload.data.walletId}`);
        return NextResponse.json({ success: true, message: 'Delegation revoked successfully' });
    }

    return NextResponse.json({ success: true, message: 'Event received' });
}