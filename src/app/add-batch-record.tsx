import { JSX, useEffect, useState } from "react";
import { type BaseError, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Address, stringToHex, numberToHex, Log, parseEventLogs } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";

const mockRecordIds: `0x${string}`[] = [numberToHex(1, { size: 32 }), numberToHex(2, { size: 32 })];
const mockStudentes: Address[] = ['0x70997970C51812dc3A010C7d01b50e0d17dc79C8', '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'];
const mockEncryptedData: `0x${string}`[] = [stringToHex('Dados criptografados do diploma de Teste 1'), stringToHex('Dados criptografados do histórico de Teste 2')];
const mockEncryptedKeyInstitution: `0x${string}`[] = [stringToHex('mock-key-instituicao-1'), stringToHex('mock-key-instituicao-2')];
const mockEncryptedKeyStudent: `0x${string}`[] = [stringToHex('mock-key-estudante-1'), stringToHex('mock-key-estudante-2')];
const mockSignatures: `0x${string}`[] = [stringToHex('mock-assinatura-1'), stringToHex('mock-assinatura-2')];

export default function RegisterBatchRecords(): JSX.Element {
    const { data: hash, error, isPending, writeContract } = useWriteContract();
    const handleRegisterBatch = async(): Promise<void> => {
        writeContract({
            ...wagmiContractConfig,
            functionName: "registerBatchRecords",
            args: [
                mockRecordIds,
                mockStudentes,
                mockEncryptedData,
                mockEncryptedKeyInstitution,
                mockEncryptedKeyStudent,
                mockSignatures
            ]
        });
    };
    const { 
        data: receipt, 
        isLoading: isConfirming, 
        isSuccess: isConfirmed 
    } = useWaitForTransactionReceipt({ 
        hash
    });
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
    return (
        <div>
            <h3>Registrar Lote de Teste</h3>
            <p>Isto enviará uma transação com 2 registros acadêmicos mocados.</p>
            <button disabled={isPending || isConfirming} onClick={handleRegisterBatch} type="button">
                {isPending ? "Enviando Transação..." : (isConfirming ? "Confirmando..." : "Registrar Lote")}
            </button>
            {hash && <div>Transaction Hash: {hash}</div>}
            {isConfirming && <div>Aguardando confirmação...</div>}
            {isConfirmed && <div style={{color: 'green'}}>Lote registrado com sucesso!</div>}
            {isConfirmed && recordEvents.length > 0 && (
                <div style={{marginTop: '1rem'}}>
                    <h4>Eventos 'RecordRegistered' Emitidos:</h4>
                    <pre style={{background: '#f4f4f4', padding: '10px', borderRadius: '5px'}}>
                        {JSON.stringify(
                            recordEvents, 
                            (key, value) => (typeof value === 'bigint' ? value.toString() : value), 
                            2
                        )}
                    </pre>
                </div>
            )}
            {error && <div style={{color: 'red'}}>Erro: {(error as BaseError).shortMessage || error.message}</div>}
        </div>
    );
}