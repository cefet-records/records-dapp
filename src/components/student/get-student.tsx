'use client';

import React, { JSX, useState, useEffect, useCallback, ChangeEvent } from "react";
import { useReadContract, useAccount, type BaseError } from "wagmi";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { Address, isAddress, Hex, keccak256, toBytes, bytesToHex } from "viem";
import { decryptECIES } from "@/utils/cripto.utils"; // Nossas novas funções ECIES
import * as CryptoJS from "crypto-js"; // Importar CryptoJS
import Card from "../card/card";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import UploadCard from "../upload-card/upload-card";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import TransactionInfo from "../transaction-info/transaction-info";
import { useSnackbar } from "../snackbar/snackbar-context";

// Struct da Student retornada pelo contrato
interface StudentContractData {
  studentAddress: Address;
  selfEncryptedInformation: Hex; // Payload ECIES dos dados pessoais para o estudante
  institutionEncryptedInformation: Hex; // Payload ECIES dos dados pessoais para a instituição
  publicKey: Hex; // Chave pública secp256k1 do estudante
  publicHash: Hex;
}

// Struct para as informações pessoais descriptografadas
interface PersonalInformation {
  name: string;
  document: string;
  salt: string;
}

// Interface para o conteúdo do arquivo de backup - ATUALIZADA PARA INCLUIR O IV
interface BackupFileContent {
  encryptedPrivateKey: string; // Chave privada criptografada em Base64
  salt: string;                // Salt usado no PBKDF2 em Hex
  kdfIterations: number;       // Número de iterações do PBKDF2
  iv: string;                  // <<< ADICIONADO: Initialization Vector em Hex
}

