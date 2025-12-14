'use client';

import React, { JSX, useState, useEffect, FormEvent, useCallback } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useAccount,
  type BaseError
} from "wagmi";
import * as secp from "@noble/secp256k1";
import { bytesToHex, Address, Hex, isAddress, keccak256, toBytes } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { encryptECIES } from "@/utils/cripto.utils";
import { randomBytes } from "@noble/ciphers/utils.js";
import * as CryptoJS from "crypto-js";

// Chave de LocalStorage Única por Estudante/Endereço
const LOCAL_STORAGE_KEY_PREFIX = "studentEncryptedPrivateKey_";

// Definição de tipo para o conteúdo que será salvo no backup e localStorage
interface BackupData {
  encryptedPrivateKey: string;
  salt: string;
  kdfIterations: number;
  iv: string;
}

interface InstitutionContractData {
  institutionAddress: Address;
  publicKey: Hex;
}

interface StudentContractData {
  studentAddress: Address;
  selfEncryptedInformation: string;
  institutionEncryptedInformation: string;
  publicKey: string; // Chave pública ECDSA (Hex)
  publicHash: string;
}

interface PersonalInformation {
  name: string;
  document: string;
  salt: string;
}

// Interface para o estado dos erros de validação
interface PasswordValidation {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  specialChar: boolean;
}


// --- FUNÇÕES DE UTILIDADE ---

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
      console.log(`Chave privada criptografada salva no localStorage para ${address}.`);
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


