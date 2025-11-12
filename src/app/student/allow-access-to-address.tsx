// components/AllowAccessToAddress.tsx
"use client";

import React, { useState } from "react";
import { useAccount, useWalletClient, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { isAddress, Address, Hex } from "viem";
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI";
import { useIsClient } from "../is-client";

import { encryptECIES, decryptECIES } from '../../utils/cripto.utils';

export function AllowAccessToAddress() {
    const { address: connectedAddress, isConnected } = useAccount();
    const { data: walletClient } = useWalletClient();
    const publicClient = usePublicClient();
    const isClient = useIsClient();

    const [allowedAddress, setAllowedAddress] = useState<Address | "">("");
    const [internalStatusMessage, setInternalStatusMessage] = useState<string>("");
    const [studentPrivateKeyInput, setStudentPrivateKeyInput] = useState<Hex | "">("");

    const { writeContractAsync, isPending: isWritePending } = useWriteContract();

    // Hook para ler a chave pública do recipiente (viewer)
    const { data: recipientKey, isLoading: isRecipientKeyLoading, refetch: refetchRecipientKey } = useReadContract({
        ...wagmiContractConfig,
        functionName: 'retrieveRecipientEncrpytKey',
        args: allowedAddress && connectedAddress ? [allowedAddress, connectedAddress] : undefined,
        query: {
            enabled: false,
            staleTime: 0,
        },
    });

    // Hook para ler os dados do estudante (para obter selfEncryptedInformation)
    const { data: studentData, isLoading: isStudentDataLoading, refetch: refetchStudentData } = useReadContract({
        ...wagmiContractConfig,
        functionName: 'getStudent',
        args: connectedAddress ? [connectedAddress] : undefined, // O estudante atual é o conectado
        query: {
            enabled: false,
            staleTime: 0,
        },
    });

    const allowAccessToAddress = async () => {
        setInternalStatusMessage("");

        if (!isConnected || !connectedAddress) {
            setInternalStatusMessage("Por favor, conecte sua carteira.");
            return;
        }
        if (!allowedAddress || !isAddress(allowedAddress)) {
            setInternalStatusMessage("Por favor, insira um endereço de destinatário válido.");
            return;
        }
        if (!studentPrivateKeyInput || studentPrivateKeyInput.length !== 66 || !studentPrivateKeyInput.startsWith('0x')) {
            setInternalStatusMessage("Por favor, insira sua chave privada (0x...) para descriptografar seus dados.");
            return;
        }

        if (!isClient) {
            setInternalStatusMessage("Aguarde, o ambiente do cliente ainda não está pronto.");
            return;
        }

        try {
            // 1. Obter a chave pública do recipiente (viewer)
            setInternalStatusMessage("Buscando chave pública do destinatário...");
            // ===============================================
            // LOG DOS PARÂMETROS PARA retrieveRecipientEncrpytKey
            console.log("------------------------------------------");
            console.log("Chamando retrieveRecipientEncrpytKey com:");
            console.log("  allowedAddress (Viewer):", allowedAddress);
            console.log("  connectedAddress (Student):", connectedAddress);
            console.log("------------------------------------------");
            // ===============================================
            
            const recipientKeyResponse = await refetchRecipientKey();
            console.log("recipientKeyResponse", recipientKeyResponse)
            // A tipagem já está como Hex | undefined
            const retrievedRecipientKey = recipientKeyResponse.data as Hex | undefined;
            console.log("retrievedRecipientKey", retrievedRecipientKey);
            if (!retrievedRecipientKey) {
                setInternalStatusMessage("Não foi possível obter a chave pública do destinatário. Verifique se o endereço permitido existe e solicitou acesso.");
                return;
            }

            // 2. Obter a `selfEncryptedInformation` do estudante
            setInternalStatusMessage("Buscando suas informações criptografadas...");
            const studentDataResponse = await refetchStudentData();
            const studentSelfEncryptedInfo = studentDataResponse.data?.selfEncryptedInformation;
            console.log("studentSelfEncryptedInfo", studentSelfEncryptedInfo);
            if (!studentSelfEncryptedInfo) {
                setInternalStatusMessage("Não foi possível obter suas informações criptografadas do contrato.");
                return;
            }

            // Descriptografar a informação do estudante usando a chave privada DO INPUT
            setInternalStatusMessage("Descriptografando suas informações pessoais com a chave privada fornecida...");
            let studentInformation: string;
            try {
                studentInformation = await decryptECIES(studentSelfEncryptedInfo, studentPrivateKeyInput);
            } catch (decryptError) {
                console.error("Erro ao descriptografar selfEncryptedInformation:", decryptError);
                setInternalStatusMessage(`Falha na descriptografia de seus dados: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}. Verifique sua chave privada.`);
                return;
            }

            console.log("Informação do estudante descriptografada:", studentInformation);

            // 3. Re-criptografar a informação para o `recipientKey`
            setInternalStatusMessage("Criptografando informações para o destinatário...");
            // ===============================================
            // Força o tipo para Hex, já que o `if` acima garante que não é undefined
            // Se o erro ainda persistir aqui, é quase certeza que a assinatura
            // de `encryptECIES` em `cripto.utils` espera um tipo diferente de `Hex`.
            const encryptedValue = await encryptECIES(studentInformation, retrievedRecipientKey);
            // ===============================================

            console.log({allowedAddress, connectedAddress, encryptedValue});

            // 4. Enviar a transação para o contrato
            setInternalStatusMessage("Enviando transação para adicionar acesso...");
            const txHash = await writeContractAsync({
                ...wagmiContractConfig,
                functionName: 'addEncryptedInfoWithRecipientKey',
                args: [allowedAddress, connectedAddress, encryptedValue],
                account: connectedAddress,
            });

            setInternalStatusMessage(`Transação enviada: ${txHash}. Aguardando confirmação...`);

            const receipt = await publicClient?.waitForTransactionReceipt({ hash: txHash });

            if (receipt?.status === 'success') {
                setInternalStatusMessage("Acesso concedido com sucesso ao endereço!");
                setAllowedAddress("");
                setStudentPrivateKeyInput(""); // Limpar a chave privada após o sucesso (importante!)
            } else {
                setInternalStatusMessage("Falha na transação. Status: " + receipt?.status);
            }

        } catch (error: any) {
            console.error("Erro ao conceder acesso:", error);
            let errorMessage = "Falha ao conceder acesso ao endereço. Verifique o console para mais detalhes.";
            if (error.message.includes("User rejected the request")) {
                errorMessage = "Transação rejeitada pelo usuário.";
            } else if (error.cause?.shortMessage) {
                errorMessage = error.cause.shortMessage;
            } else if (error.message) {
                errorMessage = error.message;
            }
            setInternalStatusMessage(errorMessage);
        }
    };

    const isDisabled = !isClient || !isConnected || !allowedAddress || !isAddress(allowedAddress) || isWritePending ||
                       !studentPrivateKeyInput || studentPrivateKeyInput.length !== 66 || !studentPrivateKeyInput.startsWith('0x');

    return (
        <div className="allow-access-container">
            <h2>Conceder Acesso à Informação Pessoal</h2>
            <form className="form">
                <input
                    type="text"
                    placeholder="Endereço Permitido (0x...)"
                    value={allowedAddress}
                    onChange={(e) => {
                        setAllowedAddress(e.target.value as Address);
                        setInternalStatusMessage("");
                    }}
                    // disabled={isDisabled && !isWritePending}
                />
                <input
                    type="password"
                    placeholder="Sua Chave Privada para Descriptografar (0x...)"
                    value={studentPrivateKeyInput}
                    onChange={(e) => {
                        setStudentPrivateKeyInput(e.target.value as Hex);
                        setInternalStatusMessage("");
                    }}
                    // disabled={isDisabled && !isWritePending}
                    autoComplete="off"
                />
                <button type="button" onClick={allowAccessToAddress} >
                    {isWritePending ? "Enviando..." : "Conceder Acesso"}
                </button>
            </form>

            {internalStatusMessage && (
                <p className={`status-message ${internalStatusMessage.includes('Falha') || internalStatusMessage.includes('Erro') || internalStatusMessage.includes('rejeitada') ? 'error' : 'info'}`}>
                    {internalStatusMessage}
                </p>
            )}
        </div>
    );
}