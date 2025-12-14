"use client";

import React, { useState, useCallback, useEffect, FormEvent } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { isAddress, Address, Hex } from "viem";
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI";
import { useIsClient } from "../../app/is-client";

import * as secp from "@noble/secp256k1";
import { bytesToHex } from "viem";
import * as CryptoJS from "crypto-js";

// [INÍCIO DAS CONSTANTES E INTERFACES]
const KDF_ITERATIONS = 262144;
const KDF_KEY_SIZE = 256 / 8; // 32 bytes para AES-256

interface BackupFileContent {
  encryptedPrivateKey: string;
  salt: string;
  kdfIterations: number;
  iv: string;
}

// Interface para o estado dos erros de validação
interface PasswordValidation {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  specialChar: boolean;
}

// Chave de LocalStorage Única por Visitante/Endereço
const LOCAL_STORAGE_VIEWER_KEY_PREFIX = "viewerEncryptedPrivateKey_";

// --- FUNÇÕES DE UTILIDADE ---

const getViewerLocalStorageKey = (address: Address | undefined): string | undefined => {
  if (address && isAddress(address)) {
    return `${LOCAL_STORAGE_VIEWER_KEY_PREFIX}${address.toLowerCase()}`;
  }
  return undefined;
};

const saveViewerToLocalStorage = (address: Address, data: BackupFileContent) => {
  const key = getViewerLocalStorageKey(address);
  if (key) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      console.log(`Chave privada criptografada salva no localStorage para o Visitante ${address}.`);
    } catch (e) {
      console.error("Erro ao salvar no localStorage para o Visitante:", e);
    }
  }
};

const validateMasterPassword = (password: string): PasswordValidation => {
  return {
    length: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    specialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };
};
// [FIM DAS CONSTANTES E INTERFACES]


