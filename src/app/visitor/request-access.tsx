// components/RequestAccess.tsx
"use client";

import React, { useState, useCallback } from "react";
import { useAccount, useWalletClient, usePublicClient, useWriteContract } from "wagmi";
import { isAddress, Address, Hex } from "viem";
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI";
import { useIsClient } from "../is-client";

import * as secp from "@noble/secp256k1";
import { hexToBytes, bytesToHex, keccak256 } from "viem";
import * as CryptoJS from "crypto-js";

// Constantes para KDF (devem ser as mesmas usadas na geração do backup)
const KDF_ITERATIONS = 262144;
const KDF_KEY_SIZE = 256 / 8; // 32 bytes para AES-256

interface BackupFileContent {
    encryptedPrivateKey: string; // Chave privada criptografada em Base64
    salt: string;                // Salt usado no PBKDF2 em Hex
    kdfIterations: number;       // Número de iterações do PBKDF2
    iv: string;                  // Initialization Vector em Hex
}

export function RequestAccess() {
    const { address: connectedAddress, isConnected } = useAccount();
    const { data: walletClient } = useWalletClient();
    const publicClient = usePublicClient();
    const isClient = useIsClient();

    const [studentAddress, setStudentAddress] = useState<Address | "">("");
    const [internalStatusMessage, setInternalStatusMessage] = useState<string>("");
    const [generatedPrivateKey, setGeneratedPrivateKey] = useState<Hex | null>(null);
    const [generatedPublicKey, setGeneratedPublicKey] = useState<Hex | null>(null);
    const [masterPasswordGenerate, setMasterPasswordGenerate] = useState<string>(''); // Senha para criptografar o backup
    const [backupFileContent, setBackupFileContent] = useState<string | null>(null);

    const { writeContractAsync, isPending } = useWriteContract();

    const studentAddressValid = isAddress(studentAddress);

    const generateAndEncryptKey = useCallback(async () => {
        setInternalStatusMessage("");
        setGeneratedPrivateKey(null);
        setGeneratedPublicKey(null);
        setBackupFileContent(null);

        if (masterPasswordGenerate.length < 12) {
            setInternalStatusMessage("A senha mestra para geração da chave deve ter pelo menos 12 caracteres.");
            return;
        }

        try {
            setInternalStatusMessage("Gerando novo par de chaves e preparando backup...");
            // Gera uma chave privada aleatória
            const privateKeyBytes = secp.utils.randomSecretKey();
            const privateKeyHex = bytesToHex(privateKeyBytes) as Hex;

            // Deriva a chave pública não comprimida para ECIES
            const publicKeyBytes = secp.getPublicKey(privateKeyBytes, false);
            const publicKeyHex = bytesToHex(publicKeyBytes) as Hex;

            setGeneratedPrivateKey(privateKeyHex);
            setGeneratedPublicKey(publicKeyHex);

            // --- Criptografar a chave privada para backup ---
            const saltBytes = window.crypto.getRandomValues(new Uint8Array(16)); // 16 bytes para salt
            // CORREÇÃO AQUI: Remover o prefixo '0x' ao converter para Hex para o backup
            const saltHex = bytesToHex(saltBytes).substring(2);

            const ivBytes = window.crypto.getRandomValues(new Uint8Array(16)); // 16 bytes para IV
            // CORREÇÃO AQUI: Remover o prefixo '0x' ao converter para Hex para o backup
            const ivHex = bytesToHex(ivBytes).substring(2);

            const saltKDF = CryptoJS.enc.Hex.parse(saltHex);
            const ivCipher = CryptoJS.enc.Hex.parse(ivHex);

            // Derivar a chave simétrica para AES-256
            const keyKDF = CryptoJS.PBKDF2(masterPasswordGenerate, saltKDF, {
                keySize: KDF_KEY_SIZE / 4, // keySize em Words, não bytes
                iterations: KDF_ITERATIONS,
            });

            // Criptografar a chave privada gerada
            const encryptedWords = CryptoJS.AES.encrypt(privateKeyHex, keyKDF, {
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7,
                iv: ivCipher,
            });

            const encryptedPrivateKeyBase64 = encryptedWords.toString();

            const backupData: BackupFileContent = {
                encryptedPrivateKey: encryptedPrivateKeyBase64,
                salt: saltHex, // Agora sem '0x'
                kdfIterations: KDF_ITERATIONS,
                iv: ivHex,     // Agora sem '0x'
            };

            const jsonBackup = JSON.stringify(backupData, null, 2);
            setBackupFileContent(jsonBackup);
            setInternalStatusMessage("Par de chaves gerado e chave privada criptografada para backup. Salve seu arquivo de backup!");

        } catch (error: any) {
            console.error("Erro ao gerar chaves:", error);
            setInternalStatusMessage(`Falha ao gerar par de chaves: ${error.message || String(error)}`);
        }
    }, [masterPasswordGenerate]);

    const handleDownloadBackup = () => {
        if (backupFileContent) {
            const blob = new Blob([backupFileContent], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `viewer_private_key_backup_${connectedAddress?.slice(0, 6) || "unknown"}_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setInternalStatusMessage("Arquivo de backup da chave privada baixado com sucesso! Guarde-o em segurança.");
        }
    };

    const requestAccess = async () => {
        setInternalStatusMessage("");

        if (!isConnected || !connectedAddress) {
            setInternalStatusMessage("Por favor, conecte sua carteira.");
            return;
        }
        if (!studentAddressValid) {
            setInternalStatusMessage("Por favor, insira um endereço de estudante válido.");
            return;
        }
        if (!generatedPublicKey) {
            setInternalStatusMessage("Por favor, gere um par de chaves antes de solicitar acesso.");
            return;
        }

        if (!isClient) {
            setInternalStatusMessage("Aguarde, o ambiente do cliente ainda não está pronto.");
            return;
        }

        try {
            setInternalStatusMessage("Enviando solicitação de acesso com sua chave pública...");
            const txHash = await writeContractAsync({
                ...wagmiContractConfig,
                functionName: 'requestAccess',
                args: [studentAddress, generatedPublicKey],
                account: connectedAddress,
            });

            setInternalStatusMessage(`Transação enviada: ${txHash}. Aguardando confirmação...`);

            const receipt = await publicClient?.waitForTransactionReceipt({ hash: txHash });

            if (receipt?.status === 'success') {
                setInternalStatusMessage("Solicitação de acesso à informação do estudante adicionada com sucesso! O estudante agora precisa aprovar sua solicitação.");
                setStudentAddress("");
                setMasterPasswordGenerate("");
                // Manter generatedPrivateKey/PublicKey para que o usuário possa baixar o backup.
            } else {
                setInternalStatusMessage("Falha na transação. Status: " + receipt?.status);
            }

        } catch (error: any) {
            console.error("Erro na RequestAccess:", error);
            let errorMessage = "Falha ao solicitar informações do estudante.";
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

    const isRequestAccessDisabled = !isClient || !isConnected || !studentAddressValid || isPending || !generatedPublicKey;
    const isGenerateKeyDisabled = !isClient || isPending || masterPasswordGenerate.length < 12;

    return (
        <div className="request-access-container" style={{ marginTop: '1.5rem', border: '1px solid #007bff', padding: '1rem', borderRadius: '4px' }}>
            <h2>Solicitar Acesso à Informação do Estudante (como Visitante)</h2>
            <p className="text-sm" style={{ marginBottom: '10px', color: 'gray' }}>
                Gere um novo par de chaves, salve o backup da sua chave privada e, em seguida, solicite acesso aos registros de um estudante enviando sua chave pública.
                O estudante precisará aprovar sua solicitação.
            </p>

            {!isConnected || !connectedAddress ? (
                <p style={{ color: 'orange', marginBottom: '1rem' }}>⚠️ Conecte sua carteira para solicitar acesso.</p>
            ) : (
                <form className="form space-y-3" onSubmit={(e) => e.preventDefault()}>
                    {/* Input do Endereço do Estudante */}
                    <input
                        type="text"
                        placeholder="Endereço do Estudante (0x...)"
                        value={studentAddress}
                        onChange={(e) => {
                            setStudentAddress(e.target.value as Address);
                            setInternalStatusMessage("");
                        }}
                        className="w-full p-2 border rounded"
                        disabled={isPending}
                    />
                    {!studentAddressValid && studentAddress !== '' && (
                        <p className="text-sm text-red-500">⚠️ Endereço do estudante inválido.</p>
                    )}

                    {/* Senha Mestra para Geração e Criptografia da Chave */}
                    <div style={{ marginTop: '1rem' }}>
                        <label htmlFor="masterPasswordGenerate" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Senha Mestra para Criptografar seu Backup de Chave Privada:
                        </label>
                        <input
                            id="masterPasswordGenerate"
                            type="password"
                            value={masterPasswordGenerate}
                            onChange={(e) => setMasterPasswordGenerate(e.target.value)}
                            placeholder="Mínimo 12 caracteres"
                            className="w-full p-2 border rounded"
                            required
                            disabled={isPending}
                            style={{ backgroundColor: '#fffbe6' }}
                            autoComplete="new-password"
                        />
                        {masterPasswordGenerate.length > 0 && masterPasswordGenerate.length < 12 && (
                            <p className="text-sm text-red-500 mt-1">⚠️ A senha mestra deve ter pelo menos 12 caracteres.</p>
                        )}
                    </div>

                    {/* Botão para Gerar Chaves */}
                    <button
                        type="button"
                        onClick={generateAndEncryptKey}
                        disabled={isGenerateKeyDisabled}
                        style={{ padding: '0.5rem 1rem', backgroundColor: '#28a745', color: 'white', borderRadius: '4px', opacity: isGenerateKeyDisabled ? 0.6 : 1, marginTop: '10px' }}
                    >
                        {isPending ? "Processando..." : (generatedPublicKey ? "Gerar Nova Chave" : "Gerar Par de Chaves e Backup")}
                    </button>

                    {/* Exibir chave pública gerada (para informação) */}
                    {generatedPublicKey && (
                        <div style={{ marginTop: '1rem', padding: '0.8rem', backgroundColor: '#e9ecef', borderRadius: '4px', wordBreak: 'break-all' }}>
                            <p><strong>Sua Chave Pública de Criptografia:</strong></p>
                            <p className="text-sm text-gray-700">{generatedPublicKey}</p>
                            <p className="text-sm text-green-700 mt-2">
                                ✅ Nova chave pública gerada. Esta chave será usada para sua solicitação de acesso.
                            </p>
                        </div>
                    )}

                    {/* Botão para baixar o arquivo de backup */}
                    {backupFileContent && (
                        <div style={{ marginTop: '1rem' }}>
                            <button
                                type="button"
                                onClick={handleDownloadBackup}
                                style={{ padding: '0.5rem 1rem', backgroundColor: '#007bff', color: 'white', borderRadius: '4px', opacity: isPending ? 0.6 : 1 }}
                                disabled={isPending}
                            >
                                Baixar Backup da Chave Privada (.json)
                            </button>
                            <p className="text-sm text-red-600 mt-1">
                                🚨 **ATENÇÃO:** Salve este arquivo em um local seguro. Ele contém sua chave privada criptografada.
                                Sem ele e sua senha mestra, você não poderá descriptografar os dados do estudante!
                            </p>
                        </div>
                    )}

                    {/* Botão para Solicitar Acesso */}
                    <button
                        type="button"
                        onClick={requestAccess}
                        disabled={isRequestAccessDisabled}
                        style={{ padding: '0.5rem 1rem', backgroundColor: '#6c757d', color: 'white', borderRadius: '4px', opacity: isRequestAccessDisabled ? 0.6 : 1, marginTop: '10px' }}
                    >
                        {isPending ? "Solicitando..." : "Solicitar Acesso ao Estudante"}
                    </button>
                </form>
            )}

            {internalStatusMessage && (
                <p className={`status-message ${internalStatusMessage.includes('Falha') || internalStatusMessage.includes('Erro') || internalStatusMessage.includes('rejeitada') || internalStatusMessage.includes('ATENÇÃO') ? 'text-red-500' : 'text-green-700'}`}
                    style={{ marginTop: '0.8rem', fontWeight: 'bold' }}>
                    {internalStatusMessage}
                </p>
            )}
        </div>
    );
}