// components/AllowAccessToAddress.tsx
"use client";

import React, { useCallback, useState } from "react";
import { useAccount, useWalletClient, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { isAddress, Address, Hex } from "viem";
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI";
import { useIsClient } from "../is-client";

import { encryptECIES, decryptECIES } from '../../utils/cripto.utils';
import * as CryptoJS from "crypto-js"; // Importar CryptoJS para o backup da chave do estudante

// Constantes para KDF (devem ser as mesmas usadas na geração do backup)
const KDF_ITERATIONS = 262144;
const KDF_KEY_SIZE = 256 / 8; // 32 bytes para AES-256

interface BackupFileContent {
    encryptedPrivateKey: string; // Chave privada criptografada em Base64
    salt: string;                // Salt usado no PBKDF2 em Hex
    kdfIterations: number;       // Número de iterações do PBKDF2
    iv: string;                  // Initialization Vector em Hex
}

export function AllowAccessToAddress() {
    const { address: connectedAddress, isConnected } = useAccount();
    const { data: walletClient } = useWalletClient();
    const publicClient = usePublicClient();
    const isClient = useIsClient();

    const [allowedAddress, setAllowedAddress] = useState<Address | "">("");
    const [internalStatusMessage, setInternalStatusMessage] = useState<string>("");
    // Alteramos para aceitar um arquivo de backup e senha
    const [studentBackupFile, setStudentBackupFile] = useState<File | null>(null);
    const [studentMasterPasswordDecrypt, setStudentMasterPasswordDecrypt] = useState<string>('');
    const [derivedStudentPrivateKey, setDerivedStudentPrivateKey] = useState<Hex | null>(null);
    const [isStudentPrivateKeyDerived, setIsStudentPrivateKeyDerived] = useState<boolean>(false);

    const { writeContractAsync, isPending: isWritePending } = useWriteContract();

    const allowedAddressValid = isAddress(allowedAddress);

    // Hook para ler a chave pública do recipiente (viewer)
    // Args: recipient (o allowedAddress), sender (o estudante conectado)
    const { data: recipientKey, isLoading: isRecipientKeyLoading, refetch: refetchRecipientKey } = useReadContract({
        ...wagmiContractConfig,
        functionName: 'retrieveRecipientEncrpytKey',
        args: allowedAddressValid && connectedAddress ? [allowedAddress, connectedAddress] : undefined,
        query: {
            enabled: false,
            staleTime: 0,
        },
    });

    // Hook para ler os dados do estudante (para obter selfEncryptedInformation)
    // Args: studentAddress (o estudante conectado)
    const { data: studentData, isLoading: isStudentDataLoading, refetch: refetchStudentData } = useReadContract({
        ...wagmiContractConfig,
        functionName: 'getStudent',
        args: connectedAddress ? [connectedAddress] : undefined, // O estudante atual é o conectado
        query: {
            enabled: false,
            staleTime: 0,
        },
    });

    // Função para derivar a chave privada do estudante a partir do backup
    const deriveStudentPrivateKey = useCallback(async (): Promise<Hex | null> => {
        if (!studentBackupFile || !studentMasterPasswordDecrypt) {
            setInternalStatusMessage("Por favor, faça upload do arquivo de backup do estudante e insira a senha mestra.");
            setIsStudentPrivateKeyDerived(false);
            return null;
        }
        if (studentMasterPasswordDecrypt.length < 12) {
            setInternalStatusMessage("A senha mestra do estudante deve ter pelo menos 12 caracteres.");
            setIsStudentPrivateKeyDerived(false);
            return null;
        }

        setInternalStatusMessage("Lendo arquivo de backup do estudante e derivando chave privada...");
        setIsStudentPrivateKeyDerived(false);
        setDerivedStudentPrivateKey(null);

        try {
            const fileContent = await studentBackupFile.text();
            const backupData: BackupFileContent = JSON.parse(fileContent);

            const { encryptedPrivateKey, salt, kdfIterations, iv } = backupData;

            if (kdfIterations !== KDF_ITERATIONS) {
                throw new Error(`As iterações do KDF no arquivo (${kdfIterations}) não correspondem ao esperado (${KDF_ITERATIONS}).`);
            }
            if (!iv || typeof iv !== 'string' || iv.length !== 32) {
                throw new Error("IV (Initialization Vector) não encontrado ou inválido no arquivo de backup.");
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
                throw new Error("Falha ao descriptografar a chave privada do estudante ou formato inválido.");
            }

            setDerivedStudentPrivateKey(decryptedPrivateKeyHex as Hex);
            setIsStudentPrivateKeyDerived(true);
            setInternalStatusMessage("Chave privada do estudante derivada com sucesso do arquivo e senha.");
            return decryptedPrivateKeyHex as Hex;

        } catch (err: any) {
            console.error("Erro ao derivar chave privada do estudante:", err);
            setInternalStatusMessage(`Falha ao derivar chave privada do estudante: ${err.message || String(err)}`);
            setDerivedStudentPrivateKey(null);
            setIsStudentPrivateKeyDerived(false);
            return null;
        }
    }, [studentBackupFile, studentMasterPasswordDecrypt]);


    const handleStudentFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        setStudentBackupFile(null);
        setDerivedStudentPrivateKey(null);
        setIsStudentPrivateKeyDerived(false);
        setInternalStatusMessage("");
        const file = event.target.files?.[0];
        if (file) {
            setStudentBackupFile(file);
        }
    };


    const allowAccessToAddress = async () => {
        setInternalStatusMessage("");

        if (!isConnected || !connectedAddress) {
            setInternalStatusMessage("Por favor, conecte sua carteira.");
            return;
        }
        if (!allowedAddressValid) {
            setInternalStatusMessage("Por favor, insira um endereço de destinatário válido.");
            return;
        }

        let currentStudentPrivateKey = derivedStudentPrivateKey;
        if (!isStudentPrivateKeyDerived || !currentStudentPrivateKey) {
            setInternalStatusMessage("Iniciando derivação da sua chave privada...");
            currentStudentPrivateKey = await deriveStudentPrivateKey();
            if (!currentStudentPrivateKey) {
                // Mensagem de erro já é definida dentro de deriveStudentPrivateKey
                return;
            }
        }


        if (!isClient) {
            setInternalStatusMessage("Aguarde, o ambiente do cliente ainda não está pronto.");
            return;
        }

        try {
            // 1. Obter a chave pública do recipiente (viewer)
            setInternalStatusMessage("Buscando chave pública do destinatário (visitante)...");
            const recipientKeyResponse = await refetchRecipientKey();
            const retrievedRecipientKey = recipientKeyResponse.data as Hex | undefined;

            if (!retrievedRecipientKey || retrievedRecipientKey === '0x') {
                setInternalStatusMessage("Não foi possível obter a chave pública do destinatário. Verifique se o endereço permitido existe e solicitou acesso.");
                return;
            }

            // 2. Obter a `selfEncryptedInformation` do estudante conectado
            setInternalStatusMessage("Buscando suas informações criptografadas (do estudante)...");
            const studentDataResponse = await refetchStudentData();
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
                setInternalStatusMessage(`Falha na descriptografia de seus dados: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}. Verifique sua chave privada.`);
                return;
            }

            // 3. Re-criptografar a informação bruta para o `recipientKey` (chave pública do visitante)
            setInternalStatusMessage("Criptografando informações para o destinatário (visitante) com sua chave pública...");
            const encryptedValue = await encryptECIES(studentInformation, retrievedRecipientKey);

            // 4. Enviar a transação para o contrato
            // function addEncryptedInfoWithRecipientKey(Address _recipient, Address _student, bytes calldata _encryptedInfo)
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
                // Não limpar a chave privada derivada para evitar que o usuário precise fazer upload novamente imediatamente,
                // mas é uma decisão de UX. Para máxima segurança, limpar após o uso.
                // setStudentBackupFile(null);
                // setStudentMasterPasswordDecrypt('');
                // setDerivedStudentPrivateKey(null);
                // setIsStudentPrivateKeyDerived(false);
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

    const isDisabled = !isClient || !isConnected || !allowedAddressValid || isWritePending ||
                       !studentBackupFile || studentMasterPasswordDecrypt.length < 12;

    return (
        <div className="allow-access-container" style={{ marginTop: '1.5rem', border: '1px solid #007bff', padding: '1rem', borderRadius: '4px' }}>
            <h2>Conceder Acesso à Informação Pessoal do Estudante</h2>
            <p className="text-sm" style={{ marginBottom: '10px', color: 'gray' }}>
                Como estudante, você pode conceder acesso ao seu histórico para um visitante.
                Insira o endereço do visitante, faça upload do seu próprio arquivo de backup de chave privada e sua senha mestra.
                O visitante deve ter solicitado acesso previamente para que sua chave pública esteja disponível.
            </p>

            {!isConnected || !connectedAddress ? (
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

                    {/* Upload do Arquivo de Chave Privada do Estudante */}
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
                        {studentBackupFile && <p className="text-sm text-gray-600 mt-1">Arquivo selecionado: {studentBackupFile.name}</p>}
                    </div>

                    {/* Senha Mestra do Estudante */}
                    <div style={{ marginBottom: '1rem' }}>
                        <label htmlFor="studentMasterPasswordDecrypt" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Sua Senha Mestra (do Estudante, para descriptografar seu backup):
                        </label>
                        <input
                            id="studentMasterPasswordDecrypt"
                            type="password"
                            value={studentMasterPasswordDecrypt}
                            onChange={(e) => setStudentMasterPasswordDecrypt(e.target.value)}
                            placeholder="Mínimo 12 caracteres"
                            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fffbe6' }}
                            required
                            disabled={isWritePending}
                            autoComplete="off"
                        />
                        {studentMasterPasswordDecrypt.length > 0 && studentMasterPasswordDecrypt.length < 12 && (
                            <p className="text-sm text-red-500 mt-1">⚠️ Sua senha mestra deve ter pelo menos 12 caracteres.</p>
                        )}
                    </div>

                    {isStudentPrivateKeyDerived && !internalStatusMessage.includes('Falha') && !internalStatusMessage.includes('Erro') && !isWritePending && (
                        <p style={{ color: 'green', marginTop: '0.8rem' }}>✅ Sua chave privada derivada com sucesso.</p>
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

            {internalStatusMessage && (
                <p className={`status-message ${internalStatusMessage.includes('Falha') || internalStatusMessage.includes('Erro') || internalStatusMessage.includes('rejeitada') ? 'text-red-500' : 'text-green-700'}`}
                    style={{ marginTop: '0.8rem', fontWeight: 'bold' }}>
                    {internalStatusMessage}
                </p>
            )}
        </div>
    );
}