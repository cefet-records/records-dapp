'use client';

import React, { JSX, useState, useEffect, FormEvent } from "react";
import {
    useWriteContract,
    useWaitForTransactionReceipt,
    useReadContract,
    useAccount,
    type BaseError
} from "wagmi";
import * as secp from "@noble/secp256k1";
import { hexToBytes, bytesToHex, Address, Hex, isAddress, keccak256, toBytes } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { encryptECIES } from "@/utils/cripto.utils";
import { randomBytes } from "@noble/ciphers/utils.js";
import * as CryptoJS from "crypto-js";

interface InstitutionContractData {
    institutionAddress: Address;
    publicKey: Hex;
}

interface PersonalInformation {
    name: string;
    document: string;
    salt: string;
}

export function AddStudentInformation(): JSX.Element {
    const { primaryWallet } = useDynamicContext();
    const { address, isConnected } = useAccount();

    const [institutionAddress, setInstitutionAddress] = useState<Address | ''>('');
    const [name, setName] = useState("");
    const [document, setDocument] = useState("");
    const [masterPassword, setMasterPassword] = useState<string>("");

    const [downloadLink, setDownloadLink] = useState<string | null>(null);
    const [generatedStudentPublicKey, setGeneratedStudentPublicKey] = useState<Hex | null>(null);
    const [isGeneratingKeys, setIsGeneratingKeys] = useState<boolean>(false);
    const [keyGenerationError, setKeyGenerationError] = useState<string | null>(null);
    const [generatedStudentPrivateKeyHex, setGeneratedStudentPrivateKeyHex] = useState<Hex | null>(null);

    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { data: addInfoHash, error: writeError, isPending: isTxPending, writeContract } = useWriteContract();
    const { isLoading: isTxConfirming, isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({ hash: addInfoHash });

    const institutionAddressValid = isAddress(institutionAddress);

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

    const KDF_ITERATIONS = 262144;
    const KDF_KEY_SIZE = 256 / 8;

    const handleGenerateKeysAndAddInfo = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
        e.preventDefault();

        // Resetar estados relevantes para uma nova tentativa
        setKeyGenerationError(null);
        setDownloadLink(null);
        setGeneratedStudentPublicKey(null);
        setGeneratedStudentPrivateKeyHex(null);
        setError(null);
        setStatus(null);

        // Validações iniciais
        if (!masterPassword) {
            setKeyGenerationError("Por favor, insira uma senha mestra para criptografar sua chave privada.");
            return;
        }
        if (masterPassword.length < 12) {
            setKeyGenerationError("A senha mestra deve ter pelo menos 12 caracteres.");
            return;
        }
        if (!institutionAddressValid || !name || !document || !address || !isConnected) {
            setError("Por favor, preencha todos os campos e conecte sua carteira.");
            return;
        }

        setIsGeneratingKeys(true);
        setStatus("Gerando par de chaves e preparando dados...");

        try {
            // 1. Gerar Par de Chaves ECDSA (secp256k1) para o Estudante
            const privateKeyECDSABytes = randomBytes(32);
            const privateKeyECDSAHex = bytesToHex(privateKeyECDSABytes) as Hex;

            const publicKeyECDSABytes = secp.getPublicKey(privateKeyECDSABytes, false);
            const publicKeyECDSAHex = bytesToHex(publicKeyECDSABytes) as Hex;

            setGeneratedStudentPublicKey(publicKeyECDSAHex);
            setGeneratedStudentPrivateKeyHex(privateKeyECDSAHex);

            // 2. Criptografar a Chave Privada do Estudante com a Senha Mestra (PBKDF2 + AES)
            const saltKDF = CryptoJS.lib.WordArray.random(128 / 8);
            const keyKDF = CryptoJS.PBKDF2(masterPassword, saltKDF, {
                keySize: KDF_KEY_SIZE / 4,
                iterations: KDF_ITERATIONS,
            });

            // GERAÇÃO DO IV E SUA INCLUSÃO NA CRIPTOGRAFIA E NO BACKUP
            const iv = CryptoJS.lib.WordArray.random(128 / 8); // <<< Gerar o IV aqui

            const encryptedStudentPrivateKey = CryptoJS.AES.encrypt(privateKeyECDSAHex, keyKDF, {
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7,
                iv: iv, // <<< Passar o IV para a criptografia
            }).toString();

            // 3. Preparar e oferecer o download do arquivo TXT de backup
            const backupData = {
                encryptedPrivateKey: encryptedStudentPrivateKey,
                salt: saltKDF.toString(CryptoJS.enc.Hex),
                kdfIterations: KDF_ITERATIONS,
                iv: iv.toString(CryptoJS.enc.Hex), // <<< ADICIONAR ESTA LINHA: Salvar o IV no backup!
            };
            const backupContent = JSON.stringify(backupData, null, 2);
            const blob = new Blob([backupContent], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            setDownloadLink(url);

            // 4. Preparar dados pessoais para criptografia e envio on-chain
            const saltPersonalDataBytes = randomBytes(16);
            const saltPersonalDataHex = bytesToHex(saltPersonalDataBytes);

            const personalInformation: PersonalInformation = { name, document, salt: saltPersonalDataHex };
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

            setStatus("Aguardando confirmação na carteira para adicionar informações...");
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
            setGeneratedStudentPrivateKeyHex(null);
        }
    };

    useEffect(() => {
        if (isTxConfirmed) {
            setStatus("Informação do estudante adicionada com sucesso!");
            setError(null);
            setInstitutionAddress('');
            setName('');
            setDocument('');
            setMasterPassword('');
            setIsGeneratingKeys(false);
        }
    }, [isTxConfirmed]);

    const isAddInfoDisabled = isTxPending || isLoadingInst || !isConnected ||
                              !institutionAddressValid || !name || !document ||
                              isGeneratingKeys ||
                              !masterPassword || masterPassword.length < 12;

    const isInstitutionPublicKeyInvalid = institutionAddressValid && !isLoadingInst && !isInstError &&
                                            (!institutionData || (institutionData as InstitutionContractData).publicKey?.length < 132 || (institutionData as InstitutionContractData).publicKey === '0x');

    if (!hasMounted) {
        return <></>;
    }

    return (
        <div style={{ marginTop: '1.5rem', border: '1px solid #007bff', padding: '1rem', borderRadius: '4px' }}>
            <h2>Adicionar Informação Pessoal do Estudante</h2>
            <p className="text-sm" style={{ marginBottom: '10px', color: 'gray' }}>
                Suas informações são cifradas para você e para a instituição de auditoria. Sua chave pública de encriptação é registrada.
                Você precisará de sua senha mestra e do arquivo de backup da chave privada para descriptografar seus dados.
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
                        value={document}
                        onChange={(e) => {
                            setDocument(e.target.value);
                            setError(null);
                            setStatus(null);
                        }}
                        className="w-full p-2 border rounded"
                        required
                        disabled={isGeneratingKeys || isTxPending}
                    />

                    <div style={{ marginBottom: '1rem' }}>
                        <label htmlFor="masterPassword" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Sua Senha Mestra (para Criptografar sua Chave Privada):
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
            {writeError && <p style={{ color: 'red' }}>Erro na transação: {(writeError as unknown as BaseError).shortMessage || writeError.message}</p>}

            {generatedStudentPublicKey && !keyGenerationError && (
                <p style={{ color: 'blue', marginTop: '0.8rem' }}>
                    ✅ Chave Pública ECDSA Gerada: <code style={{ fontSize: '0.8em', wordBreak: 'break-all' }}>{generatedStudentPublicKey}</code>
                    <br />
                    {!isTxConfirmed && "Aguardando sua confirmação na carteira para registrar esta chave e seus dados."}
                </p>
            )}

            {downloadLink && isTxConfirmed && (
                <div style={{ marginTop: '15px' }}>
                    <p style={{ fontWeight: 'bold' }}>Importante: Baixe seu Arquivo de Chave Privada Criptografada!</p>
                    <p>Este arquivo, junto com sua Senha Mestra, é essencial para descriptografar seus dados acadêmicos. Mantenha-o seguro e não o compartilhe. Faça um backup em local seguro.</p>
                    <a href={downloadLink} download={`${address}_student_encrypted_private_key.json`}
                       style={{ display: 'inline-block', padding: '0.5rem 1rem', backgroundColor: '#007bff', color: 'white', borderRadius: '4px', textDecoration: 'none', marginTop: '0.5rem' }}>
                        Download Chave Privada Criptografada (JSON)
                    </a>
                </div>
            )}
        </div>
    );
}