export function RequestAccess() {
  const { address: connectedAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const isClient = useIsClient();

  const [studentAddress, setStudentAddress] = useState<Address | "">("");
  const [internalStatusMessage, setInternalStatusMessage] = useState<string>("");
  const [generatedPrivateKey, setGeneratedPrivateKey] = useState<Hex | null>(null);
  const [generatedPublicKey, setGeneratedPublicKey] = useState<Hex | null>(null);
  const [masterPasswordGenerate, setMasterPasswordGenerate] = useState<string>('');
  const [backupFileContent, setBackupFileContent] = useState<string | null>(null); // Conteúdo JSON do backup
  const [isDownloadTriggered, setIsDownloadTriggered] = useState(false); // NOVO ESTADO

  const [isKeyInLocalStorage, setIsKeyInLocalStorage] = useState(false);
  const [passwordValidationErrors, setPasswordValidationErrors] = useState<PasswordValidation>(validateMasterPassword(''));

  const { writeContractAsync, isPending } = useWriteContract();

  const studentAddressValid = isAddress(studentAddress);
  const connectedAddressValid = connectedAddress && isAddress(connectedAddress);

  const isPasswordValid = Object.values(passwordValidationErrors).every(Boolean);

  // --- FUNÇÃO DE DOWNLOAD AUTOMÁTICO ---
  const triggerDownload = useCallback((jsonContent: string, currentAddress: Address) => {
    if (!isDownloadTriggered) {
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = window.document.createElement('a'); // Use window.document para evitar conflitos de escopo
      a.href = url;
      a.download = `viewer_private_key_backup_${currentAddress.slice(0, 6)}_${Date.now()}.json`;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setIsDownloadTriggered(true);
      setInternalStatusMessage("✅ Download do backup de chave privada disparado automaticamente. Guarde o arquivo em segurança!");
    }
  }, [isDownloadTriggered]);

  // Efeito para verificar se o backup já está no localStorage quando o usuário conecta
  useEffect(() => {
    if (connectedAddressValid && isClient) {
      const key = getViewerLocalStorageKey(connectedAddress);
      if (key && localStorage.getItem(key)) {
        setIsKeyInLocalStorage(true);
        setInternalStatusMessage("Chave privada criptografada encontrada no navegador. Gere uma nova ou use o botão Solicitar.");
      } else {
        setIsKeyInLocalStorage(false);
        setInternalStatusMessage("Gere um novo par de chaves para prosseguir.");
      }
    } else {
      setIsKeyInLocalStorage(false);
    }
  }, [connectedAddressValid, connectedAddress, isClient]);

  // Efeito para validação em tempo real
  useEffect(() => {
    setPasswordValidationErrors(validateMasterPassword(masterPasswordGenerate));
  }, [masterPasswordGenerate]);


  // Efeito para disparar o DOWNLOAD AUTOMÁTICO após a geração
  useEffect(() => {
    // Dispara o download se o conteúdo JSON estiver pronto E se não tiver sido disparado antes
    if (backupFileContent && connectedAddress && !isDownloadTriggered) {
      triggerDownload(backupFileContent, connectedAddress);
    }
  }, [backupFileContent, connectedAddress, triggerDownload]);


  const generateAndEncryptKey = useCallback(async () => {
    setInternalStatusMessage("");
    setGeneratedPrivateKey(null);
    setGeneratedPublicKey(null);
    setBackupFileContent(null);
    setIsDownloadTriggered(false);

    if (!connectedAddressValid) {
      setInternalStatusMessage("Por favor, conecte sua carteira para gerar a chave.");
      return;
    }

    if (!isPasswordValid) {
      setInternalStatusMessage("A senha mestra não atende a todos os requisitos de segurança.");
      return;
    }

    try {
      const currentAddress = connectedAddress as Address;
      setInternalStatusMessage("Gerando novo par de chaves e preparando backup...");

      // 1. Geração de Chaves
      const privateKeyBytes = secp.utils.randomSecretKey();
      const privateKeyHex = bytesToHex(privateKeyBytes) as Hex;

      const publicKeyBytes = secp.getPublicKey(privateKeyBytes, false);
      const publicKeyHex = bytesToHex(publicKeyBytes) as Hex;

      setGeneratedPrivateKey(privateKeyHex);
      setGeneratedPublicKey(publicKeyHex);

      // 2. Criptografar a chave privada para backup
      const saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
      const saltHex = bytesToHex(saltBytes).substring(2);

      const ivBytes = window.crypto.getRandomValues(new Uint8Array(16));
      const ivHex = bytesToHex(ivBytes).substring(2);

      const saltKDF = CryptoJS.enc.Hex.parse(saltHex);
      const ivCipher = CryptoJS.enc.Hex.parse(ivHex);

      const keyKDF = CryptoJS.PBKDF2(masterPasswordGenerate, saltKDF, {
        keySize: KDF_KEY_SIZE / 4,
        iterations: KDF_ITERATIONS,
      });

      const encryptedWords = CryptoJS.AES.encrypt(privateKeyHex, keyKDF, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        iv: ivCipher,
      });

      const encryptedPrivateKeyBase64 = encryptedWords.toString();

      const backupData: BackupFileContent = {
        encryptedPrivateKey: encryptedPrivateKeyBase64,
        salt: saltHex,
        kdfIterations: KDF_ITERATIONS,
        iv: ivHex,
      };

      // 3. Salvar no localStorage e definir o conteúdo JSON para download
      saveViewerToLocalStorage(currentAddress, backupData);
      setIsKeyInLocalStorage(true);

      const jsonBackup = JSON.stringify(backupData, null, 2);
      setBackupFileContent(jsonBackup); // Isso dispara o useEffect do download

      setInternalStatusMessage("Chave pública gerada e backup criptografado salvo localmente. Preparando download automático...");

    } catch (error: any) {
      console.error("Erro ao gerar chaves:", error);
      setInternalStatusMessage(`Falha ao gerar par de chaves: ${error.message || String(error)}`);
      setIsKeyInLocalStorage(false);
    }
  }, [masterPasswordGenerate, connectedAddressValid, connectedAddress, isPasswordValid, triggerDownload]);

  // NOTA: O handleDownloadBackup original não é mais necessário, pois o download é automático via useEffect

  const requestAccess = async () => {
    setInternalStatusMessage("");

    if (!connectedAddressValid || !studentAddressValid) {
      setInternalStatusMessage("Por favor, conecte sua carteira e insira um endereço de estudante válido.");
      return;
    }

    // Regra de Negócio: O usuário deve ter gerado a chave pública nesta sessão (ou ter o valor no state)
    if (!generatedPublicKey) {
      setInternalStatusMessage("🚨 ATENÇÃO: Você deve primeiro gerar um par de chaves (clique em 'Gerar Par de Chaves') e garantir que o backup foi baixado.");
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
        args: [studentAddress, generatedPublicKey], // Enviando a PK gerada
        account: connectedAddress,
      });

      setInternalStatusMessage(`Transação enviada: ${txHash}. Aguardando confirmação...`);

      const receipt = await publicClient?.waitForTransactionReceipt({ hash: txHash });

      if (receipt?.status === 'success') {
        setInternalStatusMessage("Solicitação de acesso à informação do estudante adicionada com sucesso! O estudante agora precisa aprovar sua solicitação. Recarregando a página...");

        // 🚨 MUDANÇA APLICADA AQUI: Recarregar a página após o sucesso da transação
        if (typeof window !== 'undefined') {
          window.location.reload();
        }

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

  const isRequestAccessDisabled = !isClient || !connectedAddressValid || !studentAddressValid || isPending || !generatedPublicKey;
  const isGenerateKeyDisabled = isPending || !isPasswordValid;

  const renderValidationItem = (isValid: boolean, message: string) => (
    <li style={{ color: isValid ? 'green' : 'red' }}>
      {isValid ? '✅' : '❌'} {message}
    </li>
  );

  return (
    <div className="request-access-container" style={{ marginTop: '1.5rem', border: '1px solid #007bff', padding: '1rem', borderRadius: '4px' }}>
      <h2>Solicitar Acesso à Informação do Estudante</h2>

      {!connectedAddressValid ? (
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
              Senha Mestra (para criptografar seu backup local):
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
              style={{ backgroundColor: isKeyInLocalStorage ? '#E0F7FA' : '#fffbe6' }}
              autoComplete="new-password"
            />
            {isKeyInLocalStorage && (
              <p className="text-sm text-blue-500 mt-1">
                Chave criptografada já está no navegador. Gere uma nova para garantir que você tem o backup correto.
              </p>
            )}
          </div>

          {/* --- FEEDBACK DE VALIDAÇÃO DE SENHA --- */}
          <div className="text-sm p-3 border rounded">
            <p className="font-semibold mb-1">Requisitos de Segurança da Senha:</p>
            <ul style={{ listStyleType: 'none', paddingLeft: 0 }}>
              {renderValidationItem(passwordValidationErrors.length, "Mínimo de 12 caracteres")}
              {renderValidationItem(passwordValidationErrors.uppercase, "Uma letra maiúscula")}
              {renderValidationItem(passwordValidationErrors.lowercase, "Uma letra minúscula")}
              {renderValidationItem(passwordValidationErrors.number, "Um número")}
              {renderValidationItem(passwordValidationErrors.specialChar, "Um caractere especial (!@#$...)")}
            </ul>
          </div>
          {/* ------------------------------------- */}


          {/* Botão para Gerar Chaves */}
          <button
            type="button"
            onClick={generateAndEncryptKey}
            disabled={isGenerateKeyDisabled}
            style={{ padding: '0.5rem 1rem', backgroundColor: '#28a745', color: 'white', borderRadius: '4px', opacity: isGenerateKeyDisabled ? 0.6 : 1, marginTop: '10px' }}
          >
            {isPending ? "Processando..." : (generatedPublicKey ? "Gerar Nova Chave" : "Gerar Par de Chaves e Backup Local")}
          </button>

          {/* Exibir chave pública gerada (para informação) */}
          {generatedPublicKey && (
            <div style={{ marginTop: '1rem', padding: '0.8rem', backgroundColor: '#e9ecef', borderRadius: '4px', wordBreak: 'break-all' }}>
              <p><strong>Sua Chave Pública de Criptografia:</strong></p>
              <p className="text-sm text-gray-700">{generatedPublicKey}</p>
              <p className="text-sm text-green-700 mt-2">
                ✅ Chave pública gerada e **backup criptografado salvo no seu navegador**. Você já pode solicitar o acesso.
              </p>
              {!isDownloadTriggered && backupFileContent && (
                <p className="text-sm text-yellow-700 font-bold mt-1">⚠️ O download automático foi iniciado. Verifique sua pasta de downloads.</p>
              )}
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
        <p className={`status-message ${internalStatusMessage.includes('Falha') || internalStatusMessage.includes('Erro') || internalStatusMessage.includes('ATENÇÃO') ? 'text-red-500' : 'text-green-700'}`}
          style={{ marginTop: '0.8rem', fontWeight: 'bold' }}>
          {internalStatusMessage}
        </p>
      )}
    </div>
  );
}