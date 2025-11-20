"use client";

import { DynamicWidget, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { ReadContract } from "./read-contract";
import CheckInstitutionStatus from "./institution/is-institution";
import AddInstitution from "./institution/add-institution";
import { useAccount} from "wagmi";
import AddStudent from "./student/add-student";
import { AddInstitutionPublicKey } from "./institution/add-institution-pk";
import { GetInstitutionDetails } from "./institution/get-institution";
import { AddStudentInformation } from "./student/add-student-information";
import { useState, useEffect } from "react";
import { isDynamicWaasConnector } from '@dynamic-labs/wallet-connector-core';
import { useEmbeddedReveal } from "@dynamic-labs/sdk-react-core";
import { ImportExistingWallet } from "./import-wallet";
import { GetStudent } from "./student/get-student";
import { AddCourse } from "./course/add-course";
import { AddDiscipline } from "./discipline/add-discipline";
import { AddGrade } from "./grade/add-grade";
import { GetGrade } from "./grade/get-grade";
import { RequestAccess } from "./visitor/request-access";
import { AllowAccessToAddress } from "./student/allow-access-to-address";
import { isEthereumWallet } from '@dynamic-labs/ethereum';

function AccountInfo() {
  const { primaryWallet } = useDynamicContext();
  const { isConnected, chain } = useAccount();
  const { initExportProcess } = useEmbeddedReveal();

  const [hasMounted, setHasMounted] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  useEffect(() => setHasMounted(true), []);

  const getUserInfo = async () => {
    // Adicionar verificação para primaryWallet
    if (!primaryWallet) {
      console.warn("primaryWallet é nula, não é possível obter PublicClient ou WalletClient.");
      // Opcional: Definir uma mensagem de status para o usuário
      setExportStatus("Erro: Carteira não conectada ou não disponível.");
      return;
    }

    try {
      if (!isEthereumWallet(primaryWallet)) return;
      const publicClient = await primaryWallet.getPublicClient()
      const walletClient = await primaryWallet.getWalletClient();

      console.log("publicClient", publicClient);
      console.log("walletClient", walletClient);
      setExportStatus("✅ Informações da carteira obtidas com sucesso!"); // Sucesso
    } catch (error) {
      console.error("Erro ao obter informações da primaryWallet:", error);
      setExportStatus(`❌ Erro ao obter informações da carteira: ${error instanceof Error ? error.message : String(error)}`); // Captura de erro
    }
  };

  if (!hasMounted) {
    return null; // Não renderiza nada no servidor e na primeira renderização do cliente, evitando o mismatch
  }

  return (
    <div style={{ marginTop: '1rem', border: '1px solid #ccc', padding: '1rem', borderRadius: '4px' }}>
      <h3>Status da Carteira</h3>
      <p>wagmi connected: {isConnected ? 'true' : 'false'}</p>
      <p>wagmi address: {primaryWallet?.address}</p>
      <p>wagmi network: {chain?.id}</p>
      <button onClick={() => initExportProcess()}>Export Wallet</button>;
      {primaryWallet?.connector && isDynamicWaasConnector(primaryWallet.connector) && (
        <div style={{ marginTop: '10px' }}>
          <button
            onClick={getUserInfo}
            style={{ padding: '8px 15px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            disabled={!isConnected}
          >
            informações da primaryWallet
          </button>
          {exportStatus && <p style={{ marginTop: '5px', fontSize: '0.8em', color: exportStatus.startsWith('✅') ? 'green' : 'red' }}>{exportStatus}</p>}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <div>
      <DynamicWidget />
      <AccountInfo />
      <ImportExistingWallet />
      <ReadContract />

      <AddInstitution />
      <CheckInstitutionStatus />
      <AddInstitutionPublicKey />
      <GetInstitutionDetails />

      <AddStudent />
      <AddStudentInformation />
      <GetStudent />

      <AddCourse />

      <AddDiscipline />

      <AddGrade />
      <GetGrade />

      <RequestAccess />
      <AllowAccessToAddress />
    </div>   
  );
}
