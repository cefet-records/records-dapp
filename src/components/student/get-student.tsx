'use client';

import React, { JSX, useState, useEffect, useCallback } from "react";
import { useReadContract, useAccount, type BaseError } from "wagmi";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { Address, isAddress, Hex, keccak256, toBytes, bytesToHex } from "viem";
import { decryptECIES } from "@/utils/cripto.utils"; // Nossas novas funções ECIES

// Struct da Student retornada pelo contrato
interface StudentContractData {
    studentAddress: Address;
    selfEncryptedInformation: Hex;      // Payload ECIES dos dados pessoais para o estudante
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

export function GetStudent(): JSX.Element {
    const { address: connectedAddress, isConnected } = useAccount(); // Endereço da carteira conectada

    const [studentAddress, setStudentAddress] = useState<Address | ''>('');
    const [decryptedData, setDecryptedData] = useState<PersonalInformation | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoadingDecryption, setIsLoadingDecryption] = useState<boolean>(false);
    const [targetAudience, setTargetAudience] = useState<'self' | 'institution'>('institution'); // Quem está tentando descriptografar
    const [privateKeyInput, setPrivateKeyInput] = useState<Hex | ''>(''); // NOVO ESTADO PARA A CHAVE PRIVADA

    const studentAddressValid = isAddress(studentAddress);
    // Validação básica para a chave privada: precisa ser hex e ter o comprimento correto para secp256k1 (64 caracteres + 0x)
    const privateKeyValid = privateKeyInput.startsWith('0x') && privateKeyInput.length === 66;

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

    // NOVO ESTADO E useEffect PARA HYDRATION
    const [hasMounted, setHasMounted] = useState(false); 
    useEffect(() => {
      setHasMounted(true); 
    }, []);

    const handleGetAndDecryptStudentData = async () => {
        if (!isConnected || !connectedAddress) {
            setError("Conecte sua carteira para buscar e tentar descriptografar os dados.");
            return;
        }
        if (!studentAddressValid) {
            setError("Por favor, insira um endereço de estudante válido.");
            return;
        }
        // NOVA VERIFICAÇÃO PARA A CHAVE PRIVADA
        if (!privateKeyValid) {
            setError("Por favor, insira uma chave privada válida (0x... com 64 caracteres hex).");
            return;
        }
        
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
                // A verificação de `connectedAddress !== student.studentAddress` faz sentido SE o aluno estiver tentando descriptografar *seus próprios* dados *apenas* com sua chave privada.
                // Mas se ele inserir a chave privada *de outro aluno* ou *da instituição*, ele pode descriptografar se tiver a chave.
                // Para simplificar e focar na funcionalidade ECIES, vamos remover a restrição de "conectado como" aqui.
                // A responsabilidade de usar a chave privada correta recai sobre o usuário.
            }

            if (!encryptedPayloadToDecrypt || encryptedPayloadToDecrypt === '0x') {
                throw new Error(`Payload de dados cifrados para a ${expectedDecryptor} não encontrado no contrato para este estudante.`);
            }
            
            setStatus(`Aguardando descriptografia dos dados para a ${expectedDecryptor}...`);

            // Usando a chave privada do input
            console.log("encryptedPayloadToDecrypt:", encryptedPayloadToDecrypt);
            console.log("Length of encryptedPayloadToDecrypt (excluding 0x):", encryptedPayloadToDecrypt.length - 2);
            console.log("Private key a ser usada para descriptografar:", privateKeyInput);
            
            // Log para debug da chave pública derivada da privada inserida
            // (APENAS PARA DEBUG - NÃO FAÇA ISSO EM PRODUÇÃO PARA CHAVES PRIVADAS SENSÍVEIS)
            try {
                const secp = await import("@noble/secp256k1");
                const calculatedPublicKey = bytesToHex(secp.getPublicKey(toBytes(privateKeyInput), false));
                console.log("Chave Pública CALCULADA da Private Key inserida:", calculatedPublicKey);
                console.log("Chave Pública do ESTUDANTE no Contrato:", student.publicKey); // Para referência
            } catch (pkErr) {
                console.warn("Não foi possível derivar a chave pública da chave privada para debug.", pkErr);
            }


            const decryptedPersonalInformationJson = await decryptECIES(encryptedPayloadToDecrypt, privateKeyInput as Hex);
            console.log("Descriptografado:", decryptedPersonalInformationJson);
            
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
            console.log("Dados Descriptografados:", personalInfo);
            console.log("Hash Público do Contrato:", student.publicHash);
            console.log("Hash Calculado:", calculatedHash);

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
        setStatus(null);
        setError(null);
    }, [studentAddress, targetAudience, privateKeyInput]); // Adicione privateKeyInput ao array de dependências do useEffect

    // Se o componente ainda não foi montado no cliente, retorna um Fragmento vazio
    if (!hasMounted) { 
      return <></>; 
    }

    return (
        <div style={{ marginTop: '1.5rem', border: '1px solid #007bff', padding: '1rem', borderRadius: '4px' }}>
            <h2>Descriptografar Dados do Estudante</h2>
            <p className="text-sm" style={{ marginBottom: '10px', color: 'gray' }}>
                Insira a chave privada CORRESPONDENTE ao público-alvo (instituição ou aluno) para descriptografar os dados.
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
                    />

                    {!studentAddressValid && studentAddress !== '' && (
                        <p className="text-sm text-red-500">⚠️ Endereço do estudante inválido.</p>
                    )}

                    {/* CAMPO PARA CHAVE PRIVADA */}
                    <input
                        type="text"
                        placeholder="CHAVE PRIVADA (0x...)"
                        value={privateKeyInput}
                        onChange={(e) => {
                            setPrivateKeyInput(e.target.value as Hex | '');
                            setStatus(null);
                            setError(null);
                            setDecryptedData(null);
                        }}
                        className="w-full p-2 border rounded"
                        style={{ marginTop: '1rem', backgroundColor: '#fffbe6' }} 
                    />
                    {!privateKeyValid && privateKeyInput !== '' && (
                        <p className="text-sm text-red-500">⚠️ Chave privada inválida. Deve começar com '0x' e ter 64 caracteres hex.</p>
                    )}
                    {/* FIM DO CAMPO CHAVE PRIVADA */}

                    <div style={{ marginTop: '1rem' }}>
                        <label style={{ marginRight: '1rem' }}>
                            <input 
                                type="radio" 
                                value="institution" 
                                checked={targetAudience === 'institution'} 
                                onChange={() => setTargetAudience('institution')} 
                            /> Descriptografar para **Instituição**
                        </label>
                        <label>
                            <input 
                                type="radio" 
                                value="self" 
                                checked={targetAudience === 'self'} 
                                onChange={() => setTargetAudience('self')} 
                            /> Descriptografar para **Aluno**
                        </label>
                        <p className="text-sm text-gray-600 mt-1">
                            Use a chave privada da Instituição para ver os dados dela, ou a chave privada do Aluno para ver os dele.
                        </p>
                    </div>

                    <button 
                        type="button" 
                        onClick={handleGetAndDecryptStudentData}
                        disabled={isLoadingStudent || isContractReadError || isLoadingDecryption || !studentAddressValid || !privateKeyValid} 
                        style={{ padding: '0.5rem 1rem', backgroundColor: '#007bff', color: 'white', borderRadius: '4px', opacity: (isLoadingStudent || isContractReadError || isLoadingDecryption || !studentAddressValid || !privateKeyValid) ? 0.6 : 1, marginTop: '10px' }}
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