export function GetStudent(): JSX.Element {
  const [studentAddress, setStudentAddress] = useState<Address | ''>('');
  const [decryptedData, setDecryptedData] = useState<PersonalInformation | null>(null);
  const [isLoadingDecryption, setIsLoadingDecryption] = useState<boolean>(false);
  const [targetAudience, setTargetAudience] = useState<'self' | 'institution'>('institution'); // Quem está tentando descriptografar

  // Novos estados para upload de arquivo e senha mestra
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [masterPasswordDecrypt, setMasterPasswordDecrypt] = useState<string>('');
  const [derivedPrivateKey, setDerivedPrivateKey] = useState<Hex | null>(null); // Chave privada obtida do arquivo+senha
  // Novo estado para controlar se a chave privada já foi derivada
  const [isPrivateKeyDerived, setIsPrivateKeyDerived] = useState<boolean>(false);

  const { showSnackbar } = useSnackbar();

  const studentAddressValid = isAddress(studentAddress);

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

  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  const KDF_ITERATIONS = 262144; // Deve ser o mesmo que o usado na criação do backup
  const KDF_KEY_SIZE = 256 / 8; // Deve ser o mesmo que o usado na criação do backup

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    setBackupFile(null);
    setDerivedPrivateKey(null); // Limpar chave privada derivada ao mudar o arquivo
    setIsPrivateKeyDerived(false); // Resetar status de derivação
    setDecryptedData(null);

    const file = event.target.files?.[0];
    if (file) {
      setBackupFile(file);
    }
  };

  // Remove o `useEffect` para `derivePrivateKey` para que ela não seja chamada automaticamente.
  // Agora `derivePrivateKey` será chamada apenas no clique do botão.
  const derivePrivateKey = useCallback(async (): Promise<Hex | null> => {
    if (!backupFile || !masterPasswordDecrypt) {
      showSnackbar("Por favor, faça upload do arquivo de backup e insira a senha mestra.", "error");
      setIsPrivateKeyDerived(false);
      return null;
    }
    if (masterPasswordDecrypt.length < 12) {
      showSnackbar("A senha mestra deve ter pelo menos 12 caracteres.", "error");
      setIsPrivateKeyDerived(false);
      return null;
    }

    setDerivedPrivateKey(null); // Limpar antes de tentar derivar
    setIsPrivateKeyDerived(false);

    try {
      const fileContent = await backupFile.text();
      const backupData: BackupFileContent = JSON.parse(fileContent);

      const { encryptedPrivateKey, salt, kdfIterations, iv } = backupData;

      if (kdfIterations !== KDF_ITERATIONS) {
        throw new Error(`As iterações do KDF no arquivo (${kdfIterations}) não correspondem ao esperado (${KDF_ITERATIONS}).`);
      }
      if (!iv || typeof iv !== 'string' || iv.length !== 32) {
        throw new Error("IV (Initialization Vector) não encontrado ou inválido no arquivo de backup.");
      }

      const saltKDF = CryptoJS.enc.Hex.parse(salt);
      const keyKDF = CryptoJS.PBKDF2(masterPasswordDecrypt, saltKDF, {
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
        throw new Error("Falha ao descriptografar a chave privada ou formato inválido (o resultado não é uma chave privada ECDSA Hex).");
      }

      setDerivedPrivateKey(decryptedPrivateKeyHex as Hex);
      setIsPrivateKeyDerived(true); // Definir como true após a derivação bem-sucedida
      return decryptedPrivateKeyHex as Hex;

    } catch (err: any) {
      console.error("Erro ao derivar chave privada:", err);
      showSnackbar("Falha ao derivar chave privada: ", "error");
      setDerivedPrivateKey(null);
      setIsPrivateKeyDerived(false);
      return null;
    }
  }, [backupFile, masterPasswordDecrypt]); // Dependências do useCallback


  const handleGetAndDecryptStudentData = async () => {
    // Primeiro, tenta derivar a chave privada se ainda não foi derivada com sucesso
    let currentDerivedPrivateKey = derivedPrivateKey;
    if (!isPrivateKeyDerived || !currentDerivedPrivateKey) {
      currentDerivedPrivateKey = await derivePrivateKey();
      if (!currentDerivedPrivateKey) {
        // Se a derivação falhou, a função derivePrivateKey já deve ter setado um erro.
        setIsLoadingDecryption(false);
        return;
      }
    }

    if (!studentAddressValid) {
      showSnackbar("Endereço de estudante inválido.", "error");
      setIsLoadingDecryption(false);
      return;
    }

    setDecryptedData(null);
    setIsLoadingDecryption(true);

    try {
      const { data: fetchedContractData, error: fetchError } = await refetchStudentData();

      showSnackbar("Iniciando descriptografia dos dados do estudante...", "info");

      if (fetchError) {

        throw new Error(`Erro ao buscar dados do contrato: ${(fetchError as unknown as BaseError).shortMessage || fetchError.message}`);
      }
      if (!fetchedContractData) {
        throw new Error("Nenhum dado de estudante encontrado para o endereço fornecido.");
      }

      const student = fetchedContractData as unknown as StudentContractData;
      console.log("student", student);
      let encryptedPayloadToDecrypt: Hex;
      let expectedDecryptor: string;

      if (targetAudience === 'institution') {
        encryptedPayloadToDecrypt = student.institutionEncryptedInformation;
        expectedDecryptor = "instituição";
      } else { // 'self'
        encryptedPayloadToDecrypt = student.selfEncryptedInformation;
        expectedDecryptor = "aluno";
      }

      if (!encryptedPayloadToDecrypt || encryptedPayloadToDecrypt === '0x') {
        throw new Error(`Payload de dados cifrados para a ${expectedDecryptor} não encontrado no contrato para este estudante.`);
      }

      // Usando a chave privada DERIVADA (que agora temos certeza que é válida)
      const decryptedPersonalInformationJson = await decryptECIES(encryptedPayloadToDecrypt, currentDerivedPrivateKey as Hex);
      console.log("ou", decryptedPersonalInformationJson);
      if (!decryptedPersonalInformationJson) {
        throw new Error("Falha ao descriptografar os dados pessoais. Chave privada incorreta ou payload ECIES corrompido.");
      }

      const personalInfo: PersonalInformation = JSON.parse(decryptedPersonalInformationJson);

      // Verificação do hash público
      const calculatedHash = keccak256(toBytes(decryptedPersonalInformationJson));
      if (calculatedHash !== student.publicHash) {
        console.warn("AVISO: Hash dos dados descriptografados NÃO COINCIDE com o hash do contrato! Dados podem ter sido alterados ou a descriptografia falhou parcialmente.");
        showSnackbar("Aviso: A verificação do hash dos dados descriptografados falhou!", "warning");
      }
      setDecryptedData(personalInfo);

      showSnackbar("Dados do estudante descriptografados com sucesso!", "success");
    } catch (err: any) {
      console.error("Erro durante a descriptografia:", "error");
      showSnackbar("Falha na descriptografia:", "error");
    } finally {
      setIsLoadingDecryption(false);
    }
  };

  useEffect(() => {
    setDecryptedData(null);
    // Limpa o status de chave derivada quando o endereço do estudante ou o público-alvo muda,
    // pois a chave derivada pode não ser relevante para o novo contexto.
    setIsPrivateKeyDerived(false);
    setDerivedPrivateKey(null);
  }, [studentAddress, targetAudience]);

  // Quando o arquivo de backup ou a senha mestra mudam, resetamos o status da chave derivada
  useEffect(() => {
    setIsPrivateKeyDerived(false);
    setDerivedPrivateKey(null);
  }, [backupFile, masterPasswordDecrypt]);


  useEffect(() => {
    if (isContractReadError) {
      showSnackbar("Erro ao ler contrato!", "error");
    }
  }, [isContractReadError, showSnackbar]);

  const isDecryptButtonDisabled = isLoadingStudent || isLoadingDecryption ||
    !studentAddressValid || !backupFile || !masterPasswordDecrypt ||
    masterPasswordDecrypt.length < 12;

  return (
    <Card>
      <Stack>
        <Typography variant="h4" component="h4">Descriptografar Dados do Estudante</Typography>
        <Typography variant="body1" component="p" className="info-text">
          Para descriptografar, faça upload do arquivo de backup (.json) e insira a senha mestra usada na criação.
          Em seguida, escolha o público-alvo (Aluno ou Instituição) e clique em descriptografar.
        </Typography>
      </Stack>

      <form className="form space-y-3">
        <Stack gap={2}>
          <TextField
            label="Endereço do Estudante (0x...)"
            variant="outlined"
            required
            value={studentAddress}
            onChange={(e) => {
              setStudentAddress(e.target.value as Address | '');
              setDecryptedData(null);
            }}
            disabled={isLoadingDecryption}
            size="small"
          />

          {backupFile && <p className="info-text">Arquivo selecionado: {backupFile.name}</p>}
          <UploadCard label="Upload do Arquivo de Chave Privada Criptografada (.json)" handleFileChange={handleFileChange} />

          <Stack>
            <label htmlFor="masterPasswordDecrypt" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Senha Mestra (usada para criptografar o arquivo de backup):
            </label>
            <TextField
              id="masterPasswordDecrypt"
              label="Mínimo 12 caracteres"
              variant="outlined"
              required
              value={masterPasswordDecrypt}
              onChange={(e) => setMasterPasswordDecrypt(e.target.value)}
              disabled={isLoadingDecryption}
              size="small"
            />
          </Stack>

          <FormControl disabled={isLoadingDecryption}>
            <RadioGroup
              aria-labelledby="target-audience-label"
              name="targetAudience"
              value={targetAudience}
              onChange={(e) => {
                setTargetAudience(e.target.value as 'self' | 'institution');
                setDecryptedData(null);
              }}
            >
              <Stack flexDirection="row">
                <FormControlLabel
                  value="self"
                  control={<Radio />}
                  label="Descriptografar para Aluno"
                />

                <FormControlLabel
                  value="institution"
                  control={<Radio />}
                  label="Descriptografar para Instituição"
                />
              </Stack>
            </RadioGroup>

            <p className="info-text">
              Use a chave privada da Instituição para ver os dados dela, ou a chave privada do Aluno para ver os dele.
            </p>
          </FormControl>

          <Button
            type="button"
            onClick={handleGetAndDecryptStudentData}
            className="register-button"
            disabled={isDecryptButtonDisabled}
          >
            {isLoadingDecryption ? "Descriptografando..." : isLoadingStudent ? "Buscando Dados..." : "Descriptografar Dados"}
          </Button>
        </Stack>
      </form>

      {decryptedData && (
        <Stack gap={2}>
          <Typography variant="h6" component="h6">Informações Descriptografadas:</Typography>
          <p>Nome: {decryptedData?.name}</p>
          <p>Documento: {decryptedData?.document}</p>
          <p>Salt: {decryptedData?.salt}</p>
          <TransactionInfo label="Hash Público no Contrato:" hash={(contractStudentData as unknown as StudentContractData)?.publicHash} />
        </Stack>
      )}
    </Card>
  );
}