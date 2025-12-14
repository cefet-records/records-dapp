// components/AllowAccessToAddress.tsx
"use client";

import React, { useCallback, useState, useEffect } from "react";
import { useAccount, useWalletClient, usePublicClient, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { isAddress, Address, Hex } from "viem";
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI";
import { useIsClient } from "../../app/is-client";

import { encryptECIES, decryptECIES } from '../../utils/cripto.utils'; // Assumindo o caminho correto
import * as CryptoJS from "crypto-js"; 

// Constantes para KDF (devem ser as mesmas usadas na geração do backup)
const KDF_ITERATIONS = 262144;
const KDF_KEY_SIZE = 256 / 8; // 32 bytes para AES-256

interface BackupFileContent {
    encryptedPrivateKey: string; 
    salt: string; 
    kdfIterations: number; 
    iv: string; 
}

// Prefixo da chave do Estudante no localStorage
const PREFIX_STUDENT = "studentEncryptedPrivateKey_";

// --- FUNÇÕES DE UTILIDADE PARA LOCALSTORAGE ---

const getStudentLocalStorageKey = (address: Address | undefined): string | undefined => {
    if (address && isAddress(address)) {
        return `${PREFIX_STUDENT}${address.toLowerCase()}`;
    }
    return undefined;
};

const loadStudentBackupFromLocalStorage = (address: Address): BackupFileContent | null => {
    const key = getStudentLocalStorageKey(address);
    if (!key) return null;
    const stored = localStorage.getItem(key);
    if (stored) {
        try {
            return JSON.parse(stored) as BackupFileContent;
        } catch (e) {
            console.error("Erro ao parsear backup do estudante do localStorage:", e);
            localStorage.removeItem(key); 
            return null;
        }
    }
    return null;
};
// --- FIM DAS FUNÇÕES DE UTILIDADE ---


export function AllowAccessToAddress() {
    const { address: connectedAddress, isConnected } = useAccount();
    const publicClient = usePublicClient();
    const isClient = useIsClient();

    const [allowedAddress, setAllowedAddress] = useState<Address | "">("");
    const [internalStatusMessage, setInternalStatusMessage] = useState<string>("");
    
    // Estado para o backup criptografado carregado do LS ou Upload
    const [encryptedStudentBackupData, setEncryptedStudentBackupData] = useState<BackupFileContent | null>(null); 
    const [studentMasterPasswordDecrypt, setStudentMasterPasswordDecrypt] = useState<string>('');
    const [derivedStudentPrivateKey, setDerivedStudentPrivateKey] = useState<Hex | null>(null);
    const [isStudentPrivateKeyDerived, setIsStudentPrivateKeyDerived] = useState<boolean>(false);

    const { writeContractAsync, isPending: isWritePending } = useWriteContract();

    const allowedAddressValid = isAddress(allowedAddress);
    const connectedAddressValid = isConnected && connectedAddress;

    // --- HOOKs useReadContract ---
    const { data: recipientKey, refetch: refetchRecipientKey } = useReadContract({
        ...wagmiContractConfig,
        functionName: 'retrieveRecipientEncrpytKey',
        args: allowedAddressValid && connectedAddress ? [allowedAddress, connectedAddress] : undefined,
        query: { enabled: false, staleTime: 0 },
    });

    // O retorno deste hook é a struct Student, com campos nomeados (studentAddress, selfEncryptedInformation, etc.)
    const { data: studentData, refetch: refetchStudentData } = useReadContract({
        ...wagmiContractConfig,
        functionName: 'getStudent',
        args: connectedAddress ? [connectedAddress] : undefined, 
        query: { enabled: false, staleTime: 0 },
    });
    
    // --- EFEITO: Carregar Backup do Estudante Conectado ---
    useEffect(() => {
        setEncryptedStudentBackupData(null);
        setDerivedStudentPrivateKey(null);
        setIsStudentPrivateKeyDerived(false);
        setInternalStatusMessage("");

        if (connectedAddressValid) {
            const loadedData = loadStudentBackupFromLocalStorage(connectedAddress);
            if (loadedData) {
                setEncryptedStudentBackupData(loadedData);
                setInternalStatusMessage("Backup criptografado da sua chave privada carregado do navegador. Insira a senha mestra.");
            } else {
                setInternalStatusMessage("Backup da sua chave privada NÃO ENCONTRADO no navegador. Por favor, faça o upload do arquivo de backup (.json).");
            }
        }
    }, [connectedAddressValid, connectedAddress]);


    // --- Função: Carregar Backup do Upload (Se o LS falhar) ---
    const handleStudentFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        setEncryptedStudentBackupData(null);
        setDerivedStudentPrivateKey(null);
        setIsStudentPrivateKeyDerived(false);
        setInternalStatusMessage("");

        const file = event.target.files?.[0];
        if (file) {
             try {
                const fileContent = await file.text();
                const backupData: BackupFileContent = JSON.parse(fileContent);
                if (!backupData.encryptedPrivateKey || !backupData.salt || !backupData.iv) {
                     throw new Error("Arquivo JSON de backup inválido.");
                }
                setEncryptedStudentBackupData(backupData);
                setInternalStatusMessage("Arquivo de backup carregado. Por favor, insira a senha mestra.");
            } catch (err: any) {
                console.error("Erro ao ler/parsear arquivo:", err);
                setInternalStatusMessage(`Erro ao carregar arquivo: ${err.message || String(err)}`);
            }
        }
    };


    // --- Função para derivar a chave privada do estudante a partir do backup (JSON) ---
    const deriveStudentPrivateKey = useCallback(async (backupData: BackupFileContent): Promise<Hex | null> => {
        if (!studentMasterPasswordDecrypt || studentMasterPasswordDecrypt.length < 12) {
            setInternalStatusMessage("A senha mestra do estudante deve ter pelo menos 12 caracteres.");
            setIsStudentPrivateKeyDerived(false);
            return null;
        }

        setInternalStatusMessage("Derivando chave privada do estudante...");
        setIsStudentPrivateKeyDerived(false);
        setDerivedStudentPrivateKey(null);

        try {
            const { encryptedPrivateKey, salt, kdfIterations, iv } = backupData;

            if (kdfIterations !== KDF_ITERATIONS) {
                throw new Error(`KDF do arquivo (${kdfIterations}) não corresponde ao esperado (${KDF_ITERATIONS}).`);
            }
            if (!iv || typeof iv !== 'string' || iv.length !== 32) {
                throw new Error("IV (Initialization Vector) inválido no backup.");
            }

            const saltKDF = CryptoJS.enc.Hex.parse(salt);
            const ivFromBackup = CryptoJS.enc.Hex.parse(iv);

            const keyKDF = CryptoJS.PBKDF2(studentMasterPasswordDecrypt, saltKDF, {
                keySize: KDF_KEY_SIZE / 4,
                iterations: kdfIterations,
            });

            const decryptedWords = CryptoJS.AES.decrypt(encryptedPrivateKey, keyKDF, {
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7,
                iv: ivFromBackup,
            });

            const decryptedPrivateKeyHex = decryptedWords.toString(CryptoJS.enc.Utf8);

            if (!decryptedPrivateKeyHex || !decryptedPrivateKeyHex.startsWith('0x') || decryptedPrivateKeyHex.length !== 66) {
                throw new Error("Falha ao descriptografar a chave privada do estudante (senha incorreta ou formato inválido).");
            }

            setDerivedStudentPrivateKey(decryptedPrivateKeyHex as Hex);
            setIsStudentPrivateKeyDerived(true);
            setInternalStatusMessage("Chave privada do estudante derivada com sucesso!");
            return decryptedPrivateKeyHex as Hex;

        } catch (err: any) {
            console.error("Erro ao derivar chave privada do estudante:", err);
            setInternalStatusMessage(`Falha ao derivar chave privada do estudante: ${err.message || String(err)}`);
            setDerivedStudentPrivateKey(null);
            setIsStudentPrivateKeyDerived(false);
            return null;
        }
    }, [studentMasterPasswordDecrypt]);


    const allowAccessToAddress = async () => {
        setInternalStatusMessage("");

        if (!connectedAddressValid || !allowedAddressValid || !encryptedStudentBackupData) {
             setInternalStatusMessage("Por favor, conecte-se, insira o endereço do visitante e carregue seu backup de chave privada.");
             return;
        }

        // 1. Derivar a chave privada, se necessário
        let currentStudentPrivateKey = derivedStudentPrivateKey;
        if (!isStudentPrivateKeyDerived || !currentStudentPrivateKey) {
            setInternalStatusMessage("Iniciando derivação da sua chave privada...");
            currentStudentPrivateKey = await deriveStudentPrivateKey(encryptedStudentBackupData);
            if (!currentStudentPrivateKey) {
                return; // O erro já é definido internamente
            }
        }
        
        if (!isClient) {
            setInternalStatusMessage("Aguarde, o ambiente do cliente ainda não está pronto.");
            return;
        }

        try {
            // 2. Obter a chave pública do recipiente (viewer)
            setInternalStatusMessage("Buscando chave pública do destinatário (visitante)...");
            const recipientKeyResponse = await refetchRecipientKey();
            const retrievedRecipientKey = recipientKeyResponse.data as Hex | undefined;

            if (!retrievedRecipientKey || retrievedRecipientKey === '0x') {
                setInternalStatusMessage("Não foi possível obter a chave pública do destinatário. Verifique se o endereço permitido existe e solicitou acesso.");
                return;
            }

            // 3. Obter a `selfEncryptedInformation` do estudante conectado
            setInternalStatusMessage("Buscando suas informações criptografadas (do estudante)...");
            const studentDataResponse = await refetchStudentData();
            
            // CORREÇÃO APLICADA AQUI: Acessa a propriedade nomeada, não o índice
            const studentSelfEncryptedInfo = studentDataResponse.data?.selfEncryptedInformation; 

            if (!studentSelfEncryptedInfo || studentSelfEncryptedInfo === '0x') {
                setInternalStatusMessage("Não foi possível obter suas informações criptografadas do contrato. Verifique se você já registrou seus dados.");
                return;
            }

            // Descriptografar a informação do estudante usando A CHAVE PRIVADA DO ESTUDANTE (derivada)
            setInternalStatusMessage("Descriptografando suas informações pessoais com sua chave privada...");
            let studentInformation: string;
            try {
                studentInformation = await decryptECIES(studentSelfEncryptedInfo, currentStudentPrivateKey);
            } catch (decryptError) {
                console.error("Erro ao descriptografar selfEncryptedInformation:", decryptError);
                setInternalStatusMessage(`Falha na descriptografia de seus dados: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}. Sua chave privada está incorreta?`);
                return;
            }

            // 4. Re-criptografar a informação bruta para o `recipientKey` (chave pública do visitante)
            setInternalStatusMessage("Criptografando informações para o destinatário (visitante) com sua chave pública...");
            const encryptedValue = await encryptECIES(studentInformation, retrievedRecipientKey);

            // 5. Enviar a transação para o contrato
            setInternalStatusMessage("Enviando transação para conceder acesso...");
            const txHash = await writeContractAsync({
                ...wagmiContractConfig,
                functionName: 'addEncryptedInfoWithRecipientKey',
                args: [allowedAddress, connectedAddress, encryptedValue],
                account: connectedAddress,
            });

            setInternalStatusMessage(`Transação enviada: ${txHash}. Aguardando confirmação...`);

            const receipt = await publicClient?.waitForTransactionReceipt({ hash: txHash });

            if (receipt?.status === 'success') {
                setInternalStatusMessage("Acesso concedido com sucesso ao endereço do visitante!");
                setAllowedAddress("");
            } else {
                setInternalStatusMessage("Falha na transação. Status: " + receipt?.status);
            }

        } catch (error: any) {
            console.error("Erro ao conceder acesso:", error);
            let errorMessage = "Falha ao conceder acesso ao endereço. Verifique o console para mais detalhes.";
            if (error.message.includes("User rejected the request")) {
                errorMessage = "Transação rejeitada pelo usuário.";
            } else if (error.cause?.shortMessage) {
                errorMessage = error.cause.shortMessage;
            } else if (error.message) {
                errorMessage = error.message;
            }
            setInternalStatusMessage(errorMessage);
        }
    };

    const isDisabled = !isClient || !connectedAddressValid || !allowedAddressValid || isWritePending ||
                        !encryptedStudentBackupData || studentMasterPasswordDecrypt.length < 12;

    const showUploadField = !encryptedStudentBackupData;

    return (
        <div className="allow-access-container" style={{ marginTop: '1.5rem', border: '1px solid #007bff', padding: '1rem', borderRadius: '4px' }}>
            <h2>Conceder Acesso à Informação Pessoal do Estudante</h2>
            {/* <p className="text-sm" style={{ marginBottom: '10px', color: 'gray' }}>
                Como estudante, você usa **sua própria chave privada** para descriptografar seus dados e re-criptografá-los para o visitante. O backup da sua chave é carregado automaticamente.
            </p> */}

            {!connectedAddressValid ? (
                <p style={{ color: 'orange', marginBottom: '1rem' }}>⚠️ Conecte sua carteira (do estudante) para conceder acesso.</p>
            ) : (
                <form className="form space-y-3" onSubmit={(e) => e.preventDefault()}>
                    {/* Input do Endereço do Visitante */}
                    <input
                        type="text"
                        placeholder="Endereço do Visitante (0x...)"
                        value={allowedAddress}
                        onChange={(e) => {
                            setAllowedAddress(e.target.value as Address);
                            setInternalStatusMessage("");
                        }}
                        className="w-full p-2 border rounded"
                        disabled={isWritePending}
                    />
                    {!allowedAddressValid && allowedAddress !== '' && (
                        <p className="text-sm text-red-500">⚠️ Endereço do visitante inválido.</p>
                    )}
                    
                    {/* Upload do Arquivo de Chave Privada do Estudante (Condicional) */}
                    {showUploadField && (
                        <div style={{ marginTop: '1rem' }}>
                            <label htmlFor="studentBackupFile" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                                Seu Arquivo de Chave Privada Criptografada (.json) (Estudante):
                            </label>
                            <input
                                id="studentBackupFile"
                                type="file"
                                accept=".json"
                                onChange={handleStudentFileChange}
                                className="w-full p-2 border rounded"
                                disabled={isWritePending}
                                style={{ backgroundColor: '#fffbe6' }}
                            />
                            <p className="text-sm text-red-500 mt-1">⚠️ Backup da sua chave privada não foi encontrado no navegador. Faça o upload do arquivo.</p>
                        </div>
                    )}
                    
                    {/* Senha Mestra do Estudante */}
                    <div style={{ marginBottom: '1rem' }}>
                        <label htmlFor="studentMasterPasswordDecrypt" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Senha:
                        </label>
                        <input
                            id="studentMasterPasswordDecrypt"
                            type="password"
                            value={studentMasterPasswordDecrypt}
                            onChange={(e) => setStudentMasterPasswordDecrypt(e.target.value)}
                            placeholder="Mínimo 12 caracteres"
                            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fffbe6' }}
                            required
                            disabled={isWritePending || !encryptedStudentBackupData}
                            autoComplete="off"
                        />
                        {/* {encryptedStudentBackupData && !showUploadField && (
                            <p className="text-sm text-green-500 mt-1">
                                ✅ Backup da sua chave carregado do navegador. Digite a senha para descriptografar.
                            </p>
                        )} */}
                        {studentMasterPasswordDecrypt.length > 0 && studentMasterPasswordDecrypt.length < 12 && (
                            <p className="text-sm text-red-500 mt-1">⚠️ Sua senha mestra deve ter pelo menos 12 caracteres.</p>
                        )}
                    </div>

                    {isStudentPrivateKeyDerived && !internalStatusMessage.includes('Falha') && !internalStatusMessage.includes('Erro') && !isWritePending && (
                        <p style={{ color: 'green', marginTop: '0.8rem' }}>✅ Sua chave privada derivada com sucesso. Pronto para conceder acesso.</p>
                    )}

                    {/* Botão para Conceder Acesso */}
                    <button
                        type="button"
                        onClick={allowAccessToAddress}
                        disabled={isDisabled}
                        style={{ padding: '0.5rem 1rem', backgroundColor: '#6c757d', color: 'white', borderRadius: '4px', opacity: isDisabled ? 0.6 : 1, marginTop: '10px' }}
                    >
                        {isWritePending ? "Enviando..." : "Conceder Acesso"}
                    </button>
                </form>
            )}

            {/* {internalStatusMessage && (
                <p className={`status-message ${internalStatusMessage.includes('Falha') || internalStatusMessage.includes('Erro') || internalStatusMessage.includes('rejeitada') ? 'text-red-500' : 'text-green-700'}`}
                    style={{ marginTop: '0.8rem', fontWeight: 'bold' }}>
                    {internalStatusMessage}
                </p>
            )} */}
        </div>
    );
}