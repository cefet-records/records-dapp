'use client';

import React, { JSX, useState, useEffect, useCallback, ChangeEvent } from "react";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { isAddress, Address, Hex } from "viem";
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI";
import { encryptECIES, decryptECIES } from '../../utils/cripto.utils';
import CryptoJS from "crypto-js";

// Componentes de UI
import Card from "../card/card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import UploadCard from "../upload-card/upload-card";
import Button from "@mui/material/Button";
import { useSnackbar } from "../snackbar/snackbar-context";

// --- CONSTANTES ---
const KDF_ITERATIONS = 262144;
const KDF_KEY_SIZE = 256 / 8;
const PREFIX_STUDENT = "studentEncryptedPrivateKey_";
const PREFIX_INSTITUTION = "institutionEncryptedPrivateKey_";
const PREFIX_VIEWER = "viewerEncryptedPrivateKey_";

// --- INTERFACES ---
interface BackupFileContent {
  encryptedPrivateKey: string;
  salt: string;
  kdfIterations: number;
  iv: string;
}

export function AllowAccessToAddress(): JSX.Element {
  const { address: connectedAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { showSnackbar } = useSnackbar();
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();

  // 1. ESTADOS
  const [hasMounted, setHasMounted] = useState(false);
  const [allowedAddress, setAllowedAddress] = useState<Address | "">("");
  
  // Nome unificado: encryptedBackupData
  const [encryptedBackupData, setEncryptedBackupData] = useState<BackupFileContent | null>(null);
  
  const [studentMasterPasswordDecrypt, setStudentMasterPasswordDecrypt] = useState<string>('');
  const [isFromLocalStorage, setIsFromLocalStorage] = useState(false);
  const [detectedRole, setDetectedRole] = useState("");

  const allowedAddressValid = isAddress(allowedAddress);
  const connectedAddressValid = isConnected && !!connectedAddress;

  // 2. HOOKS WAGMI
  const { refetch: refetchRecipientKey } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'retrieveRecipientEncrpytKey',
    args: allowedAddressValid && connectedAddress ? [allowedAddress, connectedAddress] : undefined,
    query: { enabled: false },
  });

  const { refetch: refetchStudentData } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getStudent',
    args: connectedAddress ? [connectedAddress] : undefined,
    query: { enabled: false },
  });

  // 3. EFEITOS
  useEffect(() => { 
    setHasMounted(true); 
  }, []);

  useEffect(() => {
    if (hasMounted && isConnected && connectedAddress) {
      const addr = connectedAddress.toLowerCase();
      const prefixes = [
        { p: PREFIX_STUDENT, n: "Aluno" },
        { p: PREFIX_INSTITUTION, n: "Instituição" },
        { p: PREFIX_VIEWER, n: "Visitante/Geral" }
      ];

      let found = false;
      for (const item of prefixes) {
        const stored = localStorage.getItem(`${item.p}${addr}`);
        if (stored) {
          try {
            setEncryptedBackupData(JSON.parse(stored));
            setIsFromLocalStorage(true);
            setDetectedRole(item.n);
            found = true;
            break;
          } catch (e) {
            console.error("Erro ao parsear backup local", e);
          }
        }
      }
      if (!found) {
        setEncryptedBackupData(null);
        setIsFromLocalStorage(false);
      }
    }
  }, [hasMounted, isConnected, connectedAddress]);

  // 4. FUNÇÕES DE SUPORTE
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const data = JSON.parse(await file.text());
        setEncryptedBackupData(data);
        setIsFromLocalStorage(false);
        showSnackbar("Backup carregado!", "success");
      } catch (e) {
        showSnackbar("Erro ao ler arquivo JSON", "error");
      }
    }
  };

  const deriveKey = async (data: BackupFileContent): Promise<Hex | null> => {
    try {
      const saltKDF = CryptoJS.enc.Hex.parse(data.salt);
      const keyKDF = CryptoJS.PBKDF2(studentMasterPasswordDecrypt, saltKDF, {
        keySize: KDF_KEY_SIZE / 4,
        iterations: data.kdfIterations || KDF_ITERATIONS,
      });
      const iv = CryptoJS.enc.Hex.parse(data.iv);
      const decrypted = CryptoJS.AES.decrypt(data.encryptedPrivateKey, keyKDF, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        iv: iv,
      }).toString(CryptoJS.enc.Utf8);

      if (!decrypted.startsWith('0x')) throw new Error();
      return decrypted as Hex;
    } catch (e) {
      showSnackbar("Senha mestra incorreta", "error");
      return null;
    }
  };

  // 5. FUNÇÃO PRINCIPAL
  const allowAccess = async () => {
    if (!connectedAddressValid || !allowedAddressValid || !encryptedBackupData) {
      showSnackbar("Preencha todos os campos obrigatórios.", "warning");
      return;
    }

    try {
      showSnackbar("Processando descriptografia local...", "info");
      const privKey = await deriveKey(encryptedBackupData);
      if (!privKey) return;

      const { data: recipientPK } = await refetchRecipientKey();
      if (!recipientPK || recipientPK === '0x') {
        throw new Error("Chave do visitante não encontrada. Ele deve solicitar acesso primeiro.");
      }

      const { data: studentData } = await refetchStudentData();
      const selfPayload = (studentData as any)?.selfEncryptedInformation;

      if (!selfPayload || selfPayload === '0x') {
        throw new Error("Seus dados não foram encontrados no contrato.");
      }

      const studentInfoStr = await decryptECIES(selfPayload, privKey);
      const newlyEncryptedValue = await encryptECIES(studentInfoStr, recipientPK as Hex);

      const txHash = await writeContractAsync({
        ...wagmiContractConfig,
        functionName: 'addEncryptedInfoWithRecipientKey',
        args: [allowedAddress, connectedAddress, newlyEncryptedValue],
      });

      showSnackbar("Aguardando confirmação...", "info");
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      showSnackbar("Acesso concedido com sucesso!", "success");
      setAllowedAddress("");
    } catch (error: any) {
      showSnackbar(error.message || "Erro ao conceder acesso", "error");
    }
  };

  // 6. RENDERIZAÇÃO
  if (!hasMounted) return <Card><Typography>Iniciando...</Typography></Card>;

  const isDisabled = isWritePending || !allowedAddressValid || !encryptedBackupData || studentMasterPasswordDecrypt.length < 12;

  return (
    <Card>
      <Stack gap={3}>
        <Typography variant="h5" fontWeight="bold">Conceder Acesso a Terceiros</Typography>
        
        <TextField
          label="Endereço do Visitante (0x...)"
          fullWidth
          size="small"
          value={allowedAddress}
          onChange={(e) => setAllowedAddress(e.target.value as Address)}
          error={allowedAddress !== "" && !isAddress(allowedAddress)}
        />

        {/* DETECÇÃO DE BACKUP */}
        {isFromLocalStorage && encryptedBackupData ? (
          <Stack sx={{ p: 2, bgcolor: 'rgba(25, 118, 210, 0.08)', borderRadius: 2, border: '1px solid #1976d2' }}>
            <Typography variant="body2" color="primary" fontWeight="bold">
              ✅ Backup de {detectedRole} detectado no navegador
            </Typography>
            <Button 
              size="small" 
              sx={{ alignSelf: 'flex-start', mt: 1, textTransform: 'none' }} 
              onClick={() => {
                setEncryptedBackupData(null);
                setIsFromLocalStorage(false);
              }}
            >
              Usar outro arquivo
            </Button>
          </Stack>
        ) : (
          <UploadCard 
            label="Seu Arquivo de Chave Privada (.json)" 
            handleFileChange={handleFileChange} 
          />
        )}

        <TextField
          label="Sua Senha Mestra"
          type="password"
          fullWidth
          size="small"
          value={studentMasterPasswordDecrypt}
          onChange={(e) => setStudentMasterPasswordDecrypt(e.target.value)}
          disabled={!encryptedBackupData}
        />

        <Button
          variant="contained"
          onClick={allowAccess}
          disabled={isDisabled}
        >
          {isWritePending ? "Enviando Transação..." : "Conceder Acesso"}
        </Button>
      </Stack>
    </Card>
  );
}