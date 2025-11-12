'use client';

import React, { JSX, useState } from 'react';
import { useDynamicWaas, ChainEnum } from '@dynamic-labs/sdk-react-core';
import { Hex } from 'viem'; // Para tipagem da chave privada

export function ImportExistingWallet(): JSX.Element {
  const { importPrivateKey } = useDynamicWaas(); // Hook da Dynamic para importar a chave
  const [privateKeyInput, setPrivateKeyInput] = useState<Hex | ''>('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const privateKeyInputValid = privateKeyInput.startsWith('0x') && privateKeyInput.length === 66;

  const handleImportPrivateKey = async () => {
    if (!privateKeyInputValid) {
      setError("Por favor, forneça uma chave privada Hex válida (começando com 0x).");
      return;
    }

    setStatus("Iniciando importação da chave privada...");
    setError(null);
    setIsLoading(true);

    try {
      await importPrivateKey({
        chainName: ChainEnum.Evm,
        privateKey: privateKeyInput,
      });

      setStatus("Chave privada importada com sucesso! Uma nova carteira Embedded foi criada.");
      setPrivateKeyInput(''); // Limpa o input após o sucesso
    } catch (err: any) {
      console.error("Erro ao importar chave privada:", err);
      setStatus(null);
      setError(`Falha na importação da chave: ${err.message || String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ marginTop: '2rem', border: '1px solid #6c757d', padding: '1.5rem', borderRadius: '8px', backgroundColor: '#f8f9fa' }}>
      <h2 style={{ fontSize: '1.8rem', marginBottom: '1rem', color: '#343a40' }}>Importar Chave Privada Existente</h2>
      <p style={{ marginBottom: '1rem', color: '#555' }}>
        Importe uma chave privada de uma carteira Hardhat existente para criar uma nova carteira Embedded (TSS-MPC) na Dynamic.
      </p>

      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Chave Privada (Hex, ex: 0x...)"
          value={privateKeyInput}
          onChange={(e) => {
            setPrivateKeyInput(e.target.value as Hex | '');
            setStatus(null);
            setError(null);
          }}
          style={{ width: '100%', padding: '0.75rem', border: '1px solid #ced4da', borderRadius: '4px' }}
          disabled={isLoading}
        />
        {!privateKeyInputValid && privateKeyInput !== '' && (
          <p style={{ color: 'red', fontSize: '0.85rem', marginTop: '0.5rem' }}>⚠️ Chave privada inválida. Deve ser um Hex (0x...) de 66 caracteres.</p>
        )}
      </div>

      <button
        onClick={handleImportPrivateKey}
        disabled={isLoading || !privateKeyInputValid}
        style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: '#28a745', // Cor verde para importação
          color: 'white',
          borderRadius: '4px',
          border: 'none',
          cursor: 'pointer',
          opacity: (isLoading || !privateKeyInputValid) ? 0.6 : 1,
          fontSize: '1rem'
        }}
      >
        {isLoading ? "Importando..." : "Importar Chave Privada"}
      </button>

      {status && <p style={{ marginTop: '1rem', color: 'green', fontWeight: 'bold' }}>{status}</p>}
      {error && <p style={{ color: 'red', marginTop: '1rem' }}>Erro: {error}</p>}
    </div>
  );
}