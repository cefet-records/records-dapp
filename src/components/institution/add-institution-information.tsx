import { FormEvent, JSX, useEffect, useState } from "react";
import {
  type BaseError,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount
} from "wagmi";
import { Address } from "viem";
import { DynamicEmbeddedWidget, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import CryptoJS from "crypto-js";
import * as secp from "@noble/secp256k1";
import { bytesToHex } from "viem";
import { randomBytes } from "@noble/ciphers/utils.js"

export default function AddInstitutionInfo(): JSX.Element {
  const { address, isConnected } = useAccount();
  const [institutionName, setInstitutionName] = useState<string>("");
  const [institutionDocument, setInstitutionDocument] = useState<string>("");
  const [masterPassword, setMasterPassword] = useState<string>("");

  const [downloadLink, setDownloadLink] = useState<string | null>(null);
  const [generatedPublicKey, setGeneratedPublicKey] = useState<string | null>(null);
  const [isGeneratingKeys, setIsGeneratingKeys] = useState<boolean>(false);
  const [keyGenerationError, setKeyGenerationError] = useState<string | null>(null);

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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setKeyGenerationError(null);
    setDownloadLink(null);
    setGeneratedPublicKey(null);

    if (!masterPassword) {
      setKeyGenerationError("Por favor, insira uma senha mestra para criptografar sua chave privada.");
      return;
    }
    if (masterPassword.length < 12) {
      setKeyGenerationError("A senha mestra deve ter pelo menos 12 caracteres.");
      return;
    }
    if (!institutionName || !institutionDocument) {
      setKeyGenerationError("Todos os campos da instituição são obrigatórios.");
      return;
    }

    setIsGeneratingKeys(true);
    try {
      const privateKeyECDSABytes = randomBytes(32);
      const privateKeyECDSAHex = bytesToHex(privateKeyECDSABytes);

      const publicKeyECDSABytes = secp.getPublicKey(privateKeyECDSABytes, false);
      const publicKeyECDSAHex = bytesToHex(publicKeyECDSABytes);

      setGeneratedPublicKey(publicKeyECDSAHex);

      const salt = CryptoJS.lib.WordArray.random(128 / 8);
      const key = CryptoJS.PBKDF2(masterPassword, salt, {
        keySize: KDF_KEY_SIZE / 4,
        iterations: KDF_ITERATIONS,
      });

      // GERAÇÃO DO IV E SUA INCLUSÃO NA CRIPTOGRAFIA E NO BACKUP
      const iv = CryptoJS.lib.WordArray.random(128 / 8); // <<< Gerar o IV aqui

      const encryptedPrivateKey = CryptoJS.AES.encrypt(privateKeyECDSAHex, key, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        iv: iv, // <<< Passar o IV para a criptografia
      }).toString();

      const backupData = {
        encryptedPrivateKey: encryptedPrivateKey,
        salt: salt.toString(CryptoJS.enc.Hex),
        kdfIterations: KDF_ITERATIONS,
        iv: iv.toString(CryptoJS.enc.Hex), // <<< ADICIONAR ESTA LINHA: Salvar o IV no backup!
      };
      const backupContent = JSON.stringify(backupData, null, 2);
      const blob = new Blob([backupContent], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      setDownloadLink(url);

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

  useEffect(() => {
    if (isInstitutionAdded && generatedPublicKey && isConnected) {
      writeAddPublicKey({
        ...wagmiContractConfig,
        functionName: "addInstitutionPublicKey",
        args: [
          address as Address,
          generatedPublicKey,
        ],
      });
      // Não defina setIsGeneratingKeys(false) aqui, pois a transação de chave pública ainda está pendente.
      // Isso será tratado pela lógica de `overallPending` e `overallSuccess`.
    }
  }, [isInstitutionAdded, generatedPublicKey, address, writeAddPublicKey]);

  const displayError = addInstitutionError || addInstitutionConfirmError || addPublicKeyError || addPublicKeyConfirmError;
  const overallPending = isAddingInstitution || isConfirmingAddInstitution || isAddingPublicKey || isConfirmingAddPublicKey || isGeneratingKeys;
  const overallSuccess = isInstitutionAdded && isPublicKeyAdded;

  return (
    <div>
      <h5>Add Institution</h5>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          name="institutionName"
          placeholder="Name"
          value={institutionName}
          onChange={(e) => setInstitutionName(e.target.value)}
          required
        />
        <input
          type="text"
          name="institutionDocument"
          placeholder="Document"
          value={institutionDocument}
          onChange={(e) => setInstitutionDocument(e.target.value)}
          required
        />
        <input
          type="password"
          name="masterPassword"
          placeholder="Master Password for Private Key"
          value={masterPassword}
          onChange={(e) => setMasterPassword(e.target.value)}
          required
        />
        <button disabled={overallPending} type="submit">
          {overallPending
            ? "Processing..."
            : "Add Institution & Generate Keys"}
        </button>

        {addInstitutionHash && <div>Institution Transaction Hash: {addInstitutionHash}</div>}
        {isConfirmingAddInstitution && <div>Waiting for Institution confirmation...</div>}
        {isInstitutionAdded && <div>Institution added successfully!</div>}

        {addPublicKeyHash && <div>Public Key Transaction Hash: {addPublicKeyHash}</div>}
        {isConfirmingAddPublicKey && <div>Waiting for Public Key confirmation...</div>}
        {isPublicKeyAdded && <div>Public Key registered successfully!</div>}

        {keyGenerationError && <div style={{ color: 'red' }}>Key Generation Error: {keyGenerationError}</div>}
        {displayError && <div>Error: {(displayError as BaseError).shortMessage || displayError.message}</div>}

        {downloadLink && overallSuccess && (
          <div style={{ marginTop: '15px' }}>
            <p style={{ fontWeight: 'bold' }}>Importante: Baixe seu Arquivo de Chave Privada Criptografada!</p>
            <p>Este arquivo, junto com sua Senha Mestra, é essencial para descriptografar seus dados acadêmicos. Mantenha-o seguro!</p>
            <a href={downloadLink} download={`${address}_encrypted_private_key.json`}>
              Download Chave Privada Criptografada (JSON)
            </a>
          </div>
        )}
      </form>
    </div>
  );
}