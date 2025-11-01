// src/components/AddInstitutionPublicKey.tsx
'use client';

import React, { JSX, useState, useEffect, useCallback } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useSignMessage, type BaseError} from "wagmi";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Address, Hex, keccak256, toBytes, recoverPublicKey } from "viem";

// Defina a mensagem de recuperação (deve ser a mesma em todas as chamadas)
const RECOVERY_MESSAGE = "Generate Public Key for ECIES Encryption for Institution";
const MESSAGE_HASH = keccak256(toBytes(RECOVERY_MESSAGE)); // Hash Keccak-256 da mensagem

// NÃO PRECISA MAIS DE PROPS!
export function AddInstitutionPublicKey(): JSX.Element { 
    const { primaryWallet } = useDynamicContext();
    const connectedAddress = primaryWallet?.address as Address | undefined;

    // Estados para a chave pública recuperada
    const [derivedPublicKey, setDerivedPublicKey] = useState<Hex | null>(null);
    const [derivedPublicKeyXY, setDerivedPublicKeyXY] = useState<string | null>(null);

    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [hasCheckedExistingPK, setHasCheckedExistingPK] = useState(false); // Para controlar a verificação inicial
    const [error, setError] = useState<string | null>(null);

    // Wagmi: Assinatura para derivar a chave pública
    const { 
        signMessage, 
        data: signature, 
        isPending: isSigning, 
        error: signError 
    } = useSignMessage();

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
                setDerivedPublicKeyXY(existingPublicKey.slice(4)); // Também para o formato X+Y
            } else {
                setStatusMessage("Nenhuma chave pública registrada para esta instituição.");
            }
            setHasCheckedExistingPK(true);
        }
    }, [institutionData, hasCheckedExistingPK]);

    // Função para recuperar a PK a partir da assinatura
    const recoverAndSetPublicKey = useCallback(async (sig: Hex) => {
        if (!connectedAddress) return;
        setStatusMessage("Derivando chave pública da assinatura...");
        try {
            const recoveredPK = await recoverPublicKey({ 
                hash: MESSAGE_HASH, 
                signature: sig,
            });
            const publicKeyXY = recoveredPK.slice(4); // Remove 0x04 para o formato X+Y (128 chars)
            
            setDerivedPublicKey(recoveredPK);
            setDerivedPublicKeyXY(publicKeyXY);
            setStatusMessage("Chave pública derivada com sucesso! Clique em 'Registrar' para salvar no contrato.");
            setError(null); // Limpa erros anteriores
        } catch (err: any) {
            const msg = `Erro ao recuperar chave: ${err.message || String(err)}`;
            setStatusMessage(msg);
            setError(msg);
            console.error("ERRO ao recuperar PK via assinatura:", err);
        }
    }, [connectedAddress]);


    // Efeito para disparar a recuperação assim que a assinatura estiver pronta
    useEffect(() => {
        if (signature && !derivedPublicKey) { // Só recupera se houver assinatura e nenhuma PK ainda
            recoverAndSetPublicKey(signature);
        }
    }, [signature, derivedPublicKey, recoverAndSetPublicKey]);


    // Inicia o processo de assinatura
    const handleDerivePublicKey = () => {
        if (!connectedAddress || isSigning) return;
        setError(null);
        setStatusMessage("Aguardando confirmação na carteira para assinar mensagem e derivar a Chave Pública...");
        signMessage({ message: RECOVERY_MESSAGE }); 
    };

    // Função para enviar a PK para o contrato
    const handleRegisterPublicKey = () => {
        if (!connectedAddress || !derivedPublicKey) {
            setStatusMessage("Erro: Chave pública não derivada ou carteira desconectada.");
            return;
        }

        // Se a chave pública já está lá, evite a transação de novo
        if (institutionData?.publicKey && institutionData.publicKey.length > 2) {
            setStatusMessage("Chave pública já registrada no contrato!");
            return;
        }

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

    const isButtonDisabled = isSigning || isTxPending || isTxConfirming || !connectedAddress || isLoadingInstitutionData;
    const isPkAlreadyRegistered: boolean = !!derivedPublicKey && institutionData?.publicKey === derivedPublicKey;


    return (
        <div style={{ marginTop: '1.5rem', border: '1px solid #007bff', padding: '1rem', borderRadius: '4px' }}>
            <h2>Adicionar Chave Pública de Criptografia da Instituição</h2>
            <p className="text-sm" style={{ marginBottom: '10px', color: 'gray' }}>
                Esta chave será usada para criptografar dados privados destinados à auditoria da Instituição.
            </p>

            {!connectedAddress ? (
                <p className="text-yellow-400">Por favor, conecte sua carteira para gerenciar a chave pública.</p>
            ) : (
                <>
                    {/* Exibe a chave se já estiver disponível (derivada ou do contrato) */}
                    {derivedPublicKey && (
                        <div style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#e9f7ef', borderRadius: '4px', border: '1px solid #d0f0d0' }}>
                            <p style={{ color: 'green', fontWeight: 'bold' }}>Chave Pública Derivada:</p>
                            <code style={{ fontSize: '0.8em', wordBreak: 'break-all' }}>{derivedPublicKey}</code>
                            {isPkAlreadyRegistered && <p style={{ color: 'blue', marginTop: '0.5rem' }}>(Já registrada no contrato)</p>}
                        </div>
                    )}

                    {/* Botão para Derivar a Chave (via assinatura) */}
                    {!derivedPublicKey || !isPkAlreadyRegistered ? (
                        <button
                            onClick={handleDerivePublicKey}
                            disabled={isButtonDisabled || isSigning}
                            style={{ padding: '0.5rem 1rem', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', opacity: isButtonDisabled ? 0.5 : 1, marginRight: '10px' }}
                        >
                            {isSigning ? "Assinando Mensagem..." : "1. Derivar Chave Pública (Assinar)"}
                        </button>
                    ) : null}

                    {/* Botão para Registrar a Chave no Contrato */}
                    {derivedPublicKey && !isPkAlreadyRegistered && (
                        <button
                        onClick={handleRegisterPublicKey}
                        // CORREÇÃO AQUI: !!derivedPublicKey garante que o tipo seja boolean
                        disabled={isButtonDisabled || !derivedPublicKey || isPkAlreadyRegistered} 
                        style={{ padding: '0.5rem 1rem', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', opacity: isButtonDisabled ? 0.5 : 1 }}
                    >
                        {isTxPending ? "Aguardando Transação..." : (isTxConfirming ? "Confirmando..." : "2. Registrar Chave Pública no Contrato")}
                    </button>
                    )}

                    {/* Mensagens de Feedback */}
                    {statusMessage && <p style={{ marginTop: '0.8rem', color: writeError || signError ? 'red' : 'inherit' }}>
                        {statusMessage}
                    </p>}
                    {signError && <p style={{ color: 'red' }}>Erro na assinatura: {(signError as BaseError).shortMessage || signError.message}</p>}
                    {writeError && <p style={{ color: 'red' }}>Erro no contrato: {(writeError as BaseError).shortMessage || writeError.message}</p>}
                </>
            )}
        </div>
    );
}