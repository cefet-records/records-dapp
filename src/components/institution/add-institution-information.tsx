'use client';

import React, { FormEvent, JSX, useEffect, useState, useCallback } from "react";
import {
  type BaseError,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract
} from "wagmi";
import { Address, isAddress } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import CryptoJS from "crypto-js";
import * as secp from "@noble/secp256k1";
import { bytesToHex } from "viem";
import { randomBytes } from "@noble/ciphers/utils.js";

// CHAVE DE LOCALSTORAGE: Agora é um prefixo, a chave final inclui o endereço
const LOCAL_STORAGE_KEY_PREFIX = "institutionEncryptedPrivateKey_";

// Definição de tipo para o conteúdo que será salvo no backup e localStorage
interface BackupData {
  encryptedPrivateKey: string;
  salt: string;
  kdfIterations: number;
  iv: string;
}

// Struct de retorno esperada (Instituição)
interface InstitutionContractData {
  institutionAddress: Address;
  name: string;
  document: string;
  publicKey: string; // Chave pública ECDSA (Hex)
}

// Interface para o estado dos erros de validação
interface PasswordValidation {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  specialChar: boolean;
}

// Funções de LocalStorage (movidas para fora para evitar re-criação)
const getLocalStorageKey = (address: Address | undefined): string | undefined => {
  if (address && isAddress(address)) {
    return `${LOCAL_STORAGE_KEY_PREFIX}${address.toLowerCase()}`;
  }
  return undefined;
};

const saveToLocalStorage = (address: Address, data: BackupData) => {
  const key = getLocalStorageKey(address);
  if (key) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      console.log(`Chave privada criptografada salva no localStorage para a Instituição: ${address}.`);
    } catch (e) {
      console.error("Erro ao salvar no localStorage:", e);
    }
  }
};

// --- FUNÇÃO DE VALIDAÇÃO DA SENHA ---
const validateMasterPassword = (password: string): PasswordValidation => {
  return {
    length: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    specialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };
};
// ------------------------------------


