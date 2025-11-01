'use client';

import React, { JSX, useState, useEffect, useCallback } from "react";
import { 
    useWriteContract, 
    useWaitForTransactionReceipt, 
    useReadContract, 
    useAccount, 
    useSignMessage,
    type BaseError 
} from "wagmi";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Address, keccak256, toBytes, Hex, recoverPublicKey, isAddress } from "viem";
import { encryptECIES } from "@/utils/cripto.utils";

const STUDENT_PK_RECOVERY_MESSAGE = "Derive your Public Key for ECIES Encryption (Student)";
const STUDENT_PK_MESSAGE_HASH = keccak256(toBytes(STUDENT_PK_RECOVERY_MESSAGE));

interface InstitutionContractData {
    institutionAddress: Address;
    publicKey: string;
}

interface PersonalInformation {
    name: string;
    document: string;
    salt: string;
}

export function AddStudentInformation(): JSX.Element { 
    const { primaryWallet } = useDynamicContext();
    const { address, isConnected } = useAccount();

    const [institutionAddress, setInstitutionAddress] = useState<Address | ''>(''); 
    const [name, setName] = useState("");
    const [document, setDocument] = useState("");
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [studentPublicKey, setStudentPublicKey] = useState<Hex | null>(null);
    const { 
        signMessage, 
        data: studentSignature, 
        isPending: isSigningStudentPK, 
        error: studentSignError 
    } = useSignMessage();

    const { data: hash, error: writeError, isPending: isTxPending, writeContract } = useWriteContract();
    const { isLoading: isTxConfirming, isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({ hash });

    const institutionAddressValid = isAddress(institutionAddress);

    const { 
        data: institutionData, 
        isLoading: isLoadingInst, 
        isError: isInstError, 
        error: instError,
        refetch: refetchInstitutionData
    } = useReadContract({
        ...wagmiContractConfig,
        functionName: 'getInstitution', 
        args: institutionAddressValid ? [institutionAddress] : undefined,
        query: { enabled: institutionAddressValid }
    });

    const recoverAndSetStudentPublicKey = useCallback(async (sig: Hex) => {
        if (!address) return;
        setStatus("Derivando chave pública do estudante da assinatura...");
        setError(null);
        try {
            const recoveredPK = await recoverPublicKey({ 
                hash: STUDENT_PK_MESSAGE_HASH, 
                signature: sig,
            });
            setStudentPublicKey(recoveredPK);
            setStatus("Chave pública do estudante derivada com sucesso!");
        } catch (err: any) {
            const msg = `Erro ao recuperar chave do estudante: ${err.message || String(err)}`;
            setStatus(null);
            setError(msg);
            console.error("ERRO ao recuperar PK do estudante via assinatura:", err);
        }
    }, [address]);

    useEffect(() => {
        if (studentSignature && !studentPublicKey) {
            recoverAndSetStudentPublicKey(studentSignature);
        }
    }, [studentSignature, studentPublicKey, recoverAndSetStudentPublicKey]);

    const handleDeriveStudentPublicKey = () => {
        if (!address || !isConnected || isSigningStudentPK) return;
        setError(null);
        setStatus("Aguardando confirmação na carteira para assinar mensagem e derivar sua Chave Pública...");
        signMessage({ message: STUDENT_PK_RECOVERY_MESSAGE });
    };

    const processAndAddInformation = async () => {
        if (!institutionAddressValid || !name || !document || !address || !studentPublicKey) {
            setError("Por favor, preencha todos os campos e derive sua chave pública.");
            setStatus(null);
            return;
        }

        setStatus(null);
        setError(null);
        setStatus("Iniciando processo criptográfico...");

        try {
            const instData = institutionData as InstitutionContractData;
            if (!instData || instData.publicKey.length < 132 || instData.publicKey === '0x') {
                throw new Error("Chave pública da Instituição não encontrada ou é inválida. Certifique-se que a instituição existe e tem uma PK registrada.");
            }
            
            const saltBytes = crypto.getRandomValues(new Uint8Array(16));
            const salt = Buffer.from(saltBytes).toString('hex');

            const personalInformation: PersonalInformation = { name, document, salt };
            const informationString = JSON.stringify(personalInformation);

            const publicHash = keccak256(toBytes(informationString)); 
            const mockAesKey = crypto.getRandomValues(new Uint8Array(32)); 
            const encryptedKeyForInstitution = await encryptECIES(mockAesKey, instData.publicKey as Hex);
            
            setStatus("Aguardando confirmação na carteira para adicionar informações...");
            
            writeContract({
                ...wagmiContractConfig,
                functionName: 'addStudentInformation',
                args: [
                    encryptedKeyForInstitution as Hex,
                    studentPublicKey,
                    publicHash,
                ]
            });

        } catch (err: any) {
            console.error("Error in AddStudentInformation:", err);
            const msg = `Falha ao adicionar informações: ${err.message || String(err)}`;
            setStatus(null);
            setError(msg);
        }
    };

    useEffect(() => {
        if (isTxConfirmed) {
            setStatus("Informação do estudante adicionada com sucesso!");
            setError(null);
            setInstitutionAddress('');
            setName('');
            setDocument('');
            setStudentPublicKey(null); 
        }
    }, [isTxConfirmed]);

    const isAddInfoDisabled = isTxPending || isLoadingInst || !isConnected || 
                              !institutionAddressValid ||
                              !studentPublicKey || isSigningStudentPK || !name || !document;

    return (
        <div style={{ marginTop: '1.5rem', border: '1px solid #007bff', padding: '1rem', borderRadius: '4px' }}>
            <h2>Adicionar Informação Pessoal do Estudante</h2>
            <p className="text-sm" style={{ marginBottom: '10px', color: 'gray' }}>
                Suas informações são cifradas para a instituição de auditoria e sua chave pública é registrada.
            </p>

            {!isConnected ? (
                <p style={{ color: 'orange' }}>⚠️ Conecte sua carteira para continuar.</p>
            ) : (
                <form className="form space-y-3">
                    {!studentPublicKey ? (
                        <button 
                            type="button" 
                            onClick={handleDeriveStudentPublicKey}
                            disabled={isSigningStudentPK || !isConnected}
                            style={{ padding: '0.5rem 1rem', backgroundColor: '#6f42c1', color: 'white', borderRadius: '4px', opacity: isSigningStudentPK ? 0.6 : 1 }}
                        >
                            {isSigningStudentPK ? "Assinando Mensagem..." : "1. Derivar Minha Chave Pública"}
                        </button>
                    ) : (
                        <p style={{ color: 'green', fontWeight: 'bold' }}>✅ Chave Pública Derivada: <code style={{ fontSize: '0.8em' }}>{studentPublicKey.substring(0, 10)}...</code></p>
                    )}

                    <input
                        type="text"
                        placeholder="Endereço da Instituição"
                        value={institutionAddress}
                        onChange={(e) => {
                            setInstitutionAddress(e.target.value as Address | ''); // Permite string vazia
                            setError(null);
                            setStatus(null);
                        }}
                        className="w-full p-2 border rounded"
                        disabled={!studentPublicKey}
                    />
                    {isLoadingInst && <p className="text-sm text-blue-500">Verificando chave da instituição...</p>}
                    {isInstError && <p className="text-sm text-red-500">Erro ao buscar chave da instituição: {(instError as any)?.shortMessage || instError?.message}</p>}
                    
                    {!institutionAddressValid && institutionAddress !== '' && (
                        <p className="text-sm text-red-500">⚠️ Endereço da instituição inválido.</p>
                    )}
                    {institutionAddressValid && !isLoadingInst && !isInstError && (!institutionData || (institutionData as InstitutionContractData).publicKey?.length < 132 || (institutionData as InstitutionContractData).publicKey === '0x') &&
                        <p className="text-sm text-red-500">⚠️ A instituição existe, mas não tem chave pública registrada.</p>
                    }

                    <input
                        type="text"
                        placeholder="Nome Completo"
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value);
                            setError(null);
                            setStatus(null);
                        }}
                        className="w-full p-2 border rounded"
                        disabled={!studentPublicKey}
                    />
                    <input
                        type="text"
                        placeholder="Documento"
                        value={document}
                        onChange={(e) => {
                            setDocument(e.target.value);
                            setError(null);
                            setStatus(null);
                        }}
                        className="w-full p-2 border rounded"
                        disabled={!studentPublicKey}
                    />
                    
                    <button 
                        type="button" 
                        onClick={processAndAddInformation}
                        disabled={isAddInfoDisabled}
                        style={{ padding: '0.5rem 1rem', backgroundColor: '#28a745', color: 'white', borderRadius: '4px', opacity: isAddInfoDisabled ? 0.6 : 1 }}
                    >
                        {isTxPending ? "Aguardando Confirmação..." : "2. Adicionar Informação do Estudante"}
                    </button>
                </form>
            )}

            {status && <p style={{ marginTop: '0.8rem', color: 'green', fontWeight: 'bold' }}>{status}</p>}
            {error && <p style={{ color: 'red', marginTop: '0.8rem' }}>Erro: {error}</p>}
            {studentSignError && <p style={{ color: 'red' }}>Erro na assinatura do estudante: {(studentSignError as BaseError).shortMessage || studentSignError.message}</p>}
            {writeError && <p style={{ color: 'red' }}>Erro na transação: {(writeError as BaseError).shortMessage || writeError.message}</p>}
        </div>
    );
}