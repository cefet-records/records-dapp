'use client'; 

import { JSX, useEffect, useState } from "react";
import { type BaseError, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Address, stringToHex, numberToHex, Log, parseEventLogs, toBytes, Hex, keccak256, recoverPublicKey } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
// import { getWalletClient } from "wagmi/actions";
import { encrypt } from 'eth-ecies';

const MOCK_BATCH_DATA = [
    {
        studentAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address,
        studentPublicKey: '0x0487d1ff0c1c8f1e5f30e7c5b1b4a9a0f8b1b4a9a0f8b1b4a9a0f8b1b4a9a0f8b1b4a9a0f8b1b4a9a0f8b1b4a9a0f8b1' as Hex, 
        plaintextData: {
            selfEncryptedInformation: "encrypted_data_1",
            institutionEncryptedInformation: "enc_inst_data_1",
            grades: [
                { disciplineCode: "BCC101", semester: 1, year: 2024, grade: 9.0, attendance: 95, status: "Aprovado" },
                { disciplineCode: "BCC102", semester: 2, year: 2024, grade: 8.5, attendance: 90, status: "Aprovado" }
            ],
        },
    },
];

interface CryptographicResult {
    recordId: Hex;
    encryptedData: Hex;
    encryptedKeyIssuer: Hex; 
    encryptedKeyStudent: Hex;
    issuerSignature: Hex; 
    studentAddress: Address;
}

async function encryptAESGCM(plaintext: string, keyBytes: Uint8Array): Promise<Hex> {
    const data = new TextEncoder().encode(plaintext);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const keyBuffer = new Uint8Array(keyBytes);
    const key = await crypto.subtle.importKey('raw', keyBuffer, { name: 'AES-GCM' }, false, ['encrypt']);
    const buffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    const ciphertext = new Uint8Array(buffer);
    const fullEncryptedData = new Uint8Array(iv.length + ciphertext.length);
    fullEncryptedData.set(iv, 0);
    fullEncryptedData.set(ciphertext, iv.length);
    return `0x${Buffer.from(fullEncryptedData).toString('hex')}` as Hex;
}

async function encryptECIES(keyBytes: Uint8Array, recipientPublicKey: Hex): Promise<Hex> {
    const pk = Buffer.from(recipientPublicKey.startsWith('0x04') ? recipientPublicKey.slice(4) : recipientPublicKey.slice(2), 'hex');
    const data = Buffer.from(keyBytes);
    const encryptedBuffer = encrypt(pk, data);
    return `0x${encryptedBuffer.toString('hex')}` as Hex;
}

