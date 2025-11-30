// src/components/AddInstitutionPublicKey.tsx
'use client';

import React, { JSX, useState, useEffect, useCallback } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useReadContract, type BaseError } from "wagmi"; // Removido useSignMessage
import * as secp from "@noble/secp256k1"; // Importar @noble/secp256k1
import { hexToBytes, bytesToHex, Address, Hex } from "viem"; // Adicionado hexToBytes, bytesToHex
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";

// NÃO PRECISA MAIS DE RECOVERY_MESSAGE OU MESSAGE_HASH!
// NÃO PRECISA MAIS DE useSignMessage!

export function AddInstitutionPublicKey(): JSX.Element { 
    const { primaryWallet } = useDynamicContext();
    const connectedAddress = primaryWallet?.address as Address | undefined;

    const [privateKeyInput, setPrivateKeyInput] = useState<Hex | ''>(''); // Campo para input da chave privada
    const [derivedPublicKey, setDerivedPublicKey] = useState<Hex | null>(null); // Chave pública derivada da privada inserida
    
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [hasCheckedExistingPK, setHasCheckedExistingPK] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Wagmi: Leitura da PK existente no contrato
    const { 
        data: institutionData, 
        isLoading: isLoadingInstitutionData, 
        refetch: fetchInstitutionData 
    } = useReadContract({
        ...wagmiContractConfig,
        functionName: 'getInstitution', 
        args: connectedAddress ? [connectedAddress] : undefined,
        query: { enabled: !!connectedAddress }
    });

    // Wagmi: Escrita da PK no contrato
    const { 
        data: hash, 
        error: writeError, 
        isPending: isTxPending, 
        writeContract 
    } = useWriteContract();
    const { 
        isLoading: isTxConfirming, 
        isSuccess: isTxConfirmed 
    } = useWaitForTransactionReceipt({ hash });

    // Efeito para verificar se a PK já existe e setar o status inicial
    useEffect(() => {
        if (institutionData && !hasCheckedExistingPK) {
            const existingPublicKey = institutionData.publicKey; 
            if (existingPublicKey && existingPublicKey.length > 2) { // length > 2 para ignorar "0x"
                setStatusMessage(`Chave pública ECDSA já registrada no contrato: ${existingPublicKey.substring(0, 20)}...`);
                setDerivedPublicKey(existingPublicKey as Hex); // Carrega a PK existente no estado
            } else {
                setStatusMessage("Nenhuma chave pública registrada para esta instituição.");
            }
            setHasCheckedExistingPK(true);
        }
    }, [institutionData, hasCheckedExistingPK]);

    // Função para derivar a chave pública a partir da chave privada inserida
    const derivePublicKeyFromPrivate = useCallback(() => {
        setError(null);
        if (!privateKeyInput || privateKeyInput.length !== 66) { // Chave privada hex tem 66 caracteres (0x + 64 chars)
            setError("Por favor, insira uma chave privada hexadecimal válida (64 caracteres + '0x').");
            setDerivedPublicKey(null);
            return;
        }

        try {
            const privateKeyBytes = hexToBytes(privateKeyInput);
            // secp.getPublicKey retorna a chave pública NÃO COMPRIMIDA (0x04...)
            const publicKeyBytes = secp.getPublicKey(privateKeyBytes, false); 
            const publicKeyHex = bytesToHex(publicKeyBytes) as Hex;

            setDerivedPublicKey(publicKeyHex);
            setStatusMessage("Chave pública derivada com sucesso da chave privada inserida!");
        } catch (err: any) {
            const msg = `Erro ao derivar chave pública da chave privada: ${err.message || String(err)}`;
            setError(msg);
            setStatusMessage(msg);
            console.error("ERRO ao derivar PK da chave privada:", err);
            setDerivedPublicKey(null);
        }
    }, [privateKeyInput]);

    // Inicia o processo de registro no contrato
    const handleRegisterPublicKey = () => {
        if (!connectedAddress || !derivedPublicKey) {
            setStatusMessage("Erro: Chave pública não derivada ou carteira desconectada.");
            return;
        }

        // Se a chave pública já está lá E é a mesma que tentamos registrar, evite a transação de novo
        if (institutionData?.publicKey && institutionData.publicKey === derivedPublicKey) {
            setStatusMessage("A mesma chave pública já está registrada no contrato!");
            return;
        }
        
        console.log("Registrando chave pública no contrato:", derivedPublicKey);
        setStatusMessage("Aguardando confirmação na carteira para registrar a Chave Pública no contrato...");
        writeContract({
            ...wagmiContractConfig,
            functionName: 'addInstitutionPublicKey',
            args: [
                connectedAddress, 
                derivedPublicKey,  
            ],
        });
    };

    // Efeito para sucesso da transação de registro
    useEffect(() => {
        if (isTxConfirmed) {
            setStatusMessage("Chave pública da instituição registrada com sucesso no contrato!");
            fetchInstitutionData(); // Atualiza o status de leitura do contrato
        }
    }, [isTxConfirmed, fetchInstitutionData]);

    const isButtonDisabled = isTxPending || isTxConfirming || !connectedAddress || isLoadingInstitutionData;
    const isPkAlreadyRegistered: boolean = !!derivedPublicKey && institutionData?.publicKey === derivedPublicKey;

    return (
        <div style={{ marginTop: '1.5rem', border: '1px solid #007bff', padding: '1rem', borderRadius: '4px' }}>
            <h2>Gerenciar Chave Pública de Criptografia da Instituição</h2>
            <p className="text-sm" style={{ marginBottom: '10px', color: 'gray' }}>
                Insira a chave privada da sua Instituição para derivar e registrar a chave pública correspondente no contrato.
            </p>

            {!connectedAddress ? (
                <p className="text-yellow-400">Por favor, conecte sua carteira para gerenciar a chave pública.</p>
            ) : (
                <>
                    {/* Input para a chave privada */}
                    <div style={{ marginBottom: '1rem' }}>
                        <label htmlFor="privateKey" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Chave Privada da Instituição (Hex):
                        </label>
                        <input
                            id="privateKey"
                            type="text"
                            value={privateKeyInput}
                            onChange={(e) => setPrivateKeyInput(e.target.value as Hex)}
                            placeholder="Ex: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
                            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
                        />
                        <button
                            onClick={derivePublicKeyFromPrivate}
                            disabled={!privateKeyInput || privateKeyInput.length !== 66 || isButtonDisabled}
                            style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', opacity: isButtonDisabled || !privateKeyInput || privateKeyInput.length !== 66 ? 0.5 : 1 }}
                        >
                            Derivar Chave Pública
                        </button>
                    </div>

                    {/* Exibe a chave se já estiver disponível (derivada ou do contrato) */}
                    {derivedPublicKey && (
                        <div style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#e9f7ef', borderRadius: '4px', border: '1px solid #d0f0d0' }}>
                            <p style={{ color: 'green', fontWeight: 'bold' }}>Chave Pública Derivada:</p>
                            <code style={{ fontSize: '0.8em', wordBreak: 'break-all' }}>{derivedPublicKey}</code>
                            {isPkAlreadyRegistered && <p style={{ color: 'blue', marginTop: '0.5rem' }}>(Já registrada no contrato)</p>}
                        </div>
                    )}

                    {/* Botão para Registrar a Chave no Contrato */}
                    {derivedPublicKey && !isPkAlreadyRegistered && (
                        <button
                            onClick={handleRegisterPublicKey}
                            disabled={isButtonDisabled || !derivedPublicKey} 
                            style={{ padding: '0.5rem 1rem', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', opacity: isButtonDisabled || !derivedPublicKey ? 0.5 : 1 }}
                        >
                            {isTxPending ? "Aguardando Transação..." : (isTxConfirming ? "Confirmando..." : "Registrar Chave Pública no Contrato")}
                        </button>
                    )}

                    {/* Mensagens de Feedback */}
                    {statusMessage && <p style={{ marginTop: '0.8rem', color: writeError || error ? 'red' : 'inherit' }}>
                        {statusMessage}
                    </p>}
                    {error && <p style={{ color: 'red' }}>Erro: {error}</p>}
                    {writeError && <p style={{ color: 'red' }}>Erro no contrato: {(writeError as BaseError).shortMessage || writeError.message}</p>}
                </>
            )}
        </div>
    );
}