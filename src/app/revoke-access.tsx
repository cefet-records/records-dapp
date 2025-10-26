// src/components/RevokeAccess.tsx
'use client';

import React, { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, type BaseError } from 'wagmi';
import { wagmiContractConfig } from '@/abis/AcademicRecordStorageABI'; // ABI do contrato
import { Hex, Address } from 'viem';

// Interface para os dados do formulário
interface RevokeAccessForm {
    recordId: Hex;
    visitorAddress: Address;
}

export default function RevokeAccess() {
    const { address: studentAddress, isConnected } = useAccount();
    const [formData, setFormData] = useState<RevokeAccessForm>({
        recordId: '0x' as Hex,
        visitorAddress: '0x' as Address,
    });
    
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    
    // Wagmi hooks para a transação de revogação
    const { data: hash, error: writeError, isPending: isTxPending, writeContract } = useWriteContract();
    const { isLoading: isTxConfirming, isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({ hash });

    // 1. Hook para buscar o registro do aluno para validação de propriedade
    const { data: recordData, isLoading: isLoadingRecord, error: recordError } = useReadContract({
        ...wagmiContractConfig,
        functionName: 'records',
        args: [formData.recordId],
        query: {
            enabled: formData.recordId.length === 66 && formData.recordId.startsWith('0x'),
            staleTime: 5000,
        }
    });

    // 2. Hook para verificar se o visitante REALMENTE tem acesso ativo
    const { data: visitorKeyData, isLoading: isLoadingVisitorKey, error: visitorKeyError } = useReadContract({
        ...wagmiContractConfig,
        functionName: 'visitorAccessKeys',
        args: [formData.recordId, formData.visitorAddress],
        query: {
            enabled: formData.recordId.length === 66 && formData.recordId.startsWith('0x') && formData.visitorAddress.length === 42 && formData.visitorAddress.startsWith('0x'),
            staleTime: 5000,
        }
    });
    const hasActiveAccess = (visitorKeyData as Hex)?.length > 2; // Se for '0x' significa que não tem acesso

    // Função para lidar com a revogação de acesso
    const handleRevokeAccess = async () => {
        if (!studentAddress) {
            setErrorMessage("Por favor, conecte sua carteira para revogar o acesso.");
            return;
        }
        if (isTxPending || isTxConfirming) return; // Evita cliques múltiplos

        setStatusMessage(null);
        setErrorMessage(null);

        try {
            // --- Validação Frontend Adicional ---
            if (formData.recordId.length !== 66 || !formData.recordId.startsWith('0x')) {
                throw new Error("ID do Registro inválido.");
            }
            if (formData.visitorAddress.length !== 42 || !formData.visitorAddress.startsWith('0x')) {
                throw new Error("Endereço do Visitante inválido.");
            }

            // Verifica se o usuário conectado é o proprietário do registro (on-chain check)
            const record = recordData as any; // Assumindo que recordData é a tupla da struct
            if (!record || record[1]?.toLowerCase() !== studentAddress.toLowerCase()) {
                throw new Error("Permissão negada. Você não é o proprietário deste registro.");
            }
            
            // Verifica se o visitante realmente tem acesso
            if (!hasActiveAccess) {
                throw new Error("Este visitante não possui acesso ativo para este registro.");
            }

            setStatusMessage("Aguardando confirmação na carteira para revogar acesso...");

            // Chama a função 'revokeVisitorAccess' do contrato
            writeContract({
                ...wagmiContractConfig,
                functionName: 'revokeVisitorAccess',
                args: [
                    formData.recordId,
                    formData.visitorAddress
                ],
            });

        } catch (err: any) {
            setErrorMessage(`Falha na Revogação: ${err.message || String(err)}`);
            console.error("ERRO REVOGAÇÃO:", err);
        }
    };

    return (
        <div className="bg-gray-900 p-6 rounded-xl text-white mt-8">
            <h2 className="text-xl font-bold mb-4 border-b border-gray-700 pb-2">Revogar Acesso do Visitante (Aluno)</h2>
            <p className="text-sm text-yellow-400 mb-4">
                ATENÇÃO: Apenas o Aluno proprietário do registro pode revogar o acesso.
            </p>

            {/* Inputs do Formulário */}
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-400">ID do Registro</label>
                    <input 
                        type="text" value={formData.recordId} 
                        onChange={(e) => setFormData({...formData, recordId: e.target.value as Hex})} 
                        placeholder="0x..." className="w-full p-2 mt-1 bg-gray-700 border border-gray-600 rounded" 
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400">Endereço do Visitante a Revogar</label>
                    <input 
                        type="text" value={formData.visitorAddress} 
                        onChange={(e) => setFormData({...formData, visitorAddress: e.target.value as Address})} 
                        placeholder="0x..." className="w-full p-2 mt-1 bg-gray-700 border border-gray-600 rounded" 
                    />
                </div>
            </div>

            {/* Status do Acesso do Visitante (para feedback visual) */}
            {(formData.recordId.length === 66 && formData.recordId.startsWith('0x') && formData.visitorAddress.length === 42 && formData.visitorAddress.startsWith('0x')) && (
                <div className="mt-4 p-2 bg-gray-700 rounded text-sm">
                    {isLoadingVisitorKey ? (
                        <p className="text-blue-400">Verificando acesso do visitante...</p>
                    ) : (
                        <p className={`font-semibold ${hasActiveAccess ? 'text-green-400' : 'text-red-400'}`}>
                            Status do Visitante: {hasActiveAccess ? 'Possui acesso ativo' : 'Não possui acesso ativo'}
                        </p>
                    )}
                    {visitorKeyError && <p className="text-red-500 text-xs">Erro na verificação de acesso: {visitorKeyError.message}</p>}
                </div>
            )}


            {/* Botão de Ação */}
            <div className="mt-6">
                <button
                    onClick={handleRevokeAccess}
                    disabled={isTxPending || isTxConfirming || isLoadingRecord || isLoadingVisitorKey || !studentAddress || !formData.recordId || !formData.visitorAddress || !hasActiveAccess}
                    className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded disabled:opacity-50"
                >
                    {isTxPending || isTxConfirming ? "Confirmando na Blockchain..." : "Revogar Acesso"}
                </button>
            </div>

            {/* Mensagens de Status */}
            <div className="mt-4 text-sm space-y-2">
                {errorMessage && <p className="text-red-500 break-all">ERRO: {errorMessage}</p>}
                {statusMessage && <p className="text-blue-400">STATUS: {statusMessage}</p>}
                {isTxConfirmed && <p className="text-green-500 font-bold">ACESSO REVOGADO COM SUCESSO! Hash: {(hash as Hex).substring(0, 10)}...</p>}
                {isTxPending && hash && <p className="text-yellow-500">Transação enviada: {(hash as Hex).substring(0, 10)}...</p>}
                {isLoadingRecord && <p className="text-gray-400">Buscando dados do registro...</p>}
            </div>
        </div>
    );
}