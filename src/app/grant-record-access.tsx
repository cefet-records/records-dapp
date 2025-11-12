'use client';

import React, { JSX, useState, useEffect } from "react";
import { useReadContract, useAccount, type BaseError } from "wagmi";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { Address, isAddress, Hex, keccak256, toBytes } from "viem";
import { decryptECIES, encryptECIES } from "@/utils/cripto.utils"; // Nossas funções ECIES

// Interfaces como antes
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

export function GrantVisitorAccess(): JSX.Element {
    const { address: connectedAddress, isConnected } = useAccount(); // Deve ser o aluno

    const [studentAddressInput, setStudentAddressInput] = useState<Address | ''>('');
    const [visitorPublicKeyInput, setVisitorPublicKeyInput] = useState<Hex | ''>(''); // Chave pública secp256k1 do visitante
    const [encryptedDataForVisitor, setEncryptedDataForVisitor] = useState<Hex | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingAccess, setIsLoadingAccess] = useState<boolean>(false);

    const studentAddressValid = isAddress(studentAddressInput);
    const visitorPublicKeyValid = visitorPublicKeyInput.startsWith('0x') && (visitorPublicKeyInput.length === 66 || visitorPublicKeyInput.length === 130); // 33 bytes comprimido ou 65 bytes não comprimido + '0x'

    const { 
        data: contractStudentData, 
        isLoading: isLoadingStudent, 
        isError: isContractReadError, 
        error: contractReadError,
        refetch: refetchStudentData
    } = useReadContract({
        ...wagmiContractConfig,
        functionName: 'getStudent', 
        args: studentAddressValid ? [studentAddressInput] : undefined,
        query: { enabled: studentAddressValid, staleTime: 1_000 }
    });

    const handleGrantAccess = async () => {
        if (!isConnected || !connectedAddress) {
            setError("Conecte a carteira do ALUNO para conceder acesso.");
            return;
        }
        if (connectedAddress !== studentAddressInput) {
            setError("Você deve estar conectado com a carteira do ALUNO para conceder acesso aos seus dados.");
            return;
        }
        if (!studentAddressValid || !visitorPublicKeyValid) {
            setError("Por favor, insira um endereço de estudante válido e uma chave pública de visitante válida.");
            return;
        }

        setStatus("Buscando dados do estudante e preparando para re-criptografar...");
        setError(null);
        setEncryptedDataForVisitor(null);
        setIsLoadingAccess(true);

        try {
            const { data: fetchedContractData, error: fetchError } = await refetchStudentData();

            if (fetchError) {
                throw new Error(`Erro ao buscar dados do contrato: ${(fetchError as unknown as BaseError).shortMessage || fetchError.message}`);
            }
            if (!fetchedContractData) {
                throw new Error("Nenhum dado de estudante encontrado para o endereço fornecido.");
            }

            const student = fetchedContractData as unknown as StudentContractData;
            const encryptedForSelf = student.selfEncryptedInformation;

            if (!encryptedForSelf || encryptedForSelf === '0x') {
                throw new Error("Payload de dados cifrados para o próprio aluno não encontrado no contrato.");
            }

            // *** AQUI É O PONTO CRÍTICO NOVAMENTE ***
            // Para o aluno descriptografar seus próprios dados, ele precisa da sua chave privada.
            // Se você não quiser pedir ao usuário (o ideal), e não estiver usando `eth_decrypt` (que é x25519),
            // a carteira (Dynamic/Metamask) precisaria expor uma API de descriptografia para chaves secp256k1.
            // Atualmente, tal API não é padrão.
            // PARA DEMONSTRAÇÃO/TESTE, ASSUMO QUE VOCÊ TEM UMA FORMA SEGURA DE OBTER A CHAVE PRIVADA
            // DO `connectedAddress` (ALUNO) PARA O `decryptECIES`. ISSO NÃO É PARA PRODUÇÃO.

            // EXEMPLO (NÃO SEGURO PARA PROD):
            const studentPrivateKey = '0x...'; // VOCÊ PRECISA DE UMA FORMA DE OBTER ISSO AQUI
            if (!studentPrivateKey) {
                throw new Error("Chave privada do aluno não disponível para descriptografia interna.");
            }
            const decryptedPersonalInformationJson = await decryptECIES(encryptedForSelf, studentPrivateKey);

            // throw new Error("Para conceder acesso, o aluno precisa primeiro descriptografar seus próprios dados. Isso requer acesso à chave privada do aluno, o que é um risco de segurança. Considere alternativas como links de acesso temporários ou DIDs para visitantes.");
            
            
            // Se a descriptografia for bem-sucedida, continue:
            const personalInfo: PersonalInformation = JSON.parse(decryptedPersonalInformationJson);
            const informationString = JSON.stringify(personalInfo);

            // Re-criptografar os dados para a chave pública do visitante
            setStatus("Re-criptografando os dados para o visitante...");
            const reEncryptedForVisitor = await encryptECIES(informationString, visitorPublicKeyInput as Hex);
            
            setEncryptedDataForVisitor(reEncryptedForVisitor);
            setStatus("Dados re-criptografados para o visitante com sucesso! Compartilhe o payload Hex abaixo.");

            console.log("Payload ECIES para o visitante:", reEncryptedForVisitor);
            

        } catch (err: any) {
            console.error("Erro ao conceder acesso:", err);
            setStatus(null);
            setError(`Falha ao conceder acesso: ${err.message || String(err)}`);
        } finally {
            setIsLoadingAccess(false);
        }
    };

    useEffect(() => {
        setEncryptedDataForVisitor(null);
        setStatus(null);
        setError(null);
    }, [studentAddressInput, visitorPublicKeyInput]);

    return (
        <div style={{ marginTop: '1.5rem', border: '1px solid #007bff', padding: '1rem', borderRadius: '4px' }}>
            <h2>Conceder Acesso a Visitantes (Aluno)</h2>
            <p className="text-sm" style={{ marginBottom: '10px', color: 'gray' }}>
                Como aluno, você pode re-criptografar seus dados para uma chave pública de visitante, permitindo que eles descriptografem.
            </p>

            {!isConnected || !connectedAddress ? (
                <p style={{ color: 'orange', marginBottom: '1rem' }}>⚠️ Conecte sua carteira de ALUNO para conceder acesso.</p>
            ) : (
                <form className="form space-y-3">
                    <input
                        type="text"
                        placeholder="Seu Endereço de Estudante"
                        value={studentAddressInput}
                        onChange={(e) => {
                            setStudentAddressInput(e.target.value as Address | '');
                            setStatus(null);
                            setError(null);
                            setEncryptedDataForVisitor(null);
                        }}
                        className="w-full p-2 border rounded"
                    />

                    {!studentAddressValid && studentAddressInput !== '' && (
                        <p className="text-sm text-red-500">⚠️ Endereço de estudante inválido.</p>
                    )}
                    {connectedAddress !== studentAddressInput && studentAddressInput !== '' && (
                        <p className="text-sm text-red-500">⚠️ A carteira conectada não é a do estudante informado.</p>
                    )}

                    <input
                        type="text"
                        placeholder="Chave Pública do Visitante (Hex, secp256k1)"
                        value={visitorPublicKeyInput}
                        onChange={(e) => {
                            setVisitorPublicKeyInput(e.target.value as Hex | '');
                            setStatus(null);
                            setError(null);
                            setEncryptedDataForVisitor(null);
                        }}
                        className="w-full p-2 border rounded"
                        style={{ marginTop: '10px' }}
                    />
                     {!visitorPublicKeyValid && visitorPublicKeyInput !== '' && (
                        <p className="text-sm text-red-500">⚠️ Chave pública de visitante inválida. Deve ser um Hex (0x...) de 66 ou 130 caracteres.</p>
                    )}

                    <button 
                        type="button" 
                        onClick={handleGrantAccess}
                        disabled={isLoadingStudent || isLoadingAccess || !studentAddressValid || !visitorPublicKeyValid || connectedAddress !== studentAddressInput}
                        style={{ padding: '0.5rem 1rem', backgroundColor: '#007bff', color: 'white', borderRadius: '4px', opacity: (isLoadingStudent || isLoadingAccess || !studentAddressValid || !visitorPublicKeyValid || connectedAddress !== studentAddressInput) ? 0.6 : 1, marginTop: '10px' }}
                    >
                        {isLoadingAccess ? "Processando..." : isLoadingStudent ? "Buscando Dados..." : "Gerar Acesso para Visitante"}
                    </button>
                </form>
            )}

            {status && <p style={{ marginTop: '0.8rem', color: 'green', fontWeight: 'bold' }}>{status}</p>}
            {error && <p style={{ color: 'red', marginTop: '0.8rem' }}>Erro: {error}</p>}
            {isContractReadError && <p style={{ color: 'red' }}>Erro ao ler contrato: {(contractReadError as unknown as BaseError).shortMessage || contractReadError.message}</p>}

            {encryptedDataForVisitor && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#f9f9f9', wordBreak: 'break-all' }}>
                    <h3>✅ Dados Cifrados para Visitante:</h3>
                    <p>Copie o payload abaixo e forneça-o ao visitante para que ele possa descriptografar com sua chave privada correspondente.</p>
                    <textarea 
                        readOnly 
                        value={encryptedDataForVisitor} 
                        style={{ width: '100%', height: '150px', marginTop: '0.5rem', fontFamily: 'monospace', padding: '0.5rem', border: '1px solid #ced4da', borderRadius: '4px' }}
                    />
                    <button 
                        onClick={() => navigator.clipboard.writeText(encryptedDataForVisitor)} 
                        style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', backgroundColor: '#6c757d', color: 'white', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
                    >
                        Copiar Payload
                    </button>
                </div>
            )}
        </div>
    );
}