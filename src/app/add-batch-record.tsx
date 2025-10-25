"use client"; 

import { JSX, useEffect, useState } from "react";
import { type BaseError, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Address, numberToHex, Log, parseEventLogs, toBytes, Hex, keccak256 } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { encryptAESGCM, encryptECIES } from "@/utils/cripto.utils";
import { INSTITUTION_PUBLIC_KEY, MOCK_BATCH_DATA } from "@/utils/utils";

interface CryptographicResult {
    recordId: Hex;
    encryptedData: Hex;
    encryptedKeyIssuer: Hex; 
    encryptedKeyStudent: Hex;
    issuerSignature: Hex; 
    studentAddress: Address;
}

export default function RegisterBatchRecords(): JSX.Element {
    const { primaryWallet } = useDynamicContext();
    const { data: hash, error, isPending, writeContract } = useWriteContract();
    const [isLoadingCrypto, setIsLoadingCrypto] = useState(false);
    const [payloads, setPayloads] = useState<CryptographicResult[] | null>(null);
    
    const processBatch = async () => {
        if (!primaryWallet || !primaryWallet.address || isLoadingCrypto) return;
        setIsLoadingCrypto(true);
        setPayloads(null);
        try {
            const institutionPublicKey = INSTITUTION_PUBLIC_KEY; 
            const walletClient = await (primaryWallet.connector as any).getWalletClient();
            if (!walletClient) throw new Error("Não foi possível obter o WalletClient da carteira embarcada.");
            const signMessageFn = async (message: string | Uint8Array): Promise<Hex> => {
                if (typeof message === "string") {
                    return walletClient.signMessage({
                        account: primaryWallet.address,
                        message: message,
                    });
                } else {
                    return walletClient.signMessage({
                        account: primaryWallet.address,
                        message: { raw: message },
                    });
                }
            };
            const results: CryptographicResult[] = [];
            const timestamp = Date.now();

            for (const record of MOCK_BATCH_DATA) {
                const plaintextJsonString = JSON.stringify(record.plaintextData);
                const plaintextHash = keccak256(toBytes(plaintextJsonString)); 
                const aesKey = crypto.getRandomValues(new Uint8Array(32));
                const encryptedData = await encryptAESGCM(plaintextJsonString, aesKey);
                const issuerSignature = await signMessageFn(plaintextHash);
                const encryptedKeyIssuer = await encryptECIES(aesKey, institutionPublicKey);
                const encryptedKeyStudent = await encryptECIES(aesKey, record.studentPublicKey);
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
            console.log("payload", results);
            setPayloads(results);
        } catch (err: any) {
            console.error("ERRO CRIPTOGRÁFICO OU DE ASSINATURA:", err);
            setPayloads(null);
            alert(`Erro ao processar lote: ${err.message || err.toString()}`);
        } finally {
            setIsLoadingCrypto(false);
        }
    };

    const handleRegisterBatch = async (): Promise<void> => {
        if (!payloads || isPending) return;
        const cleanedSignatures = payloads.map(p => 
            p.issuerSignature.startsWith("0x") ? p.issuerSignature.slice(2) : p.issuerSignature
        );
        writeContract({
            ...wagmiContractConfig,
            functionName: "registerBatchRecords",
            args: [
                payloads.map(p => p.recordId),
                payloads.map(p => p.studentAddress),
                payloads.map(p => p.encryptedData),
                payloads.map(p => p.encryptedKeyIssuer),
                payloads.map(p => p.encryptedKeyStudent),
                cleanedSignatures.map(sig => `0x${sig}` as Hex),
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
                eventName: "RecordRegistered"
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
            <button disabled={isDisabled} onClick={payloads ? handleRegisterBatch : processBatch} type="button">{buttonText}</button>
            {isLoadingCrypto && <div style={{color: "orange", marginTop: "1rem"}}><p>Processando {MOCK_BATCH_DATA.length} registros...</p></div>}
            {hash && <div style={{marginTop: "1rem"}}>Transaction Hash: {hash}</div>}
            {error && <div style={{color: "red", marginTop: "0.5rem"}}>Erro: {(error as BaseError)?.shortMessage || error?.message || "Erro desconhecido"}</div>}
            {isConfirmed && <div style={{color: "green", marginTop: "0.5rem"}}>Lote registrado com sucesso!</div>}
            {isConfirmed && recordEvents.length > 0 && (<div style={{marginTop: "1rem"}}><h4>Eventos "RecordRegistered" Emitidos:</h4></div>)}
        </div>
    );
}