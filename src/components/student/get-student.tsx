'use client';

import React, { JSX, useState, useEffect, useCallback, ChangeEvent } from "react";
import { useReadContract, useAccount, type BaseError } from "wagmi";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { Address, isAddress, Hex, keccak256, toBytes } from "viem";
import { decryptECIES } from "@/utils/cripto.utils";
import * as CryptoJS from "crypto-js";

// [DEFINIÇÕES DE INTERFACES E CONSTANTES]
const KDF_ITERATIONS = 262144;
const KDF_KEY_SIZE = 256 / 8;

enum userTypes {
  OWNER = 'owner',
  INSTITUTION = 'institution',
  STUDENT = 'student',
  VISITOR = 'viewer'
}

interface StudentContractData {
  studentAddress: Address;
  selfEncryptedInformation: Hex;
  institutionEncryptedInformation: Hex;
  publicKey: Hex;
  publicHash: Hex;
}
interface PersonalInformation {
  name: string;
  document: string;
  salt: string;
}
interface BackupFileContent {
  encryptedPrivateKey: string;
  salt: string;
  kdfIterations: number;
  iv: string;
}
// Prefixes das chaves únicas no localStorage
const PREFIX_STUDENT = "studentEncryptedPrivateKey_";
const PREFIX_INSTITUTION = "institutionEncryptedPrivateKey_";
const PREFIX_VIEWER = "viewerEncryptedPrivateKey_";
// [FIM DE DEFINIÇÕES]


// --- FUNÇÕES DE UTILIDADE PARA LOCALSTORAGE ---

interface RoleMap {
  prefix: string;
  targetPayload: 'self' | 'institution';
  displayName: string;
}

// NOVO: Mapeia a permissão do usuário para o prefixo do localStorage e o payload do contrato
const getRoleMap = (permission: string | undefined): RoleMap | null => {
  switch (permission) {
    case userTypes.STUDENT:
      return { prefix: PREFIX_STUDENT, targetPayload: 'self', displayName: 'Aluno' };
    case userTypes.INSTITUTION:
      return { prefix: PREFIX_INSTITUTION, targetPayload: 'institution', displayName: 'Instituição' };
    case userTypes.VISITOR:
    case userTypes.OWNER:
      return { prefix: PREFIX_VIEWER, targetPayload: 'institution', displayName: 'Visitante/Geral' };
    default:
      return null;
  }
};

const getLocalStorageKey = (address: Address, prefix: string): string => {
  return `${prefix}${address.toLowerCase()}`;
};

const loadBackupFromLocalStorage = (address: Address, prefix: string): BackupFileContent | null => {
  if (!address) return null;
  const key = getLocalStorageKey(address, prefix);
  const stored = localStorage.getItem(key);
  if (stored) {
    try {
      return JSON.parse(stored) as BackupFileContent;
    } catch (e) {
      console.error("Erro ao parsear backup do localStorage:", e);
      localStorage.removeItem(key);
      return null;
    }
  }
  return null;
};
// --- FIM DAS FUNÇÕES DE UTILIDADE ---


