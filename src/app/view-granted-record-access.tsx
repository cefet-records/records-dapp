// src/components/ViewGrantedAccess.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAccount, useReadContract, usePublicClient } from 'wagmi';
import { Address, Hex, parseEventLogs, Log } from 'viem';
import { wagmiContractConfig } from '@/abis/AcademicRecordStorageABI'; // ABI do contrato

// Interface para um visitante com acesso
interface VisitorAccess {
    visitorAddress: Address;
    grantedByStudent: Address;
    transactionHash: Hex;
    blockNumber: bigint;
    status: 'granted' | 'revoked'; // Adiciona um status para rastrear
}

function findEventAbi(abi: readonly unknown[], eventName: string) {
    const eventAbi = (abi as any[]).find(
        (item: any) => item.type === 'event' && item.name === eventName
    );
    if (!eventAbi) {
        throw new Error(`Event ABI for ${eventName} not found in contract ABI.`);
    }
    return eventAbi; 
}

export default function ViewGrantedAccess() {
    const { address: connectedAccount } = useAccount();
    const publicClient = usePublicClient();

    const [recordIdInput, setRecordIdInput] = useState<Hex>('0x');
    const [allAccessEvents, setAllAccessEvents] = useState<VisitorAccess[]>([]); // Todos os eventos
    const [isLoadingEvents, setIsLoadingEvents] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { data: recordData, isLoading: isLoadingRecord } = useReadContract({
        ...wagmiContractConfig,
        functionName: 'records',
        args: [recordIdInput],
        query: {
            enabled: recordIdInput.length === 66 && recordIdInput.startsWith('0x'),
            staleTime: 5000,
        }
    });

    const studentOwner = recordData ? (recordData[1] as Address) : undefined;

    // Efeito para buscar os logs dos eventos AccessGranted e AccessRevoked
    useEffect(() => {
        const fetchAccessLogs = async () => {
            if (!publicClient || !recordIdInput || recordIdInput.length !== 66 || !recordIdInput.startsWith('0x')) {
                setAllAccessEvents([]);
                return;
            }

            setIsLoadingEvents(true);
            setError(null);
            setAllAccessEvents([]);

            try {
                // Encontra as definições de ABI para ambos os eventos
                const accessGrantedAbi = findEventAbi(wagmiContractConfig.abi, 'AccessGranted');
                const accessRevokedAbi = findEventAbi(wagmiContractConfig.abi, 'AccessRevoked');

                // Busca logs de AccessGranted
                const grantedLogs = await publicClient.getLogs({
                    address: wagmiContractConfig.address,
                    event: {
                        ...accessGrantedAbi,
                        args: { recordId: recordIdInput }, 
                    } as any,
                    fromBlock: 0n,
                    toBlock: 'latest',
                });

                // Busca logs de AccessRevoked
                const revokedLogs = await publicClient.getLogs({
                    address: wagmiContractConfig.address,
                    event: {
                        ...accessRevokedAbi,
                        args: { recordId: recordIdInput }, 
                    } as any,
                    fromBlock: 0n,
                    toBlock: 'latest',
                });

                // Parseia os logs
                const parsedGrantedLogs = parseEventLogs({
                    abi: wagmiContractConfig.abi,
                    eventName: 'AccessGranted',
                    logs: grantedLogs as Log[],
                });
                const parsedRevokedLogs = parseEventLogs({
                    abi: wagmiContractConfig.abi,
                    eventName: 'AccessRevoked',
                    logs: revokedLogs as Log[],
                });
                
                const combinedEvents: VisitorAccess[] = [];

                // Adiciona eventos de concessão
                for (const log of parsedGrantedLogs) {
                    const { student, visitorAddress } = (log as any).args;
                    combinedEvents.push({
                        visitorAddress: visitorAddress,
                        grantedByStudent: student,
                        transactionHash: log.transactionHash as Hex,
                        blockNumber: log.blockNumber as bigint,
                        status: 'granted',
                    });
                }

                // Adiciona eventos de revogação
                for (const log of parsedRevokedLogs) {
                    const { student, visitorAddress } = (log as any).args;
                    combinedEvents.push({
                        visitorAddress: visitorAddress,
                        grantedByStudent: student, // Quem revogou (deve ser o aluno)
                        transactionHash: log.transactionHash as Hex,
                        blockNumber: log.blockNumber as bigint,
                        status: 'revoked',
                    });
                }
                
                // Ordena os eventos por bloco e índice de log para processamento cronológico
                combinedEvents.sort((a, b) => {
                    if (a.blockNumber !== b.blockNumber) {
                        return Number(a.blockNumber - b.blockNumber);
                    }
                    // Em caso de mesmo bloco, o viem.parseEventLogs não garante ordem de transactionIndex/logIndex
                    // mas para nossa lógica de "último estado", a ordem do parse não é tão crítica aqui.
                    // Para precisão total, precisaríamos usar o log.transactionIndex e log.logIndex
                    return 0; 
                });

                setAllAccessEvents(combinedEvents);

            } catch (err: any) {
                setError(`Erro ao buscar logs de acesso: ${err.message || String(err)}`);
                console.error("Erro ao buscar logs de acesso:", err);
            } finally {
                setIsLoadingEvents(false);
            }
        };

        fetchAccessLogs();
    }, [recordIdInput, publicClient]);


    // Usa useMemo para calcular a lista de visitantes ATIVOS com base em todos os eventos
    const activeVisitors = useMemo(() => {
        const activeMap = new Map<Address, VisitorAccess>(); // Map<visitorAddress, lastEvent>

        for (const event of allAccessEvents) {
            // Se o último evento para este visitante foi 'granted', ele tem acesso
            // Se o último evento foi 'revoked', ele não tem (remove do mapa)
            if (event.status === 'granted') {
                activeMap.set(event.visitorAddress, event);
            } else if (event.status === 'revoked') {
                activeMap.delete(event.visitorAddress);
            }
        }
        return Array.from(activeMap.values()); // Retorna apenas os que estão no mapa (ativos)
    }, [allAccessEvents]);


    return (
        <div className="bg-gray-800 p-6 rounded-xl text-white mt-8">
            <h2 className="text-xl font-bold mb-4 border-b border-gray-600 pb-2">Visualizar Acessos Concedidos</h2>
            
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-400">ID do Registro</label>
                <input 
                    type="text" value={recordIdInput} 
                    onChange={(e) => setRecordIdInput(e.target.value as Hex)} 
                    placeholder="0x..." 
                    className="w-full p-2 mt-1 bg-gray-700 border border-gray-600 rounded" 
                />
            </div>

            {isLoadingRecord && <p className="text-blue-400">Buscando detalhes do registro...</p>}
            {error && <p className="text-red-500">ERRO: {error}</p>}

            {recordIdInput.length === 66 && recordIdInput.startsWith('0x') && studentOwner && (
                <p className="text-sm text-gray-300 mb-4">
                    Proprietário do Registro (Aluno): <span className="font-mono">{studentOwner}</span>
                </p>
            )}

            {isLoadingEvents ? (
                <p className="text-blue-400">Buscando eventos de acesso (concessões e revogações)...</p>
            ) : (
                <>
                    {activeVisitors.length === 0 && recordIdInput.length === 66 && recordIdInput.startsWith('0x') ? (
                        <p className="text-yellow-400">Nenhum acesso ativo encontrado para este registro.</p>
                    ) : (
                        <div className="mt-4">
                            <h3 className="text-lg font-semibold mb-2">Visitantes com Acesso Ativo:</h3>
                            <ul className="space-y-2">
                                {activeVisitors.map((visitor, index) => (
                                    <li key={visitor.visitorAddress} className="bg-gray-700 p-3 rounded flex flex-col md:flex-row md:items-center justify-between">
                                        <div>
                                            <p className="text-gray-200">Visitante: <span className="font-mono text-sm">{visitor.visitorAddress}</span></p>
                                            <p className="text-gray-400 text-xs">Concedido por: <span className="font-mono text-xs">{visitor.grantedByStudent}</span></p>
                                            <p className="text-gray-400 text-xs">Transação: <a href={`https://sepolia.etherscan.io/tx/${visitor.transactionHash}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{(visitor.transactionHash as string).substring(0, 10)}...</a></p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}