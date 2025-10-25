'use client'; 

import React, { useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { wagmiContractConfig } from '@/abis/AcademicRecordStorageABI';
import { Address, Hex } from 'viem';
import { decryptAESGCM, decryptECIES } from '@/utils/cripto.utils';

const replacer = (_key: string, value: any) =>
    typeof value === 'bigint' ? value.toString() : value;

interface RecordStruct {
    recordId: Hex;
    student: Address;
    institution: Address;
    encryptedData: Hex;
    encryptedKeyInstitution: Hex;
    encryptedKeyStudent: Hex;
    signature: Hex;
    timestamp: bigint;
}

function mapRecordDataToStruct(data: readonly unknown[]): RecordStruct {
    return {
        recordId: data[0] as Hex,
        student: data[1] as Address,
        institution: data[2] as Address,
        encryptedData: data[3] as Hex,
        encryptedKeyInstitution: data[4] as Hex,
        encryptedKeyStudent: data[5] as Hex,
        signature: data[6] as Hex,
        timestamp: data[7] as bigint,
    };
}

export default function DecryptRecord() {
    const { address: connectedAccount } = useAccount();
    const [recordIdInput, setRecordIdInput] = useState<Hex>('0x');
    const [privateKeyInput, setPrivateKeyInput] = useState<Hex>('0x');
    const [decryptedRecord, setDecryptedRecord] = useState<string | null>(null);
    const [decryptionError, setDecryptionError] = useState<string | null>(null);

    const { data: recordData, isLoading, isError, error } = useReadContract({
        ...wagmiContractConfig,
        functionName: 'records',
        args: [recordIdInput as Hex],
        query: {
            enabled: recordIdInput.length === 66 && recordIdInput.startsWith('0x'),
            staleTime: 5000,
        }
    });

    const handleDecrypt = async () => {
        setDecryptedRecord(null);
        setDecryptionError(null);

        if (!connectedAccount) {
            setDecryptionError("Por favor, conecte sua carteira.");
            return;
        }
        if (!recordIdInput || recordIdInput.length !== 66 || !recordIdInput.startsWith('0x')) {
            setDecryptionError("Por favor, insira um Record ID válido (0x + 64 hex chars).");
            return;
        }
        if (!privateKeyInput || !privateKeyInput.startsWith('0x') || privateKeyInput.length !== 66) {
            setDecryptionError("Por favor, insira sua chave privada EVM completa (0x + 64 hex chars).");
            return;
        }

        if (isLoading) {
            setDecryptionError("Aguarde, o registro está sendo carregado.");
            return;
        }
        if (isError) {
            setDecryptionError(`Erro ao buscar o registro: ${error?.message}`);
            return;
        }
        if (!recordData) {
            setDecryptionError("Registro não encontrado na blockchain.");
            return;
        }

        const record = mapRecordDataToStruct(recordData);
        if (record.student.toLowerCase() !== connectedAccount.toLowerCase()) {
            setDecryptionError("Você não é o aluno associado a este registro. Permissão negada.");
            return;
        }

        try {
            const aesKeyBytes = await decryptECIES(record.encryptedKeyStudent, privateKeyInput);
            const originalData = await decryptAESGCM(record.encryptedData, aesKeyBytes);
            setDecryptedRecord(originalData);
        } catch (err: any) {
            console.error("Erro durante a descriptografia:", err);
            setDecryptionError(`Falha na descriptografia. Verifique a chave privada e os dados: ${err.message || String(err)}`);
        }
    };

    return (
        <div style={{ marginTop: '2rem', padding: '1.5rem', border: '1px solid #ccc', borderRadius: '8px' }}>
            <h2>Descriptografar Registro Acadêmico (Aluno)</h2>
            <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="recordId" style={{ display: 'block', marginBottom: '0.5rem' }}>ID do Registro (bytes32 - ex: 0x...):</label>
                <input type="text" id="recordId" value={recordIdInput} onChange={(e) => setRecordIdInput(e.target.value as Hex)} placeholder="0x..." style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }} />
            </div>
            <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="privateKey" style={{ display: 'block', marginBottom: '0.5rem' }}>Sua Chave Privada EVM (0x... - Cuidado: Não é armazenada!):</label>
                <input type="password" id="privateKey" value={privateKeyInput} onChange={(e) => setPrivateKeyInput(e.target.value as Hex)} placeholder="0x..." style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }} />
                <p style={{ fontSize: '0.8rem', color: 'red', marginTop: '0.25rem' }}>AVISO: Inserir sua chave privada é um risco de segurança. Não use em produção.</p>
            </div>
            <button onClick={handleDecrypt} disabled={isLoading || !connectedAccount || !recordIdInput || !privateKeyInput} style={{ padding: '0.8rem 1.5rem', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', opacity: (isLoading || !connectedAccount || !recordIdInput || !privateKeyInput) ? 0.6 : 1 }} >
                {isLoading ? 'Buscando Registro...' : 'Descriptografar Registro'}
            </button>
            {decryptionError && (<div style={{ color: 'red', marginTop: '1rem' }}><p>Erro: {decryptionError}</p></div>)}
            {decryptedRecord && (
                <div style={{ marginTop: '1.5rem', backgroundColor: '#e9ffe9', padding: '1rem', borderRadius: '8px' }}>
                    <h3>Dados Descriptografados:</h3>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {decryptedRecord}
                    </pre>
                </div>
            )}
            {recordData && !decryptedRecord && !decryptionError && (
                <div style={{ marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
                    <h4>Dados do Registro (Criptografados na Blockchain):</h4>
                    <pre style={{ background: '#f8f8f8', padding: '10px', borderRadius: '5px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {JSON.stringify(recordData, replacer, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}