export function GetStudent(): JSX.Element {
  const { address: connectedAddress, isConnected } = useAccount();

  const [studentAddress, setStudentAddress] = useState<Address | ''>('');
  const [decryptedData, setDecryptedData] = useState<PersonalInformation | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingDecryption, setIsLoadingDecryption] = useState<boolean>(false);

  // Estado para o backup criptografado (pode vir do upload ou localStorage)
  const [encryptedBackupData, setEncryptedBackupData] = useState<BackupFileContent | null>(null);
  const [masterPasswordDecrypt, setMasterPasswordDecrypt] = useState<string>('');
  const [derivedPrivateKey, setDerivedPrivateKey] = useState<Hex | null>(null);
  const [isPrivateKeyDerived, setIsPrivateKeyDerived] = useState<boolean>(false);

  // NOVO ESTADO: O objeto RoleMap que define o papel do usuário conectado
  const [currentRoleMap, setCurrentRoleMap] = useState<RoleMap | null>(null);


  const studentAddressValid = isAddress(studentAddress);
  const connectedAddressValid = isConnected && connectedAddress;

  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => { setHasMounted(true); }, []);


  // --- HOOK 1: Obter Permissão do Usuário Conectado ---
  const { data: userPermission, isFetching: isFetchingPermission } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getPermission',
    args: [],
    account: connectedAddress,
    query: {
      enabled: connectedAddressValid && hasMounted,
      staleTime: 5_000,
    },
  });

  // --- HOOK 2: Buscar Dados do Estudante ---
  const {
    data: contractStudentData,
    isLoading: isLoadingStudent,
    isError: isContractReadError,
    error: contractReadError,
    refetch: refetchStudentData
  } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getStudent',
    args: studentAddressValid ? [studentAddress] : undefined,
    query: { enabled: studentAddressValid, staleTime: 1_000 }
  });


  // --- EFEITO 1: Carregar Backup do localStorage baseado na PERMISSÃO (userPermission) ---
  useEffect(() => {
    setEncryptedBackupData(null);
    setIsPrivateKeyDerived(false);
    setDerivedPrivateKey(null);
    setStatus(null);
    setError(null);

    if (connectedAddressValid && userPermission && !isFetchingPermission) {

      // Determina o mapeamento de papel
      const roleMap = getRoleMap(userPermission as string);
      setCurrentRoleMap(roleMap);

      if (roleMap) {
        const loadedData = loadBackupFromLocalStorage(connectedAddress, roleMap.prefix);

        if (loadedData) {
          setEncryptedBackupData(loadedData);
          setStatus(`Backup criptografado (chave de ${roleMap.displayName}) carregado do navegador. Insira a Senha Mestra.`);
        } else {
          setStatus(`Chave de ${roleMap.displayName} não encontrada no navegador. Por favor, faça o upload do arquivo de backup (.json).`);
        }
      } else {
        setCurrentRoleMap(null);
        setStatus("Não foi possível determinar seu papel (permissão) para carregar o backup da chave.");
      }
    } else if (!connectedAddressValid) {
      setCurrentRoleMap(null);
    }

  }, [connectedAddressValid, connectedAddress, userPermission, isFetchingPermission]);


  // --- Função: Carregar Backup do Upload (Permanece a mesma) ---
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    setEncryptedBackupData(null);
    setIsPrivateKeyDerived(false);
    setDerivedPrivateKey(null);
    setError(null);
    setStatus(null);
    setDecryptedData(null);

    const file = event.target.files?.[0];
    if (file) {
      try {
        const fileContent = await file.text();
        const backupData: BackupFileContent = JSON.parse(fileContent);
        if (!backupData.encryptedPrivateKey || !backupData.salt || !backupData.iv) {
          throw new Error("Arquivo JSON de backup inválido.");
        }
        setEncryptedBackupData(backupData);
        setStatus("Arquivo de backup carregado. Por favor, insira a senha mestra.");
      } catch (err: any) {
        console.error("Erro ao ler/parsear arquivo:", err);
        setError(`Erro ao carregar arquivo: ${err.message || String(err)}`);
      }
    }
  };


  // --- Função: Descriptografar a Chave Privada (PBKDF2 + AES) (Permanece a mesma) ---
  const derivePrivateKey = useCallback(async (data: BackupFileContent, password: string): Promise<Hex | null> => {
    // ... (lógica inalterada) ...
    setStatus("Derivando chave privada...");
    setError(null);
    setDerivedPrivateKey(null);
    setIsPrivateKeyDerived(false);

    if (password.length < 12) {
      setError("A senha mestra deve ter pelo menos 12 caracteres.");
      return null;
    }

    try {
      const { encryptedPrivateKey, salt, kdfIterations, iv } = data;

      if (kdfIterations !== KDF_ITERATIONS) {
        throw new Error(`KDF do arquivo (${kdfIterations}) não corresponde ao esperado (${KDF_ITERATIONS}).`);
      }
      if (!iv || typeof iv !== 'string' || iv.length !== 32) {
        throw new Error("IV (Initialization Vector) inválido no backup.");
      }

      const saltKDF = CryptoJS.enc.Hex.parse(salt);
      const keyKDF = CryptoJS.PBKDF2(password, saltKDF, {
        keySize: KDF_KEY_SIZE / 4,
        iterations: kdfIterations,
      });

      const ivFromBackup = CryptoJS.enc.Hex.parse(iv);

      const decryptedWords = CryptoJS.AES.decrypt(encryptedPrivateKey, keyKDF, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        iv: ivFromBackup,
      });

      const decryptedPrivateKeyHex = decryptedWords.toString(CryptoJS.enc.Utf8);

      if (!decryptedPrivateKeyHex || !decryptedPrivateKeyHex.startsWith('0x') || decryptedPrivateKeyHex.length !== 66) {
        throw new Error("Falha na descriptografia da chave privada (senha incorreta ou arquivo corrompido).");
      }

      setDerivedPrivateKey(decryptedPrivateKeyHex as Hex);
      setIsPrivateKeyDerived(true);
      setStatus("Chave privada derivada com sucesso!");
      return decryptedPrivateKeyHex as Hex;

    } catch (err: any) {
      console.error("Erro ao derivar chave privada:", err);
      setStatus(null);
      setError(`Falha ao derivar chave privada: ${err.message || String(err)}`);
      setDerivedPrivateKey(null);
      setIsPrivateKeyDerived(false);
      return null;
    }
  }, []);


  // --- Função Principal: Buscar Dados e Descriptografar (ECIES) ---
  const handleGetAndDecryptStudentData = async () => {
    if (!connectedAddressValid) {
      setError("Conecte sua carteira para buscar e tentar descriptografar os dados.");
      return;
    }
    if (!studentAddressValid) {
      setError("Por favor, insira um endereço de estudante válido.");
      return;
    }
    if (!encryptedBackupData) {
      setError("Por favor, carregue o backup da chave privada (via localStorage ou upload).");
      return;
    }
    if (!currentRoleMap) {
      setError("Aguardando confirmação do seu papel (permissão) no contrato.");
      return;
    }

    // 1. Descriptografar a chave privada primeiro
    let currentDerivedPrivateKey = derivedPrivateKey;
    if (!isPrivateKeyDerived || !currentDerivedPrivateKey) {
      currentDerivedPrivateKey = await derivePrivateKey(encryptedBackupData, masterPasswordDecrypt);
      if (!currentDerivedPrivateKey) {
        setIsLoadingDecryption(false);
        return;
      }
    }

    setStatus("Buscando dados do estudante e preparando para descriptografia...");
    setError(null);
    setDecryptedData(null);
    setIsLoadingDecryption(true);

    try {
      // 2. Buscar Dados do Contrato
      const { data: fetchedContractData, error: fetchError } = await refetchStudentData();

      // ... (Validações de fetchData inalteradas) ...
      if (fetchError) {
        throw new Error(`Erro ao buscar dados do contrato: ${(fetchError as unknown as BaseError).shortMessage || fetchError.message}`);
      }
      if (!fetchedContractData) {
        throw new Error("Nenhum dado de estudante encontrado para o endereço fornecido.");
      }

      const student = fetchedContractData as unknown as StudentContractData;
      let encryptedPayloadToDecrypt: Hex;
      let expectedDecryptor: string;

      // 3. Selecionar o payload correto baseado no targetPayload do RoleMap
      if (currentRoleMap.targetPayload === 'self') {
        encryptedPayloadToDecrypt = student.selfEncryptedInformation;
        expectedDecryptor = currentRoleMap.displayName; // Deve ser 'Aluno'
      } else {
        encryptedPayloadToDecrypt = student.institutionEncryptedInformation;
        expectedDecryptor = currentRoleMap.displayName; // Deve ser 'Instituição' ou 'Visitante/Geral'
      }

      if (!encryptedPayloadToDecrypt || encryptedPayloadToDecrypt === '0x') {
        throw new Error(`Payload de dados cifrados para a chave de ${expectedDecryptor} não encontrado no contrato.`);
      }

      setStatus(`Aguardando descriptografia ECIES dos dados para a ${expectedDecryptor}...`);

      // 4. Descriptografar o Payload ECIES
      const decryptedPersonalInformationJson = await decryptECIES(encryptedPayloadToDecrypt, currentDerivedPrivateKey as Hex);

      if (!decryptedPersonalInformationJson) {
        throw new Error(`Falha ao descriptografar ECIES. Chave privada de ${expectedDecryptor} incorreta ou payload corrompido.`);
      }

      const personalInfo: PersonalInformation = JSON.parse(decryptedPersonalInformationJson);

      // 5. Verificação de Integridade (Hash Público)
      const calculatedHash = keccak256(toBytes(decryptedPersonalInformationJson));
      if (calculatedHash !== student.publicHash) {
        console.warn("AVISO: Hash dos dados descriptografados NÃO COINCIDE com o hash do contrato! Integridade comprometida.");
        setError("AVISO: Falha na verificação de integridade do hash público.");
      }

      setDecryptedData(personalInfo);
      setStatus(`Dados do estudante descriptografados com sucesso pela chave de ${expectedDecryptor}!`);

    } catch (err: any) {
      console.error("Erro durante a descriptografia:", err);
      setStatus(null);
      setError(`Falha na descriptografia: ${err.message || String(err)}`);
    } finally {
      setIsLoadingDecryption(false);
    }
  };


  // --- EFEITO 2: Resetar estados ao mudar o endereço do estudante
  useEffect(() => {
    setDecryptedData(null);
    setMasterPasswordDecrypt('');
  }, [studentAddress]);


  if (!hasMounted) {
    return <></>;
  }

  const isDecryptButtonDisabled = isLoadingStudent || isLoadingDecryption ||
    !studentAddressValid || !masterPasswordDecrypt ||
    masterPasswordDecrypt.length < 12 || !encryptedBackupData || isFetchingPermission;


  // Determina o nome do backup no localStorage para exibição (baseado no papel)
  const backupSource = currentRoleMap ? currentRoleMap.displayName : 'Aguardando Permissão';

  // Mostra o campo de upload se NADA foi carregado do localStorage
  const showUploadField = !encryptedBackupData && currentRoleMap !== null;


  return (
    <div style={{ marginTop: '1.5rem', border: '1px solid #007bff', padding: '1rem', borderRadius: '4px' }}>
      <h2>Descriptografar Dados do Estudante</h2>
      {/* <p className="text-sm" style={{ marginBottom: '10px', color: 'gray' }}>
        O sistema usa sua permissão (`{userPermission || 'Buscando...'}`) para carregar a chave privada criptografada correta do navegador.
      </p> */}

      {!connectedAddressValid ? (
        <p style={{ color: 'orange', marginBottom: '1rem' }}>⚠️ Conecte sua carteira para buscar e descriptografar dados.</p>
      ) : (
        <form className="form space-y-3" onSubmit={(e) => e.preventDefault()}>
          <input
            type="text"
            placeholder="Endereço do Estudante"
            value={studentAddress}
            onChange={(e) => {
              setStudentAddress(e.target.value as Address | '');
              setStatus(null);
              setError(null);
              setDecryptedData(null);
            }}
            className="w-full p-2 border rounded"
            disabled={isLoadingDecryption}
          />

          {!studentAddressValid && studentAddress !== '' && (
            <p className="text-sm text-red-500">⚠️ Endereço do estudante inválido.</p>
          )}

          

          {/* UPLOAD DE ARQUIVO (SÓ VISÍVEL SE NADA FOI CARREGADO DO LOCALSTORAGE) */}
          {showUploadField && (
            <div style={{ marginTop: '1rem' }}>
              <label htmlFor="backupFile" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Upload do Arquivo de Chave Privada Criptografada (.json):
              </label>
              <input
                id="backupFile"
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="w-full p-2 border rounded"
                disabled={isLoadingDecryption}
                style={{ backgroundColor: '#fffbe6' }}
              />
              <p className="text-sm text-red-500 mt-1">⚠️ A chave de {backupSource} não foi encontrada no navegador. Faça o upload do arquivo.</p>
            </div>
          )}

          {/* SENHA MESTRA PARA DESCRIPTOGRAFAR CHAVE PRIVADA */}
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="masterPasswordDecrypt" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Senha:
            </label>
            <input
              id="masterPasswordDecrypt"
              type="password"
              value={masterPasswordDecrypt}
              onChange={(e) => setMasterPasswordDecrypt(e.target.value)}
              placeholder="Mínimo 12 caracteres"
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fffbe6' }}
              required
              disabled={isLoadingDecryption || !encryptedBackupData}
            />
            {/* {encryptedBackupData && !showUploadField && (
              <p className="text-sm text-green-500 mt-1">
                ✅ Backup de {backupSource} carregado do seu navegador. Digite a senha para usá-lo.
              </p>
            )} */}
            {masterPasswordDecrypt.length > 0 && masterPasswordDecrypt.length < 12 && (
              <p className="text-sm text-red-500 mt-1">⚠️ A senha mestra deve ter pelo menos 12 caracteres.</p>
            )}
          </div>

          <button
            type="button"
            onClick={handleGetAndDecryptStudentData}
            disabled={isDecryptButtonDisabled}
            style={{ padding: '0.5rem 1rem', backgroundColor: '#007bff', color: 'white', borderRadius: '4px', opacity: isDecryptButtonDisabled ? 0.6 : 1, marginTop: '10px' }}
          >
            {isLoadingDecryption ? "Descriptografando..." : isLoadingStudent ? "Buscando Dados..." : "Descriptografar Dados"}
          </button>
        </form>
      )}

      {/* {status && <p style={{ marginTop: '0.8rem', color: 'green', fontWeight: 'bold' }}>{status}</p>} */}
      {error && <p style={{ color: 'red', marginTop: '0.8rem' }}>Erro: {error}</p>}
      {isContractReadError && <p style={{ color: 'red' }}>Erro ao ler contrato: {(contractReadError as unknown as BaseError)?.shortMessage || contractReadError.message}</p>}

      {decryptedData && (
        <div style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#f9f9f9' }}>
          <h3>✅ Informações Descriptografadas:</h3>
          <p><strong>Nome:</strong> {decryptedData.name}</p>
          <p><strong>Documento:</strong> {decryptedData.document}</p>
          <p><strong>Salt (Hash Check):</strong> {decryptedData.salt}</p>
          <p style={{ fontSize: '0.8em', color: 'gray' }}>Hash Público no Contrato: {(contractStudentData as unknown as StudentContractData)?.publicHash}</p>
        </div>
      )}
    </div>
  );
}