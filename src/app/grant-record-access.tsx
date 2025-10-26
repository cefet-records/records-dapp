// src/components/GrantAccess.tsx
'use client';

import React, { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, type BaseError } from 'wagmi';
import { wagmiContractConfig } from '@/abis/AcademicRecordStorageABI'; // ABI do contrato
import { Hex, Address, recoverPublicKey, keccak256, toBytes } from 'viem';
import { decryptECIES, encryptECIES } from "@/utils/cripto.utils"; // Funções de criptografia

// Interface para os dados do formulário
interface GrantAccessForm {
    recordId: Hex;
    visitorAddress: Address;
    visitorPublicKey: Hex; // Chave pública do visitante (0x04...)
    studentPrivateKey: Hex; // Chave privada do aluno conectado
}

export default function GrantAccess() {
    const { address: studentAddress, isConnected } = useAccount();
    const [formData, setFormData] = useState<GrantAccessForm>({
        recordId: '0x' as Hex,
        visitorAddress: '0x' as Address,
        visitorPublicKey: '0x' as Hex,
        studentPrivateKey: '0x' as Hex,
    });
    
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isLoadingProcessing, setIsLoadingProcessing] = useState(false);
    const [payloadForTx, setPayloadForTx] = useState<{ recordId: Hex, visitorAddress: Address, encryptedKeyVisitor: Hex } | null>(null);
    
    // Wagmi hooks para a transação
    const { data: hash, error: writeError, isPending: isTxPending, writeContract } = useWriteContract();
    const { isLoading: isTxConfirming, isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({ hash });

    // 1. Hook para buscar o registro do aluno para validação
    const { data: recordData, isLoading: isLoadingRecord } = useReadContract({
        ...wagmiContractConfig,
        functionName: 'records',
        args: [formData.recordId],
        query: {
            enabled: formData.recordId.length === 66 && formData.recordId.startsWith('0x'),
            staleTime: 5000,
        }
    });

    // Função de lógica de Recifragem
    const processRecryption = async () => {
        if (!studentAddress) return;
        if (isTxPending || isLoadingProcessing) return;
        
        setStatusMessage(null);
        setErrorMessage(null);
        setIsLoadingProcessing(true);
        setPayloadForTx(null); // Limpar payload anterior
        
        try {
            // --- VALIDAÇÃO CRÍTICA DOS DADOS DE ENTRADA ---
            if (formData.recordId.length !== 66 || !formData.recordId.startsWith('0x')) throw new Error("ID do Registro inválido.");
            if (formData.studentPrivateKey.length !== 66 || !formData.studentPrivateKey.startsWith('0x')) throw new Error("Chave Privada inválida.");
            if (formData.visitorPublicKey.length < 130) throw new Error("Chave Pública do Visitante inválida (tamanho).");
            
            // 1. Verificação de Propriedade do Registro (Off-chain)
            const record = recordData as any; // Assumindo que recordData é a tupla da struct
            if (!record || record[1]?.toLowerCase() !== studentAddress.toLowerCase()) { // record[1] é o studentAddress na tupla
                throw new Error("Permissão negada. Você não é o proprietário do registro.");
            }
            
            setStatusMessage("1. Descriptografando Chave AES K...");

            // 2. DESCRIPTOGRAFIA: Aluno usa sua Chave Privada para obter a Chave AES K Original
            const encryptedKeyStudent = record[5] as Hex; // record[5] é encryptedKeyStudent
            const aesKeyBytes = await decryptECIES(encryptedKeyStudent, formData.studentPrivateKey);
            
            if (aesKeyBytes.length !== 32) { // AES-256 Key deve ter 32 bytes
                throw new Error("Falha na descriptografia ECIES: Chave AES inválida.");
            }
            
            setStatusMessage("2. Recifrando Chave AES K para o Visitante...");

            // 3. RECIFRAGEM: Cifra a Chave AES K Original com a Chave Pública do Visitante (ECIES)
            const encryptedKeyVisitor = await encryptECIES(aesKeyBytes, formData.visitorPublicKey);
            
            if (encryptedKeyVisitor.length < 100) { // Verifica se a ECIES retornou algo válido
                 throw new Error("Falha na recifragem: Payload ECIES muito curto.");
            }

            setStatusMessage("3. Payload pronto. Aguardando Confirmação na Carteira.");
            
            // 4. Prepara o Payload para a Transação
            setPayloadForTx({
                recordId: formData.recordId,
                visitorAddress: formData.visitorAddress,
                encryptedKeyVisitor: encryptedKeyVisitor,
            });

        } catch (err: any) {
            setErrorMessage(`Falha no Processamento: ${err.message || String(err)}`);
            console.error("ERRO COMPARTILHAMENTO:", err);
        } finally {
            setIsLoadingProcessing(false);
        }
    };
    
    // Função para enviar a transação
    const handleGrantAccess = () => {
        if (!payloadForTx) return;

        writeContract({
            ...wagmiContractConfig,
            functionName: 'grantVisitorAccess',
            args: [
                payloadForTx.recordId,
                payloadForTx.visitorAddress,
                payloadForTx.encryptedKeyVisitor
            ],
        });
        setStatusMessage("Transação enviada. Aguardando mineração...");
    };

    return (
        <div className="bg-gray-900 p-6 rounded-xl text-white">
            <h2 className="text-xl font-bold mb-4 border-b border-gray-700 pb-2">Conceder Acesso ao Visitante (Aluno)</h2>
            <p className="text-sm text-yellow-400 mb-4">
                ATENÇÃO: Este processo usa sua Chave Privada localmente para recifrar a Chave AES K.
            </p>
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
                    <label className="block text-sm font-medium text-gray-400">Endereço do Visitante</label>
                    <input 
                        type="text" value={formData.visitorAddress} 
                        onChange={(e) => setFormData({...formData, visitorAddress: e.target.value as Address})} 
                        placeholder="0x..." className="w-full p-2 mt-1 bg-gray-700 border border-gray-600 rounded" 
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400">Chave Pública do Visitante (0x04...)</label>
                    <input 
                        type="text" value={formData.visitorPublicKey} 
                        onChange={(e) => setFormData({...formData, visitorPublicKey: e.target.value as Hex})} 
                        placeholder="0x04..." className="w-full p-2 mt-1 bg-gray-700 border border-gray-600 rounded" 
                    />
                </div>
                <div className="pt-2 border-t border-gray-700">
                    <label className="block text-sm font-medium text-red-400">Sua Chave Privada (Aluno)</label>
                    <input 
                        type="password" value={formData.studentPrivateKey} 
                        onChange={(e) => setFormData({...formData, studentPrivateKey: e.target.value as Hex})} 
                        placeholder="0x..." className="w-full p-2 mt-1 bg-gray-700 border border-red-500 rounded" 
                    />
                </div>
            </div>
            <div className="mt-6 space-y-3">
                <button
                    onClick={processRecryption}
                    disabled={isTxPending || isLoadingProcessing || !studentAddress || !recordData}
                    className="w-full py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold rounded disabled:opacity-50"
                >
                    {isLoadingProcessing ? "Processando Chaves..." : (payloadForTx ? "Recifragem Concluída" : "Processar Recifragem")}
                </button>

                {payloadForTx && (
                    <button
                        onClick={handleGrantAccess}
                        disabled={isTxPending || isTxConfirming}
                        className="w-full py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded disabled:opacity-50"
                    >
                        {isTxPending || isTxConfirming ? "Confirmando na Blockchain..." : "Assinar e Conceder Acesso"}
                    </button>
                )}
            </div>

            <div className="mt-4 text-sm space-y-2">
                {errorMessage && <p className="text-red-500 break-all">ERRO: {errorMessage}</p>}
                {statusMessage && <p className="text-blue-400">STATUS: {statusMessage}</p>}
                {isTxConfirmed && <p className="text-green-500 font-bold">ACESSO CONCEDIDO COM SUCESSO! Hash: {hash?.substring(0, 10)}...</p>}
                {isTxPending && hash && <p className="text-yellow-500">Transação enviada: {(hash as Hex).substring(0, 10)}...</p>}
                {isLoadingRecord && <p className="text-gray-400">Buscando dados do registro...</p>}
            </div>
        </div>
    );
}