'use client';

import React, { JSX, useState, useEffect, useCallback, ChangeEvent } from "react";
import { useReadContract, useAccount, type BaseError } from "wagmi";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { Address, isAddress, Hex, keccak256, toBytes, bytesToHex } from "viem";
import { decryptECIES } from "@/utils/cripto.utils"; // Nossas novas funções ECIES
import * as CryptoJS from "crypto-js"; // Importar CryptoJS

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
    const { address: connectedAddress, isConnected } = useAccount(); // Endereço da carteira conectada

    const [studentAddress, setStudentAddress] = useState<Address | ''>('');
    const [decryptedData, setDecryptedData] = useState<PersonalInformation | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingDecryption, setIsLoadingDecryption] = useState<boolean>(false);
    const [targetAudience, setTargetAudience] = useState<'self' | 'institution'>('institution'); // Quem está tentando descriptografar

    // Novos estados para upload de arquivo e senha mestra
    const [backupFile, setBackupFile] = useState<File | null>(null);
    const [masterPasswordDecrypt, setMasterPasswordDecrypt] = useState<string>('');
    const [derivedPrivateKey, setDerivedPrivateKey] = useState<Hex | null>(null); // Chave privada obtida do arquivo+senha
    // Novo estado para controlar se a chave privada já foi derivada
    const [isPrivateKeyDerived, setIsPrivateKeyDerived] = useState<boolean>(false);


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
        setError(null);
        setStatus(null);
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
            setError("Por favor, faça upload do arquivo de backup e insira a senha mestra.");
            setIsPrivateKeyDerived(false);
            return null;
        }
        if (masterPasswordDecrypt.length < 12) {
            setError("A senha mestra deve ter pelo menos 12 caracteres.");
            setIsPrivateKeyDerived(false);
            return null;
        }

        setStatus("Lendo arquivo e derivando chave privada...");
        setError(null);
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
            setStatus("Chave privada derivada com sucesso do arquivo e senha.");
            return decryptedPrivateKeyHex as Hex;

        } catch (err: any) {
            console.error("Erro ao derivar chave privada:", err);
            setStatus(null);
            setError(`Falha ao derivar chave privada: ${err.message || String(err)}`);
            setDerivedPrivateKey(null);
            setIsPrivateKeyDerived(false);
            return null;
        }
    }, [backupFile, masterPasswordDecrypt]); // Dependências do useCallback


    const handleGetAndDecryptStudentData = async () => {
        // Primeiro, tenta derivar a chave privada se ainda não foi derivada com sucesso
        let currentDerivedPrivateKey = derivedPrivateKey;
        if (!isPrivateKeyDerived || !currentDerivedPrivateKey) {
            setStatus("Iniciando derivação da chave privada...");
            currentDerivedPrivateKey = await derivePrivateKey();
            if (!currentDerivedPrivateKey) {
                // Se a derivação falhou, a função derivePrivateKey já deve ter setado um erro.
                setIsLoadingDecryption(false);
                return;
            }
        }

        if (!isConnected || !connectedAddress) {
            setError("Conecte sua carteira para buscar e tentar descriptografar os dados.");
            setIsLoadingDecryption(false);
            return;
        }
        if (!studentAddressValid) {
            setError("Por favor, insira um endereço de estudante válido.");
            setIsLoadingDecryption(false);
            return;
        }
        // A verificação `!derivedPrivateKey` agora acontece implicitamente ou via `currentDerivedPrivateKey`
        // após a chamada de `derivePrivateKey`.

        setStatus("Buscando dados do estudante e preparando para descriptografia...");
        setError(null);
        setDecryptedData(null);
        setIsLoadingDecryption(true);

        try {
            const { data: fetchedContractData, error: fetchError } = await refetchStudentData();

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

            setStatus(`Aguardando descriptografia dos dados para a ${expectedDecryptor}...`);

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
            }

            setDecryptedData(personalInfo);
            setStatus(`Dados do estudante descriptografados com sucesso pela ${expectedDecryptor}!`);

        } catch (err: any) {
            console.error("Erro durante a descriptografia:", err);
            setStatus(null);
            setError(`Falha na descriptografia: ${err.message || String(err)}`);
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
        setStatus(null);
        setError(null);
    }, [studentAddress, targetAudience]);

    // Quando o arquivo de backup ou a senha mestra mudam, resetamos o status da chave derivada
    useEffect(() => {
        setIsPrivateKeyDerived(false);
        setDerivedPrivateKey(null);
        setStatus(null); // Limpa o status da derivação anterior
        setError(null); // Limpa o erro da derivação anterior
    }, [backupFile, masterPasswordDecrypt]);


    // Se o componente ainda não foi montado no cliente, retorna um Fragmento vazio
    if (!hasMounted) {
        return <></>;
    }

    const isDecryptButtonDisabled = isLoadingStudent || isLoadingDecryption ||
                                   !studentAddressValid || !backupFile || !masterPasswordDecrypt ||
                                   masterPasswordDecrypt.length < 12;

    return (
        <div style={{ marginTop: '1.5rem', border: '1px solid #007bff', padding: '1rem', borderRadius: '4px' }}>
            <h2>Descriptografar Dados do Estudante</h2>
            <p className="text-sm" style={{ marginBottom: '10px', color: 'gray' }}>
                Para descriptografar, faça upload do arquivo de backup (.json) e insira a senha mestra usada na criação.
                Em seguida, escolha o público-alvo (Aluno ou Instituição) e clique em descriptografar.
            </p>

            {!isConnected || !connectedAddress ? (
                <p style={{ color: 'orange', marginBottom: '1rem' }}>⚠️ Conecte sua carteira para buscar e descriptografar dados.</p>
            ) : (
                <form className="form space-y-3">
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

                    {/* UPLOAD DE ARQUIVO */}
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
                        {backupFile && <p className="text-sm text-gray-600 mt-1">Arquivo selecionado: {backupFile.name}</p>}
                    </div>

                    {/* SENHA MESTRA PARA DESCRIPTOGRAFAR CHAVE PRIVADA */}
                    <div style={{ marginBottom: '1rem' }}>
                        <label htmlFor="masterPasswordDecrypt" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Senha Mestra (usada para criptografar o arquivo de backup):
                        </label>
                        <input
                            id="masterPasswordDecrypt"
                            type="password"
                            value={masterPasswordDecrypt}
                            onChange={(e) => setMasterPasswordDecrypt(e.target.value)}
                            placeholder="Mínimo 12 caracteres"
                            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fffbe6' }}
                            required
                            disabled={isLoadingDecryption}
                        />
                        {masterPasswordDecrypt.length > 0 && masterPasswordDecrypt.length < 12 && (
                            <p className="text-sm text-red-500 mt-1">⚠️ A senha mestra deve ter pelo menos 12 caracteres.</p>
                        )}
                    </div>

                    {/* Status da derivação da chave privada */}
                    {isPrivateKeyDerived && !error && !isLoadingDecryption && (
                        <p style={{ color: 'green', marginTop: '0.8rem' }}>✅ Chave privada derivada com sucesso do arquivo e senha.</p>
                    )}

                    <div style={{ marginTop: '1rem' }}>
                        <label style={{ marginRight: '1rem' }}>
                            <input
                                type="radio"
                                value="institution"
                                checked={targetAudience === 'institution'}
                                onChange={() => { setTargetAudience('institution'); setDecryptedData(null); setError(null); }}
                                disabled={isLoadingDecryption}
                            /> Descriptografar para **Instituição**
                        </label>
                        <label>
                            <input
                                type="radio"
                                value="self"
                                checked={targetAudience === 'self'}
                                onChange={() => { setTargetAudience('self'); setDecryptedData(null); setError(null); }}
                                disabled={isLoadingDecryption}
                            /> Descriptografar para **Aluno**
                        </label>
                        <p className="text-sm text-gray-600 mt-1">
                            Use a chave privada da Instituição para ver os dados dela, ou a chave privada do Aluno para ver os dele.
                        </p>
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

            {status && <p style={{ marginTop: '0.8rem', color: 'green', fontWeight: 'bold' }}>{status}</p>}
            {error && <p style={{ color: 'red', marginTop: '0.8rem' }}>Erro: {error}</p>}
            {isContractReadError && <p style={{ color: 'red' }}>Erro ao ler contrato: {(contractReadError as unknown as BaseError).shortMessage || contractReadError.message}</p>}

            {decryptedData && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#f9f9f9' }}>
                    <h3>✅ Informações Descriptografadas:</h3>
                    <p><strong>Nome:</strong> {decryptedData.name}</p>
                    <p><strong>Documento:</strong> {decryptedData.document}</p>
                    <p><strong>Salt:</strong> {decryptedData.salt}</p>
                    <p style={{ fontSize: '0.8em', color: 'gray' }}>Hash Público no Contrato: { (contractStudentData as unknown as StudentContractData)?.publicHash }</p>
                </div>
            )}
        </div>
    );
}