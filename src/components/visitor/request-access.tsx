// components/RequestAccess.tsx
"use client";

import React, { useState } from "react";
import { useAccount, useWalletClient, usePublicClient, useWriteContract } from "wagmi";
import { isAddress, Address, Hex } from "viem";
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI";
import { useIsClient } from "../../app/is-client";

import * as secp from "@noble/secp256k1";
import { hexToBytes, bytesToHex } from "viem";

// ===============================================
// Componente RequestAccess não recebe mais props
export function RequestAccess() {
// ===============================================
    const { address: connectedAddress, isConnected } = useAccount();
    const { data: walletClient } = useWalletClient(); // Mantido caso precise de signer para outras ops
    const publicClient = usePublicClient();
    const isClient = useIsClient();

    const [studentAddress, setStudentAddress] = useState<Address | "">("");
    const [requesterPrivateKeyInput, setRequesterPrivateKeyInput] = useState<Hex | "">("");
    // ===============================================
    // Moved internalStatusMessage state here
    const [internalStatusMessage, setInternalStatusMessage] = useState<string>("");
    // ===============================================

    const { writeContractAsync, isPending } = useWriteContract();

    const requestAccess = async () => {
        setInternalStatusMessage(""); // Limpa mensagens anteriores

        if (!isConnected || !connectedAddress) {
            setInternalStatusMessage("Por favor, conecte sua carteira.");
            return;
        }
        if (!studentAddress || !isAddress(studentAddress)) {
            setInternalStatusMessage("Por favor, insira um endereço de estudante válido.");
            return;
        }

        if (!requesterPrivateKeyInput || requesterPrivateKeyInput.length !== 66 || !requesterPrivateKeyInput.startsWith('0x')) {
            setInternalStatusMessage("Por favor, insira uma chave privada válida (0x...) para o solicitante.");
            return;
        }

        if (!isClient) {
            setInternalStatusMessage("Aguarde, o ambiente do cliente ainda não está pronto.");
            return;
        }

        try {
            const privateKeyBytes = hexToBytes(requesterPrivateKeyInput);
            const encryptionPublicKeyBytes = secp.getPublicKey(privateKeyBytes, false); // false para NÃO COMPRIMIDA
            const encryptionPublicKey = bytesToHex(encryptionPublicKeyBytes);

            console.log("Derived Encryption Public Key:", encryptionPublicKey);

            if (!encryptionPublicKey) {
                setInternalStatusMessage("Não foi possível derivar a chave pública de criptografia.");
                return;
            }

            setInternalStatusMessage("Enviando solicitação de acesso...");
            const txHash = await writeContractAsync({
                ...wagmiContractConfig,
                functionName: 'requestAccess',
                args: [studentAddress, encryptionPublicKey],
                account: connectedAddress,
            });

            setInternalStatusMessage(`Transação enviada: ${txHash}. Aguardando confirmação...`);

            const receipt = await publicClient?.waitForTransactionReceipt({ hash: txHash });

            if (receipt?.status === 'success') {
                setInternalStatusMessage("Solicitação de acesso à informação do estudante adicionada com sucesso!");
                // Opcional: Limpar os campos após o sucesso
                setStudentAddress("");
                setRequesterPrivateKeyInput("");
            } else {
                setInternalStatusMessage("Falha na transação. Status: " + receipt?.status);
            }

        } catch (error: any) {
            console.error("Erro na RequestAccess:", error);
            let errorMessage = "Falha ao solicitar informações do estudante.";
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

    const isDisabled = !isClient || !isConnected || !studentAddress || !isAddress(studentAddress) || isPending ||
                       !requesterPrivateKeyInput || requesterPrivateKeyInput.length !== 66 || !requesterPrivateKeyInput.startsWith('0x');

    return (
        <div className="request-access-container">
            <h2>Solicitar Acesso à Informação do Estudante</h2>
            <form className="form">
                <input
                    type="text"
                    placeholder="Endereço do Estudante (0x...)"
                    value={studentAddress}
                    onChange={(e) => {
                        setStudentAddress(e.target.value as Address);
                        setInternalStatusMessage(""); // Limpa mensagem ao digitar
                    }}
                    // disabled={isDisabled && !isPending}
                />
                <input
                    type="password"
                    placeholder="Sua Chave Privada (0x...)"
                    value={requesterPrivateKeyInput}
                    onChange={(e) => {
                        setRequesterPrivateKeyInput(e.target.value as Hex);
                        setInternalStatusMessage(""); // Limpa mensagem ao digitar
                    }}
                    // disabled={isDisabled && !isPending}
                    autoComplete="off"
                />
                <button type="button" onClick={requestAccess} >
                    {isPending ? "Solicitando..." : "Solicitar Acesso"}
                </button>
            </form>

            {/* =============================================== */}
            {/* Exibindo a mensagem de status internamente */}
            {internalStatusMessage && (
                <p className={`status-message ${internalStatusMessage.includes('Falha') || internalStatusMessage.includes('Erro') || internalStatusMessage.includes('rejeitada') ? 'error' : 'info'}`}>
                    {internalStatusMessage}
                </p>
            )}
            {/* =============================================== */}
        </div>
    );
}