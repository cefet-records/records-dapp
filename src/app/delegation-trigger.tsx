// components/DelegationTrigger.tsx (ou onde você deseja o botão de delegação)
"use client";

import React, { useEffect, useState } from 'react';
import { useWalletDelegation, useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { useAccount } from 'wagmi';

export function DelegationTrigger() {
  const { 
    initDelegationProcess, 
    shouldPromptWalletDelegation, 
    requiresDelegation 
  } = useWalletDelegation();
  
  const { primaryWallet } = useDynamicContext();
  const { isConnected } = useAccount();

  // Estado para controlar a mensagem de feedback
  const [delegationStatusMessage, setDelegationStatusMessage] = useState<string | null>(null);
  const [isDelegationPending, setIsDelegationPending] = useState<boolean>(false);

  // Use shouldPromptWalletDelegation para decidir se o usuário precisa delegar
  // E o status real da delegação (que virá do backend via webhook)
  // Para fins de UI, se !shouldPromptWalletDelegation(), assumimos que já foi delegada ou não é necessária.
  const isDelegated = !shouldPromptWalletDelegation(); // Simplificação para UI

  const handleDelegateWallet = async () => {
    if (!isConnected || !primaryWallet) {
      setDelegationStatusMessage("Por favor, conecte sua carteira primeiro.");
      return;
    }
    
    setIsDelegationPending(true);
    setDelegationStatusMessage("Aguardando aprovação do usuário para delegação...");

    try {
      // Abre o modal da Dynamic para o usuário aprovar a delegação
      await initDelegationProcess();
      setDelegationStatusMessage("✅ Delegação da carteira aprovada com sucesso!");
      // IMPORTANTE: A confirmação final (recebimento da share)
      // acontecerá no seu endpoint de webhook no backend.
      // O frontend apenas inicia o processo de aprovação do usuário.
    } catch (error: any) {
      console.error('Falha ao delegar a carteira:', error);
      if (error.message.includes("user_not_logged_in")) {
        setDelegationStatusMessage("❌ Erro: Usuário não logado. Por favor, faça login.");
      } else if (error.message.includes("No primary wallet")) {
        setDelegationStatusMessage("❌ Erro: Nenhuma carteira primária conectada.");
      } else {
        setDelegationStatusMessage(`❌ Falha na delegação: ${error.message || String(error)}`);
      }
    } finally {
      setIsDelegationPending(false);
    }
  };

  // Opcional: Acionar a delegação automaticamente se for necessária ao montar o componente
  // Cuidado para não criar um loop ou irritar o usuário.
  // if (shouldPromptWalletDelegation() && !isDelegationPending) {
  //   handleDelegateWallet(); 
  // }

  return (
    <div style={{ marginTop: '1rem', border: '1px solid #ccc', padding: '1rem', borderRadius: '4px' }}>
      <h3>Gerenciar Acesso Delegado da Carteira</h3>

      {requiresDelegation && (
        <p className="text-sm text-yellow-600">
          ⚠️ Esta aplicação requer acesso delegado da carteira para algumas funcionalidades.
        </p>
      )}

      {isDelegated ? (
        <p className="text-green-600">✅ Acesso Delegado Aprovado.</p>
      ) : (
        <button 
          onClick={handleDelegateWallet}
          disabled={isDelegationPending || !isConnected || !primaryWallet}
          style={{ 
            padding: '8px 15px', 
            backgroundColor: '#007bff', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: 'pointer',
            opacity: (isDelegationPending || !isConnected || !primaryWallet) ? 0.6 : 1
          }}
        >
          {isDelegationPending ? "Processando Delegação..." : "Aprovar Acesso Delegado"}
        </button>
      )}

      {delegationStatusMessage && (
        <p style={{ marginTop: '10px', fontSize: '0.9em', color: delegationStatusMessage.startsWith('✅') ? 'green' : 'red' }}>
          {delegationStatusMessage}
        </p>
      )}
    </div>
  );
}