export function AddStudentInformation(): JSX.Element | null {
  const { address, isConnected } = useAccount();

  const [institutionAddress, setInstitutionAddress] = useState<Address | ''>('');
  const [name, setName] = useState("");
  // CORREÇÃO APLICADA AQUI: Renomeando 'document' para 'studentDocument'
  const [studentDocument, setStudentDocument] = useState("");
  const [masterPassword, setMasterPassword] = useState<string>("");
  const [passwordValidationErrors, setPasswordValidationErrors] = useState<PasswordValidation>({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    specialChar: false,
  });


  const [downloadLink, setDownloadLink] = useState<string | null>(null);
  const [generatedStudentPublicKey, setGeneratedStudentPublicKey] = useState<Hex | null>(null);
  const [isGeneratingKeys, setIsGeneratingKeys] = useState<boolean>(false);
  const [keyGenerationError, setKeyGenerationError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDownloadTriggered, setIsDownloadTriggered] = useState(false);

  const institutionAddressValid = isAddress(institutionAddress);
  const connectedAddressValid = isConnected && !!address;

  const isPasswordValid = Object.values(passwordValidationErrors).every(Boolean);

  const KDF_ITERATIONS = 262144;
  const KDF_KEY_SIZE = 256 / 8;


  // --- HOOK 1: VERIFICAR REGISTRO DO ESTUDANTE ---
  const {
    data: registeredStudentData,
    isLoading: isLoadingStudent,
    isFetching: isFetchingStudent
  } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getStudent',
    args: connectedAddressValid ? [address as Address] : undefined,
    query: { enabled: connectedAddressValid, staleTime: 5000 },
  });

  const isStudentRegistered =
    !isLoadingStudent &&
    registeredStudentData &&
    (registeredStudentData as StudentContractData).publicKey !== '0x' &&
    (registeredStudentData as StudentContractData).publicKey?.length > 10;

  // --- LÓGICA DE OCULTAÇÃO ---
  if (isStudentRegistered) {
    return null;
  }
  // --------------------------


  // --- HOOK 2: TRANSAÇÕES ---
  const { data: addInfoHash, error: writeError, isPending: isTxPending, writeContract } = useWriteContract();
  const { isLoading: isTxConfirming, isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({ hash: addInfoHash });

  // --- HOOK 3: DADOS DA INSTITUIÇÃO ---
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


  // --- FUNÇÃO DE DOWNLOAD (useCallback) ---
  const triggerDownload = useCallback((url: string, currentAddress: Address) => {
    // CORREÇÃO: Com o nome 'document' resolvido, a chamada ao DOM funciona.
    if (!isDownloadTriggered) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentAddress}_student_encrypted_private_key.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setIsDownloadTriggered(true);
      setStatus("✅ Download do backup de chave privada disparado automaticamente. Guarde o arquivo em segurança.");
    }
  }, [isDownloadTriggered, setStatus, setIsDownloadTriggered]);


  const handleGenerateKeysAndAddInfo = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();

    // Resetar estados e status
    setKeyGenerationError(null);
    setDownloadLink(null);
    setGeneratedStudentPublicKey(null);
    setError(null);
    setStatus(null);
    setIsDownloadTriggered(false); // Resetar status de download

    // --- 1. Validação Completa ---
    const validation = validateMasterPassword(masterPassword);
    setPasswordValidationErrors(validation);

    if (!isPasswordValid) { // Usa o estado calculado
      setKeyGenerationError("A senha mestra não atende a todos os requisitos de segurança.");
      return;
    }

    // CORREÇÃO APLICADA AQUI: Usando studentDocument
    if (!institutionAddressValid || !name || !studentDocument || !address || !isConnected) {
      setError("Por favor, preencha todos os campos e conecte sua carteira.");
      return;
    }

    const currentAddress = address as Address;


    setIsGeneratingKeys(true);
    setStatus("Gerando par de chaves e preparando dados...");

    try {
      // 1. Gerar Par de Chaves ECDSA (secp256k1) para o Estudante
      const privateKeyECDSABytes = randomBytes(32);
      const privateKeyECDSAHex = bytesToHex(privateKeyECDSABytes) as Hex;

      const publicKeyECDSABytes = secp.getPublicKey(privateKeyECDSABytes, false);
      const publicKeyECDSAHex = bytesToHex(publicKeyECDSABytes) as Hex;

      setGeneratedStudentPublicKey(publicKeyECDSAHex);

      // 2. Criptografar a Chave Privada do Estudante com a Senha Mestra (PBKDF2 + AES)
      const saltKDF = CryptoJS.lib.WordArray.random(128 / 8);
      const keyKDF = CryptoJS.PBKDF2(masterPassword, saltKDF, {
        keySize: KDF_KEY_SIZE / 4,
        iterations: KDF_ITERATIONS,
      });

      const iv = CryptoJS.lib.WordArray.random(128 / 8);

      const encryptedStudentPrivateKey = CryptoJS.AES.encrypt(privateKeyECDSAHex, keyKDF, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        iv: iv,
      }).toString();

      // 3. Preparar e oferecer o download do arquivo TXT de backup
      const backupData: BackupData = {
        encryptedPrivateKey: encryptedStudentPrivateKey,
        salt: saltKDF.toString(CryptoJS.enc.Hex),
        kdfIterations: KDF_ITERATIONS,
        iv: iv.toString(CryptoJS.enc.Hex),
      };

      // Salvar no localStorage com chave única
      saveToLocalStorage(currentAddress, backupData);

      const backupContent = JSON.stringify(backupData, null, 2);
      const blob = new Blob([backupContent], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      setDownloadLink(url); // Define o link de download aqui

      // 4. Preparar dados pessoais para criptografia e envio on-chain
      const saltPersonalDataBytes = randomBytes(16);
      const saltPersonalDataHex = bytesToHex(saltPersonalDataBytes);

      // CORREÇÃO APLICADA AQUI: Usando studentDocument
      const personalInformation: PersonalInformation = { name, document: studentDocument, salt: saltPersonalDataHex };
      const informationString = JSON.stringify(personalInformation);

      const publicHashHex = keccak256(toBytes(informationString)) as Hex;

      const instData = institutionData as InstitutionContractData;
      if (!instData || instData.publicKey.length < 132 || instData.publicKey === '0x') {
        throw new Error("Chave pública da Instituição não encontrada ou é inválida. Certifique-se que a instituição existe e tem uma PK registrada no formato ECDSA Hex (0x04...).");
      }
      const institutionPublicKeyHex = instData.publicKey;

      const encryptedForSelfBase64 = await encryptECIES(informationString, publicKeyECDSAHex);
      const encryptedForInstitutionBase64 = await encryptECIES(informationString, institutionPublicKeyHex);

      const publicHashToSubmit = publicHashHex;

      setStatus("Dados gerados. Aguardando confirmação na carteira para adicionar informações...");

      await writeContract({
        ...wagmiContractConfig,
        functionName: 'addStudentInformation',
        args: [
          encryptedForSelfBase64,
          encryptedForInstitutionBase64,
          publicKeyECDSAHex,
          publicHashToSubmit,
        ]
      });
    } catch (err: any) {
      console.error("Error in AddStudentInformation:", err);
      const msg = `Falha ao adicionar informações: ${err.message || String(err)}`;
      setStatus(null);
      setError(msg);
      setIsGeneratingKeys(false);
      setDownloadLink(null);
      setGeneratedStudentPublicKey(null);
    }
  };

  // --- EFEITO 1: DOWNLOAD AUTOMÁTICO APÓS O LINK ESTAR PRONTO E A TX CONFIRMADA ---
  useEffect(() => {
    if (downloadLink && isTxConfirmed && address) {
      triggerDownload(downloadLink, address);
    }
  }, [downloadLink, isTxConfirmed, address, triggerDownload]);


  // --- EFEITO 2: Resetar estados, finalizar E RECARREGAR A PÁGINA ---
  useEffect(() => {
    // Condição 1: A transação foi confirmada
    // Condição 2: O download do backup foi disparado
    if (isTxConfirmed && isDownloadTriggered) {
      setStatus("Informação do estudante adicionada com sucesso! Recarregando a página para refletir o novo status...");
      setError(null);

      // 🚨 MUDANÇA APLICADA AQUI: Recarregar a página após o sucesso + download
      if (typeof window !== 'undefined') {
        // Pequeno atraso para o usuário ver a mensagem de sucesso e o download ser finalizado
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }

      // Resetar estados (não é estritamente necessário se a página vai recarregar, mas é boa prática)
      setInstitutionAddress('');
      setName('');
      setStudentDocument('');
      setMasterPassword('');
      setIsGeneratingKeys(false);
    }
  }, [isTxConfirmed, isDownloadTriggered]); // Depende tanto da Confirmação da TX quanto do Download

  // --- EFEITO 3: Validação em tempo real da senha ---
  useEffect(() => {
    setPasswordValidationErrors(validateMasterPassword(masterPassword));
    if (keyGenerationError && masterPassword.length > 0) {
      setKeyGenerationError(null);
    }
  }, [masterPassword]);


  const isAddInfoDisabled = isTxPending || isLoadingInst || !isConnected ||
    !institutionAddressValid || !name || !studentDocument || // Usando studentDocument
    isGeneratingKeys ||
    !isPasswordValid || isFetchingStudent;

  const isInstitutionPublicKeyInvalid = institutionAddressValid && !isLoadingInst && !isInstError &&
    (!institutionData || (institutionData as InstitutionContractData).publicKey?.length < 132 || (institutionData as InstitutionContractData).publicKey === '0x');

  if (!hasMounted) {
    return <></>;
  }

  // Se estiver carregando os dados do estudante, exibe o loading
  if (isLoadingStudent || isFetchingStudent) {
    return (
      <div style={{ marginTop: '1.5rem', padding: '1rem', borderRadius: '4px', border: '1px solid #007bff', backgroundColor: '#e6f3ff', color: '#004085' }}>
        Verificando status de registro do estudante...
      </div>
    );
  }

  // Se não estiver registrado, continua e renderiza o formulário abaixo:

  const renderValidationItem = (isValid: boolean, message: string) => (
    <li style={{ color: isValid ? 'green' : 'red' }}>
      {isValid ? '✅' : '❌'} {message}
    </li>
  );


  return (
    <div style={{ marginTop: '1.5rem', border: '1px solid #007bff', padding: '1rem', borderRadius: '4px' }}>
      <h2 className="text-xl font-bold">Adicionar Informação Pessoal do Estudante</h2>
      <p className="text-sm" style={{ marginBottom: '10px', color: 'gray' }}>
        Suas informações são cifradas. O backup da sua chave privada será baixado automaticamente após a transação.
      </p>

      {!isConnected ? (
        <p style={{ color: 'orange' }}>⚠️ Conecte sua carteira para continuar.</p>
      ) : (
        <form className="form space-y-3" onSubmit={handleGenerateKeysAndAddInfo}>
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
            required
            disabled={isGeneratingKeys || isTxPending}
          />
          {isLoadingInst && <p className="text-sm text-blue-500">Verificando chave da instituição...</p>}
          {isInstError && <p className="text-sm text-red-500">Erro ao buscar chave da instituição: {(instError as unknown as BaseError)?.shortMessage || instError?.message}</p>}

          {!institutionAddressValid && institutionAddress !== '' && (
            <p className="text-sm text-red-500">⚠️ Endereço da instituição inválido.</p>
          )}
          {isInstitutionPublicKeyInvalid &&
            <p className="text-sm text-red-500">⚠️ A instituição existe, mas não tem chave pública de encriptação ECDSA registrada no formato correto (0x04...).</p>
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
            required
            disabled={isGeneratingKeys || isTxPending}
          />
          <input
            type="text"
            placeholder="Documento"
            value={studentDocument} // Usando studentDocument
            onChange={(e) => {
              setStudentDocument(e.target.value); // Usando setStudentDocument
              setError(null);
              setStatus(null);
            }}
            className="w-full p-2 border rounded"
            required
            disabled={isGeneratingKeys || isTxPending}
          />

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="masterPassword" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Senha Mestra (para Criptografar sua Chave Privada):
            </label>
            <input
              id="masterPassword"
              type="password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              placeholder="Mínimo 12 caracteres"
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
              required
              disabled={isGeneratingKeys || isTxPending}
            />
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


          <button
            type="submit"
            disabled={isAddInfoDisabled || isInstitutionPublicKeyInvalid}
            style={{ padding: '0.5rem 1rem', backgroundColor: '#28a745', color: 'white', borderRadius: '4px', opacity: (isAddInfoDisabled || isInstitutionPublicKeyInvalid) ? 0.6 : 1 }}
          >
            {isGeneratingKeys ? "Gerando Chaves & Preparando Transação..." :
              isTxPending ? "Aguardando Confirmação da Blockchain..." :
                "Gerar Chaves e Adicionar Informação do Estudante"}
          </button>
        </form>
      )}

      {status && <p style={{ marginTop: '0.8rem', color: 'green', fontWeight: 'bold' }}>{status}</p>}
      {error && <p style={{ color: 'red', marginTop: '0.8rem' }}>Erro: {error}</p>}
      {keyGenerationError && <p style={{ color: 'red', marginTop: '0.8rem' }}>Erro de Geração de Chave: {keyGenerationError}</p>}
      {writeError && <p style={{ color: 'red' }}>Erro na transação: {(writeError as unknown as BaseError)?.shortMessage || writeError.message}</p>}

      {generatedStudentPublicKey && !keyGenerationError && (
        <p style={{ color: 'blue', marginTop: '0.8rem' }}>
          ✅ Chave Pública ECDSA Gerada: <code style={{ fontSize: '0.8em', wordBreak: 'break-all' }}>{generatedStudentPublicKey}</code>
          <br />
          {isTxConfirmed && isDownloadTriggered && "✅ Download do backup concluído. Informação registrada. Recarregando..."}
          {isTxConfirmed && !isDownloadTriggered && "Aguardando download automático..."}
          {!isTxConfirmed && "Aguardando sua confirmação na carteira para registrar esta chave e seus dados."}
        </p>
      )}
    </div>
  );
}