export default function AddInstitutionInfo(): JSX.Element | null {
  // CORREÇÃO APLICADA AQUI: Renomeando 'address' para 'connectedAddress'
  const { address: connectedAddress, isConnected } = useAccount();
  const connectedAddressValid = isConnected && !!connectedAddress;
  const [institutionName, setInstitutionName] = useState<string>("");
  const [institutionDocument, setInstitutionDocument] = useState<string>("");
  const [masterPassword, setMasterPassword] = useState<string>("");
  const [passwordValidationErrors, setPasswordValidationErrors] = useState<PasswordValidation>({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    specialChar: false,
  });

  const [downloadLink, setDownloadLink] = useState<string | null>(null);
  const [generatedPublicKey, setGeneratedPublicKey] = useState<string | null>(null);
  const [isGeneratingKeys, setIsGeneratingKeys] = useState<boolean>(false);
  const [keyGenerationError, setKeyGenerationError] = useState<string | null>(null);
  const [isDownloadTriggered, setIsDownloadTriggered] = useState(false);
  const [generalStatusMessage, setGeneralStatusMessage] = useState<string | null>(null);


  // --- HOOK: VERIFICAR STATUS DE REGISTRO DA INSTITUIÇÃO ---
  const {
    data: registeredInstitutionData,
    isLoading: isLoadingInstitution,
    isFetching: isFetchingInstitution,
    refetch: refetchInstitutionStatus
  } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getInstitution',
    args: connectedAddressValid ? [connectedAddress as Address] : undefined, // Usando connectedAddress
    query: { enabled: connectedAddressValid, staleTime: 5000 },
  });

  const isInstitutionRegistered =
    !isLoadingInstitution &&
    (registeredInstitutionData as InstitutionContractData)?.publicKey &&
    (registeredInstitutionData as InstitutionContractData)?.publicKey !== '0x' &&
    (registeredInstitutionData as InstitutionContractData)?.publicKey?.length > 10;

  // --- Hooks useWriteContract ---
  const {
    data: addInstitutionHash,
    error: addInstitutionError,
    isPending: isAddingInstitution,
    writeContract: writeAddInstitution,
  } = useWriteContract();
  const {
    isLoading: isConfirmingAddInstitution,
    isSuccess: isInstitutionAdded,
    error: addInstitutionConfirmError,
  } = useWaitForTransactionReceipt({ hash: addInstitutionHash });

  const {
    data: addPublicKeyHash,
    error: addPublicKeyError,
    isPending: isAddingPublicKey,
    writeContract: writeAddPublicKey,
  } = useWriteContract();
  const {
    isLoading: isConfirmingAddPublicKey,
    isSuccess: isPublicKeyAdded,
    error: addPublicKeyConfirmError,
  } = useWaitForTransactionReceipt({ hash: addPublicKeyHash });

  const KDF_ITERATIONS = 262144;
  const KDF_KEY_SIZE = 256 / 8;

  const displayError = addInstitutionError || addInstitutionConfirmError || addPublicKeyError || addPublicKeyConfirmError;
  const overallPending = isAddingInstitution || isConfirmingAddInstitution || isAddingPublicKey || isConfirmingAddPublicKey || isGeneratingKeys;
  const overallSuccess = isInstitutionAdded && isPublicKeyAdded;

  const isPasswordValid = Object.values(passwordValidationErrors).every(Boolean);

  // --- FUNÇÃO DE DOWNLOAD (useCallback para estabilidade) ---
  const triggerDownload = useCallback((url: string, currentAddress: Address) => {
    if (!isDownloadTriggered) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentAddress}_encrypted_private_key.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setIsDownloadTriggered(true);
      setGeneralStatusMessage("✅ Download do backup de chave privada disparado automaticamente. Guarde o arquivo em segurança.");
    }
  }, [isDownloadTriggered]);


  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setKeyGenerationError(null);
    setGeneralStatusMessage(null);
    setDownloadLink(null);
    setGeneratedPublicKey(null);
    setIsDownloadTriggered(false);

    // --- 1. Validação ---
    const validation = validateMasterPassword(masterPassword);
    setPasswordValidationErrors(validation);

    if (!isPasswordValid) {
      setKeyGenerationError("A senha mestra não atende a todos os requisitos de segurança.");
      return;
    }

    if (!institutionName || !institutionDocument) {
      setKeyGenerationError("Todos os campos da instituição são obrigatórios.");
      return;
    }
    if (!connectedAddress) {
      setKeyGenerationError("Conecte sua carteira para continuar.");
      return;
    }
    const currentAddress = connectedAddress as Address; // Usando connectedAddress

    setIsGeneratingKeys(true);
    try {
      // --- 2. Geração de Chaves ECDSA ---
      const privateKeyECDSABytes = randomBytes(32);
      const privateKeyECDSAHex = bytesToHex(privateKeyECDSABytes);

      const publicKeyECDSABytes = secp.getPublicKey(privateKeyECDSABytes, false);
      const publicKeyECDSAHex = bytesToHex(publicKeyECDSABytes);

      setGeneratedPublicKey(publicKeyECDSAHex);

      // --- 3. Criptografia com PBKDF2 e AES ---
      const salt = CryptoJS.lib.WordArray.random(128 / 8);
      const key = CryptoJS.PBKDF2(masterPassword, salt, {
        keySize: KDF_KEY_SIZE / 4,
        iterations: KDF_ITERATIONS,
      });
      const iv = CryptoJS.lib.WordArray.random(128 / 8);

      const encryptedPrivateKey = CryptoJS.AES.encrypt(privateKeyECDSAHex, key, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        iv: iv,
      }).toString();

      // --- 4. Preparação do Backup e LocalStorage ---
      const backupData: BackupData = {
        encryptedPrivateKey: encryptedPrivateKey,
        salt: salt.toString(CryptoJS.enc.Hex),
        kdfIterations: KDF_ITERATIONS,
        iv: iv.toString(CryptoJS.enc.Hex),
      };

      // Salvar no localStorage com a CHAVE ÚNICA (connectedAddress)
      saveToLocalStorage(currentAddress, backupData);

      // Gerar link de download (Backup de Segurança Crítico)
      const backupContent = JSON.stringify(backupData, null, 2);
      const blob = new Blob([backupContent], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      setDownloadLink(url);

      setGeneralStatusMessage("Dados gerados. Aguardando confirmação na carteira para enviar as transações...");

      // --- 5. Enviar Transação 1 (Informações da Instituição) ---
      writeAddInstitution({
        ...wagmiContractConfig,
        functionName: "addInstitutionInformation",
        args: [institutionName, institutionDocument],
      });

    } catch (e: any) {
      console.error("Key generation or encryption error:", e);
      setKeyGenerationError(e.message || "Falha ao gerar ou criptografar chaves.");
      setIsGeneratingKeys(false);
    }
  };

  // --- EFEITO 1: Disparar a Transação 2 (Chave Pública) após a Transação 1 ser Confirmada ---
  useEffect(() => {
    if (isInstitutionAdded && generatedPublicKey && isConnected) {
      writeAddPublicKey({
        ...wagmiContractConfig,
        functionName: "addInstitutionPublicKey",
        args: [
          connectedAddress as Address, // Usando connectedAddress
          generatedPublicKey,
        ],
      });
    }
  }, [isInstitutionAdded, generatedPublicKey, connectedAddress, writeAddPublicKey, isConnected]);


  // --- EFEITO 2: DOWNLOAD AUTOMÁTICO APÓS O LINK ESTAR PRONTO E A PRIMEIRA TX CONFIRMADA ---
  useEffect(() => {
    if (downloadLink && isInstitutionAdded && connectedAddress) {
      triggerDownload(downloadLink, connectedAddress);
    }
  }, [downloadLink, isInstitutionAdded, connectedAddress, triggerDownload]);


  // --- EFEITO 3: Feedback, Finalização E RECARREGAR A PÁGINA ---
  useEffect(() => {
    // overallSuccess é true quando as duas transações (Info + Public Key) foram confirmadas.
    // isDownloadTriggered garante que o backup foi concluído.
    if (overallSuccess && isDownloadTriggered) {
      setGeneralStatusMessage("✅ Registro Completo! Recarregando a página para ocultar o formulário...");
      setIsGeneratingKeys(false);

      // 🚨 MUDANÇA APLICADA AQUI: Recarregar a página após o sucesso completo e download
      if (typeof window !== 'undefined') {
        // Pequeno atraso para o usuário ver a mensagem final
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }

      // O refetch Institution Status não é estritamente necessário se a página recarregar,
      // mas mantemos para fins de fallback/limpeza de estado.
      refetchInstitutionStatus();
    }

    if (displayError) {
      setIsGeneratingKeys(false);
    }

  }, [overallSuccess, displayError, isDownloadTriggered, refetchInstitutionStatus]);

  // --- EFEITO 4: Validação em tempo real da senha ---
  useEffect(() => {
    setPasswordValidationErrors(validateMasterPassword(masterPassword));
    if (keyGenerationError && masterPassword.length > 0) {
      setKeyGenerationError(null);
    }
  }, [masterPassword]);


  // --- LÓGICA DE OCULTAÇÃO DO COMPONENTE ---
  if (isLoadingInstitution || isFetchingInstitution) {
    return (
      <div style={{ marginTop: '1.5rem', padding: '1rem', borderRadius: '4px', border: '1px solid #007bff', backgroundColor: '#e6f3ff', color: '#004085' }}>
        Verificando status de registro da instituição...
      </div>
    );
  }

  if (isInstitutionRegistered) {
    return null;
  }
  // ----------------------------------------

  const renderValidationItem = (isValid: boolean, message: string) => (
    <li style={{ color: isValid ? 'green' : 'red' }}>
      {isValid ? '✅' : '❌'} {message}

    </li>
  );


  return (
    <div className="p-4 border rounded-lg shadow-md max-w-xl mx-auto">
      <h5 className="text-xl font-bold mb-4">Registro da Instituição e Geração de Chaves</h5>

      {!isConnected && <p className="text-red-500 mb-3">⚠️ Por favor, conecte a carteira da instituição.</p>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          name="institutionName"
          placeholder="Nome da Instituição"
          value={institutionName}
          onChange={(e) => setInstitutionName(e.target.value)}
          required
          className="w-full p-2 border rounded"
          disabled={overallPending}
        />
        <input
          type="text"
          name="institutionDocument"
          placeholder="Documento (CNPJ/Registro)"
          value={institutionDocument}
          onChange={(e) => setInstitutionDocument(e.target.value)}
          required
          className="w-full p-2 border rounded"
          disabled={overallPending}
        />
        <input
          type="password"
          name="masterPassword"
          placeholder="Senha Mestra para Criptografia"
          value={masterPassword}
          onChange={(e) => setMasterPassword(e.target.value)}
          required
          className="w-full p-2 border rounded"
          disabled={overallPending}
        />

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


        <button disabled={overallPending || !isConnected || !isPasswordValid} type="submit" className={`w-full p-3 font-semibold rounded text-white transition duration-150 ${overallPending || !isPasswordValid ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
          {overallPending
            ? (isGeneratingKeys ? "Gerando Chaves e Criptografando..." : "Processando Transações...")
            : "Adicionar Instituição & Gerar Chaves"}
        </button>

        {/* --- FEEDBACK DE TRANSAÇÃO E ERRO --- */}
        <div className="mt-4 space-y-2 text-sm">
          {keyGenerationError && <div className="text-red-500">Key Generation Error: {keyGenerationError}</div>}
          {generalStatusMessage && <div className="text-blue-700 font-semibold">{generalStatusMessage}</div>}

          {isAddingInstitution && <div>Aguardando Confirmação (Info) na carteira...</div>}
          {isConfirmingAddInstitution && <div>Transação Info enviada: {addInstitutionHash?.slice(0, 10)}...</div>}

          {isAddingPublicKey && <div>Aguardando Confirmação (Chave Pública) na carteira...</div>}
          {isConfirmingAddPublicKey && <div>Transação Chave Pública enviada: {addPublicKeyHash?.slice(0, 10)}...</div>}

          {overallSuccess && <div className="text-green-600">✅ Registro Completo! O componente será fechado.</div>}
          {displayError && <div className="text-red-500">Error: {(displayError as BaseError).shortMessage || displayError.message || "Erro desconhecido."}</div>}
        </div>
      </form>
    </div>
  );
}