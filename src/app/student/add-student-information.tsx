'use client';

import React, { JSX, useState, useEffect, useCallback } from "react";
import { 
    useWriteContract, 
    useWaitForTransactionReceipt, 
    useReadContract, 
    useAccount, 
    type BaseError 
} from "wagmi";
import * as secp from "@noble/secp256k1"; 
import { hexToBytes, bytesToHex, Address, Hex, isAddress, keccak256, toBytes } from "viem"; 
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { encryptECIES } from "@/utils/cripto.utils";
import { randomBytes } from "@noble/ciphers/utils.js";
import { Base64 } from 'js-base64'; // <<<<<<< IMPORTAR BASE64 AQUI

interface InstitutionContractData {
    institutionAddress: Address;
    publicKey: Hex;
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

    const [studentPrivateKeyInput, setStudentPrivateKeyInput] = useState<Hex | ''>(''); 
    const [studentPublicKey, setStudentPublicKey] = useState<Hex | null>(null); 

    const { data: hash, error: writeError, isPending: isTxPending, writeContract } = useWriteContract();
    const { isLoading: isTxConfirming, isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({ hash });

    const institutionAddressValid = isAddress(institutionAddress);

    const { 
        data: institutionData, 
        isLoading: isLoadingInst, 
        isError: isInstError, 
        error: instError,
    } = useReadContract({
        ...wagmiContractConfig,
        functionName: 'getInstitution', 
        args: institutionAddressValid ? [institutionAddress] : undefined,
        query: { enabled: institutionAddressValid, staleTime: 0 }
    });

    const [hasMounted, setHasMounted] = useState(false);

    useEffect(() => {
      setHasMounted(true);
    }, []);

    const deriveStudentPublicKeyFromPrivate = useCallback(() => {
        setError(null);
        if (!studentPrivateKeyInput || studentPrivateKeyInput.length !== 66) { 
            setError("Por favor, insira uma chave privada hexadecimal válida (64 caracteres + '0x') para o estudante.");
            setStudentPublicKey(null);
            return;
        }

        try {
            const privateKeyBytes = hexToBytes(studentPrivateKeyInput);
            const publicKeyBytes = secp.getPublicKey(privateKeyBytes, false); 
            const publicKeyHex = bytesToHex(publicKeyBytes) as Hex;

            setStudentPublicKey(publicKeyHex);
            setStatus("Chave pública do estudante derivada com sucesso da chave privada inserida!");
        } catch (err: any) {
            const msg = `Erro ao derivar chave pública do estudante da chave privada: ${err.message || String(err)}`;
            setError(msg);
            setStatus(msg);
            console.error("ERRO ao derivar PK do estudante da chave privada:", err);
            setStudentPublicKey(null);
        }
    }, [studentPrivateKeyInput]);

    const addStudentInformation = async () => {
        if (!institutionAddressValid || !name || !document || !address || !isConnected || !studentPublicKey) {
            setError("Por favor, preencha todos os campos, conecte sua carteira e derive sua chave pública.");
            setStatus(null);
            return;
        }

        setStatus(null);
        setError(null);
        setStatus("Iniciando processo criptográfico...");

        try {
            const saltBytes = randomBytes(16); 
            const salt = bytesToHex(saltBytes); 
            const personalInformation: PersonalInformation = { name, document, salt };
            const informationString = JSON.stringify(personalInformation);

            // publicHash ANTES da criptografia, a partir da informação em texto plano
            const publicHashHex = keccak256(toBytes(informationString)); 

            const instData = institutionData as InstitutionContractData;
            if (!instData || instData.publicKey.length < 132 || instData.publicKey === '0x') {
                throw new Error("Chave pública da Instituição não encontrada ou é inválida. Certifique-se que a instituição existe e tem uma PK registrada.");
            }
            // A chave pública da instituição vem do contrato como Hex, conforme a interface
            const institutionPublicKeyHex = instData.publicKey;

            console.log("Public Key do Estudante (Hex):", studentPublicKey);
            console.log("Public key da Instituição (Hex):", institutionPublicKeyHex);

            // encryptECIES AGORA RETORNA STRING BASE64
            const encryptedForSelfBase64 = await encryptECIES(informationString, studentPublicKey);
            const encryptedForInstitutionBase64 = await encryptECIES(informationString, institutionPublicKeyHex);
            
            console.log("Criptografado para Estudante (Base64):", encryptedForSelfBase64);
            console.log("Criptografado para Instituição (Base64):", encryptedForInstitutionBase64);

            // <<<<<<<<<<<<<<<< CORREÇÕES ADICIONADAS AQUI >>>>>>>>>>>>>>>>>>>>>>>
            // Converter studentPublicKey (Hex) para Base64
            const studentPublicKeyBytes = hexToBytes(studentPublicKey);
            const studentPublicKeyBase64 = Base64.fromUint8Array(studentPublicKeyBytes);

            const publicHashBytes = hexToBytes(publicHashHex);
            const publicHashBase64 = Base64.fromUint8Array(publicHashBytes);
            setStatus("Aguardando confirmação na carteira para adicionar informações...");
            writeContract({
                ...wagmiContractConfig,
                functionName: 'addStudentInformation',
                args: [
                    encryptedForSelfBase64,           // STRING Base64
                    encryptedForInstitutionBase64,    // STRING Base64
                    studentPublicKeyBase64,           // STRING Base64 (corrigido)
                    publicHashBase64,                 // STRING Base64 (corrigido)
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
            setStudentPrivateKeyInput(''); 
        }
    }, [isTxConfirmed]);

    const isAddInfoDisabled = isTxPending || isLoadingInst || !isConnected || 
                                !institutionAddressValid || !name || !document || !studentPublicKey; 
    
    const isInstitutionPublicKeyInvalid = institutionAddressValid && !isLoadingInst && !isInstError && 
                                          (!institutionData || (institutionData as InstitutionContractData).publicKey?.length < 132 || (institutionData as InstitutionContractData).publicKey === '0x');

    if (!hasMounted) {
      return <></>; 
    }

    return (
        <div style={{ marginTop: '1.5rem', border: '1px solid #007bff', padding: '1rem', borderRadius: '4px' }}>
            <h2>Adicionar Informação Pessoal do Estudante</h2>
            <p className="text-sm" style={{ marginBottom: '10px', color: 'gray' }}>
                Suas informações são cifradas para você e para a instituição de auditoria. Sua chave pública de encriptação é registrada.
            </p>

            {!isConnected ? (
                <p style={{ color: 'orange' }}>⚠️ Conecte sua carteira para continuar.</p>
            ) : (
                <form className="form space-y-3">
                    {/* NOVO: Input para a chave privada do estudante */}
                    <div style={{ marginBottom: '1rem' }}>
                        <label htmlFor="studentPrivateKey" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Sua Chave Privada (Estudante - Hex):
                        </label>
                        <input
                            id="studentPrivateKey"
                            type="text"
                            value={studentPrivateKeyInput}
                            onChange={(e) => setStudentPrivateKeyInput(e.target.value as Hex)}
                            placeholder="Ex: 0xseu_estudante_private_key_aqui"
                            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
                            disabled={!!studentPublicKey} 
                        />
                        <button
                            type="button" 
                            onClick={deriveStudentPublicKeyFromPrivate}
                            disabled={!studentPrivateKeyInput || studentPrivateKeyInput.length !== 66 || !!studentPublicKey} 
                            style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', backgroundColor: '#6f42c1', color: 'white', borderRadius: '4px', opacity: (!studentPrivateKeyInput || studentPrivateKeyInput.length !== 66 || !!studentPublicKey) ? 0.6 : 1 }}
                        >
                            Derivar Minha Chave Pública (do Estudante)
                        </button>
                    </div>

                    {/* Exibe a chave pública do estudante se estiver disponível */}
                    {studentPublicKey && (
                        <p style={{ color: 'green', fontWeight: 'bold' }}>✅ Chave Pública Derivada: <code style={{ fontSize: '0.8em', wordBreak: 'break-all' }}>{studentPublicKey}</code></p>
                    )}

                    <input
                        type="text"
                        placeholder="Endereço da Instituição"
                        value={institutionAddress}
                        onChange={(e) => {
                            setInstitutionAddress(e.target.value as Address | '');
                            setError(null);
                            setStatus(null);
                        }}
                        className="w-full p-2 border rounded"
                        disabled={!studentPublicKey}
                    />
                    {isLoadingInst && <p className="text-sm text-blue-500">Verificando chave da instituição...</p>}
                    {isInstError && <p className="text-sm text-red-500">Erro ao buscar chave da instituição: {(instError as unknown as BaseError)?.shortMessage || instError?.message}</p>}
                    
                    {!institutionAddressValid && institutionAddress !== '' && (
                        <p className="text-sm text-red-500">⚠️ Endereço da instituição inválido.</p>
                    )}
                    {isInstitutionPublicKeyInvalid &&
                        <p className="text-sm text-red-500">⚠️ A instituição existe, mas não tem chave pública de encriptação registrada. Ou a chave é inválida.</p>
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
                        onClick={addStudentInformation}
                        disabled={isAddInfoDisabled || isInstitutionPublicKeyInvalid}
                        style={{ padding: '0.5rem 1rem', backgroundColor: '#28a745', color: 'white', borderRadius: '4px', opacity: (isAddInfoDisabled || isInstitutionPublicKeyInvalid) ? 0.6 : 1 }}
                    >
                        {isTxPending ? "Aguardando Confirmação..." : "Adicionar Informação do Estudante"}
                    </button>
                </form>
            )}

            {status && <p style={{ marginTop: '0.8rem', color: 'green', fontWeight: 'bold' }}>{status}</p>}
            {error && <p style={{ color: 'red', marginTop: '0.8rem' }}>Erro: {error}</p>}
            {writeError && <p style={{ color: 'red' }}>Erro na transação: {(writeError as unknown as BaseError).shortMessage || writeError.message}</p>}
        </div>
    );
}