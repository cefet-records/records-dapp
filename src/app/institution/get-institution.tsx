// src/components/ViewInstitutionDetails.tsx
'use client';

import React, { JSX, useEffect, useState } from 'react';
import { useReadContract, type BaseError } from 'wagmi';
import { wagmiContractConfig } from '@/abis/AcademicRecordStorageABI';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { Address } from 'viem';

// Interface para os dados do struct Institution (para tipagem mais precisa)
// Certifique-se de que esta interface corresponde EXATAMENTE ao seu struct Institution em Solidity
interface InstitutionContractData {
    institutionAddress: Address;
    name: string;
    document: string;
    publicKey: string; 
    // Se você tiver mais campos no seu struct Institution, adicione-os aqui:
    // SomeOtherField: string;
    // AnotherNumberField: number;
}

export function GetInstitutionDetails(): JSX.Element {
    const { primaryWallet } = useDynamicContext();
    const connectedAddress = primaryWallet?.address as Address | undefined;

    // 1. Leitura do contrato para obter os dados da instituição
    const { 
        data: institutionData, 
        isLoading, 
        isError, 
        error, 
        refetch 
    } = useReadContract({
        ...wagmiContractConfig,
        functionName: 'getInstitution', 
        args: connectedAddress ? [connectedAddress] : undefined,
        query: { enabled: !!connectedAddress } // Habilita a query apenas se houver um endereço conectado
    });

    // Estado para controlar se a instituição está registrada
    const [isInstitutionRegistered, setIsInstitutionRegistered] = useState<boolean | null>(null);

    // 2. Hook para verificar se a instituição existe e setar o estado
    useEffect(() => {
        if (connectedAddress && !isLoading && !isError) {
            // Verifica se institutionData é válido e se o endereço não é o 'address(0)'
            if (institutionData && (institutionData as InstitutionContractData).institutionAddress !== '0x0000000000000000000000000000000000000000') {
                setIsInstitutionRegistered(true);
            } else {
                setIsInstitutionRegistered(false);
            }
        } else if (!connectedAddress) {
            setIsInstitutionRegistered(null); // Reseta se desconectar
        }
    }, [connectedAddress, institutionData, isLoading, isError]);

    // Helper para exibir a chave pública (truncada)
    const displayPublicKey = (publicKey: string | undefined) => {
        if (!publicKey || publicKey.length <= 2) return "N/A";
        return `${publicKey.substring(0, 10)}...${publicKey.substring(publicKey.length - 10)}`;
    };

    return (
        <div style={{ marginTop: '1.5rem', border: '1px solid #6c757d', padding: '1rem', borderRadius: '4px', backgroundColor: '#f8f9fa' }}>
            <h2 style={{ color: '#343a40' }}>Detalhes da Instituição Conectada</h2>
            <p className="text-sm" style={{ marginBottom: '1rem', color: '#6c757d' }}>
                Exibe todos os detalhes da instituição associada à sua carteira.
            </p>

            {!connectedAddress ? (
                <p style={{ color: '#dc3545' }}>⚠️ Por favor, conecte sua carteira para ver os detalhes.</p>
            ) : (
                <>
                    {isLoading && <p style={{ color: '#007bff' }}>Carregando detalhes da instituição...</p>}

                    {isError && (
                        <p style={{ color: '#dc3545' }}>
                        Erro ao ler detalhes da instituição: {(error as any)?.shortMessage || error?.message}                        </p>
                    )}

                    {!isLoading && !isError && isInstitutionRegistered === false && (
                        <p style={{ color: '#ffc107' }}>
                            ℹ️ Esta carteira não está registrada como uma instituição.
                        </p>
                    )}

                    {/* Exibe todos os detalhes da instituição se estiver registrada */}
                    {!isLoading && !isError && isInstitutionRegistered === true && institutionData && (
                        <div style={{ padding: '0.8rem', backgroundColor: '#fff', border: '1px solid #e9ecef', borderRadius: '4px' }}>
                            <p><strong>Endereço da Instituição:</strong> <code style={{ wordBreak: 'break-all' }}>{(institutionData as InstitutionContractData).institutionAddress}</code></p>
                            <p><strong>Nome:</strong> {(institutionData as InstitutionContractData).name}</p>
                            <p><strong>Documento:</strong> {(institutionData as InstitutionContractData).document}</p>
                            
                            <p style={{ marginTop: '0.5rem' }}>
                                <strong>Chave Pública (ECDSA):</strong> <code style={{ wordBreak: 'break-all' }}>
                                    {displayPublicKey((institutionData as InstitutionContractData).publicKey)}
                                </code>
                            </p>
                            {(institutionData as InstitutionContractData).publicKey && (institutionData as InstitutionContractData).publicKey.length > 2 && (
                                <details style={{ marginTop: '0.5rem', cursor: 'pointer', color: '#007bff' }}>
                                    <summary>Ver Chave Completa</summary>
                                    <code style={{ wordBreak: 'break-all', fontSize: '0.8em', display: 'block', marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
                                        {(institutionData as InstitutionContractData).publicKey}
                                    </code>
                                </details>
                            )}

                            {/* Adicione mais campos aqui se o seu struct Institution tiver mais */}
                            {/* <p><strong>Outro Campo:</strong> {(institutionData as InstitutionContractData).SomeOtherField}</p> */}

                        </div>
                    )}
                </>
            )}
        </div>
    );
}