export default function RegisterBatchRecords(): JSX.Element {
    const { primaryWallet } = useDynamicContext();
    const { data: hash, error, isPending, writeContract } = useWriteContract();
    const [isLoadingCrypto, setIsLoadingCrypto] = useState(false);
    const [payloads, setPayloads] = useState<CryptographicResult[] | null>(null);

    const recoverInstitutionPublicKey = async (messageHash: Hex, signature: Hex): Promise<Hex> => {
        return await recoverPublicKey({ hash: messageHash, signature: signature });
    };
    
    const processBatch = async () => {
        if (!primaryWallet || !primaryWallet.address || isLoadingCrypto) return;
        setIsLoadingCrypto(true);
        setPayloads(null);
        try {
            const walletClient = await (primaryWallet.connector as any).getWalletClient();
            if (!walletClient) throw new Error("Não foi possível obter o WalletClient da carteira embarcada.");
            const signMessageFn = async (messageHash: Hex): Promise<Hex> => {
                return walletClient.signMessage({
                    account: primaryWallet.address,
                    message: { raw: messageHash } as any,
                });
            };
            const results: CryptographicResult[] = [];
            const timestamp = Date.now();
            
            // --- PASSO 1: Assinar uma mensagem arbitrária para obter a PK da Instituição (Issuer) ---
            const pkRecoveryMessage = stringToHex("Public Key Recovery for ECIES");
            const pkRecoveryHash = keccak256(toBytes(pkRecoveryMessage));
            const institutionSignatureForPK = await signMessageFn(pkRecoveryMessage);
            const institutionPublicKey = await recoverInstitutionPublicKey(pkRecoveryHash, institutionSignatureForPK);
            console.log("Institution Public Key (Recovered):", institutionPublicKey);

            // --- PASSO 2: Processar cada registro individualmente ---
            for (const record of MOCK_BATCH_DATA) {
                const plaintextJsonString = JSON.stringify(record.plaintextData);
                const plaintextHash = keccak256(toBytes(plaintextJsonString)); 

                // 1. Gera Chave AES K
                const aesKey = crypto.getRandomValues(new Uint8Array(32)); // 32 bytes AES-256
                
                // 2. AES Cifragem dos dados reais
                const encryptedData = await encryptAESGCM(plaintextJsonString, aesKey);
                
                // 3. Assinatura ECDSA do Plaintext pelo Issuer
                const issuerSignature = await signMessageFn(plaintextHash);
                
                // 4. ECIES Cifragem da Chave AES K para a Instituição
                const encryptedKeyIssuer = await encryptECIES(aesKey, institutionPublicKey);
                
                // 5. ECIES Cifragem da Chave AES K para o Estudante
                const encryptedKeyStudent = await encryptECIES(aesKey, record.studentPublicKey);
                
                // 6. Gera Record ID (Determinístico usando hash + timestamp para evitar colisão no lote)
                const recordId = keccak256(toBytes(plaintextHash + numberToHex(timestamp, { size: 32 }))); 

                results.push({
                    recordId,
                    encryptedData,
                    encryptedKeyIssuer,
                    encryptedKeyStudent,
                    issuerSignature,
                    studentAddress: record.studentAddress,
                });
            }
            setPayloads(results);
        } catch (err) {
            console.error("ERRO CRIPTOGRÁFICO OU DE ASSINATURA:", err);
            setPayloads(null);
        } finally {
            setIsLoadingCrypto(false);
        }
    };

    const handleRegisterBatch = async (): Promise<void> => {
        if (!payloads || isPending) return;
        writeContract({
            ...wagmiContractConfig,
            functionName: "registerBatchRecords",
            args: [
                payloads.map(p => p.recordId),
                payloads.map(p => p.studentAddress),
                payloads.map(p => p.encryptedData),
                payloads.map(p => p.encryptedKeyIssuer),
                payloads.map(p => p.encryptedKeyStudent),
                payloads.map(p => p.issuerSignature),
            ]
        });
    };

    const { 
        data: receipt, 
        isLoading: isConfirming, 
        isSuccess: isConfirmed 
    } = useWaitForTransactionReceipt({ hash });
    
    const [recordEvents, setRecordEvents] = useState<Log[]>([]);
    
    useEffect(() => {
        if (receipt) {
            const events = parseEventLogs({
                abi: wagmiContractConfig.abi,
                logs: receipt.logs,
                eventName: 'RecordRegistered'
            });
            setRecordEvents(events);
        }
    }, [receipt]); 
    
    const buttonText = isPending 
        ? "Enviando Transação..." 
        : (isLoadingCrypto 
            ? `Processando ${MOCK_BATCH_DATA.length} Registros...` 
            : (isConfirming 
                ? "Confirmando Transação..." 
                : (payloads ? "Assinar e Enviar Lote para Blockchain" : "Iniciar Criptografia e Preparar Lote")
            )
        );
    
    const isDisabled = isPending || isConfirming || isLoadingCrypto || !primaryWallet?.address;

    return (
        <div>
            <h3>Registrar Lote de Registros Acadêmicos</h3>
            <p>O processo de **segurança** (AES e ECIES) é realizado no cliente antes do envio.</p>
            
            <button 
                disabled={isDisabled} 
                onClick={payloads ? handleRegisterBatch : processBatch} 
                type="button"
            >
                {buttonText}
            </button>
            
            {/* Mensagens de feedback */}
            {isLoadingCrypto && <div style={{color: 'orange', marginTop: '1rem'}}>
                <p>Processando {MOCK_BATCH_DATA.length} registros...</p>
            </div>}
            
            {hash && <div style={{marginTop: '1rem'}}>Transaction Hash: {hash}</div>}
            
            {error && <div style={{color: 'red', marginTop: '0.5rem'}}>Erro: {(error as BaseError)?.shortMessage || error?.message || "Erro desconhecido"}</div>}
            
            {isConfirmed && <div style={{color: 'green', marginTop: '0.5rem'}}>Lote registrado com sucesso!</div>}
            
            {isConfirmed && recordEvents.length > 0 && (
                <div style={{marginTop: '1rem'}}>
                    <h4>Eventos 'RecordRegistered' Emitidos:</h4>
                    {/* ... Seu código de exibição de evento ... */}
                </div>
            )}
        </div>
    );
}