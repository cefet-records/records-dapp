"use client";

import React, { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { Hex, toHex } from "viem";
import { privateToPublic, toBuffer } from "ethereumjs-util";

interface PublicKeyRecoveryProps {
  onPublicKeyReady: (publicKey: Hex, address: Hex, rawPublicKey: string) => void;
  title: string;
  disabled?: boolean;
  initialPrivateKey?: Hex; 
}

const PublicKeyRecovery: React.FC<PublicKeyRecoveryProps> = ({ 
  onPublicKeyReady, 
  title, 
  disabled = false,
  initialPrivateKey,
}) => {
  const { address, isConnected } = useAccount();

  const [privateKeyInput, setPrivateKeyInput] = useState<Hex>(initialPrivateKey || "0x");
  const [userPublicKey, setUserPublicKey] = useState<Hex | null>(null);
  const [rawPublicKeyXY, setRawPublicKeyXY] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (initialPrivateKey && !userPublicKey) {
      handleGeneratePublicKey();
    }
  }, [initialPrivateKey, userPublicKey]);

  const handleGeneratePublicKey = async () => {
    setError(null);
    setUserPublicKey(null);
    setRawPublicKeyXY(null);

    if (!address || !isConnected) {
      setError("Conecte sua carteira para gerar a chave pública.");
      return;
    }

    if (!privateKeyInput || privateKeyInput.length !== 66 || !privateKeyInput.startsWith("0x")) {
      setError("Por favor, insira uma chave privada EVM válida (0x + 64 hex chars).");
      return;
    }

    setIsProcessing(true);
    try {
      const pkBuffer = toBuffer(privateKeyInput);
      const publicKeyXYBuffer = privateToPublic(pkBuffer);
      const publicKeyXYHex = toHex(publicKeyXYBuffer).slice(2);
      const fullPublicKeyWith04Prefix = `0x04${publicKeyXYHex}` as Hex;

      setUserPublicKey(fullPublicKeyWith04Prefix);
      setRawPublicKeyXY(publicKeyXYHex);
      onPublicKeyReady(fullPublicKeyWith04Prefix, address, publicKeyXYHex);
    } catch (err: any) {
      setError(`Erro ao gerar a chave pública: ${err.message || String(err)}`);
      console.error("ERRO ao gerar PK:", err);
    } finally {
      setIsProcessing(false);
    }
  };
  return (
    <div className="bg-gray-700 p-4 rounded-lg shadow-md mb-4 text-white">
      <h3 className="text-lg font-bold mb-2">{title}</h3>

      {!isConnected ? (
        <p className="text-yellow-400">Conecte sua carteira para continuar.</p>
      ) : (
        <>
          <div className="mb-3">
            <label htmlFor="privateKeyInput" className="block text-sm font-medium text-gray-300">
              Sua Chave Privada (EVM Hex):
            </label>
            <input
              type="password"
              id="privateKeyInput"
              value={privateKeyInput}
              onChange={(e) => setPrivateKeyInput(e.target.value as Hex)}
              placeholder="0x..."
              className="mt-1 block w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-100"
              disabled={disabled || isProcessing}
            />
            <p className="text-red-400 text-xs mt-1">
              AVISO: Inserir sua chave privada é um risco de segurança. Não use em produção.
            </p>
          </div>

          {!userPublicKey ? (
            <button
              onClick={handleGeneratePublicKey}
              disabled={disabled || isProcessing || !privateKeyInput || privateKeyInput.length !== 66}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition duration-200"
            >
              {isProcessing ? "Gerando..." : `Gerar ${title} Key`}
            </button>
          ) : (
            <div className="mt-2">
              <p className="text-green-400">
                Chave Pública Gerada: <span className="break-all text-sm">{userPublicKey.substring(0, 40)}...</span>
              </p>
              <p className="text-gray-400 text-xs">
                (Formato ECIES/ViEM: <span className="break-all">{userPublicKey}</span>)
              </p>
              {rawPublicKeyXY && (
                <p className="text-gray-400 text-xs mt-1">
                    (Formato X+Y (128 chars) para "eth-ecies": <span className="break-all">{rawPublicKeyXY}</span>)
                </p>
              )}
            </div>
          )}

          {error && <p className="text-red-500 mt-2">Erro: {error}</p>}
        </>
      )}
    </div>
  );
};

export default PublicKeyRecovery;