"use client";

import { DynamicWidget, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { ReadContract } from "./read-contract";
import CheckInstitutionStatus from "./institution/is-institution";
import AddInstitution from "./institution/add-institution";
import RegisterBatchRecords from "./add-batch-record";
import DisplayRegisteredRecords from "./get-batch-record";
import DecryptRecord from "./decrypt-record";
import PublicKeyRecovery from "./get-pk";
import { useAccount} from "wagmi";
import { Hex } from "viem";
import ViewGrantedAccess from "./view-granted-record-access";
import RevokeAccess from "./revoke-access";
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

function AccountInfo() {
  const { primaryWallet } = useDynamicContext();
  const { isConnected, chain } = useAccount();
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const { initExportProcess } = useEmbeddedReveal();

  const [hasMounted, setHasMounted] = useState(false); // NOVO ESTADO

  useEffect(() => {
    setHasMounted(true); // Define como true apenas quando o componente monta no cliente
  }, []);

  const getPrivateKey = async () => {
    // ... (seu código de getPrivateKey permanece o mesmo) ...
  };

  if (!hasMounted) {
    return null; // Não renderiza nada no servidor e na primeira renderização do cliente, evitando o mismatch
  }

  return (
    <div style={{ marginTop: '1rem', border: '1px solid #ccc', padding: '1rem', borderRadius: '4px' }}>
      <h3>Status da Carteira</h3>
      {/* Agora, estes parágrafos só serão renderizados após a hidratação */}
      <p>wagmi connected: {isConnected ? 'true' : 'false'}</p>
      <p>wagmi address: {primaryWallet?.address}</p>
      <p>wagmi network: {chain?.id}</p>
      <button onClick={() => initExportProcess()}>Export Wallet</button>;
      {primaryWallet?.connector && isDynamicWaasConnector(primaryWallet.connector) && (
        <div style={{ marginTop: '10px' }}>
          <button
            onClick={getPrivateKey}
            style={{ padding: '8px 15px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            disabled={!isConnected}
          >
            Exportar Chave Privada (Teste)
          </button>
          {exportStatus && <p style={{ marginTop: '5px', fontSize: '0.8em', color: exportStatus.startsWith('✅') ? 'green' : 'red' }}>{exportStatus}</p>}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  

  const [pageStatusMessage, setPageStatusMessage] = useState<string | null>(null);
  const handlePublicKeyRecovered = (publicKey: Hex, address: Hex) => {
    console.log(`Chave Pública Recuperada no Home: ${publicKey} para o endereço: ${address}`);
    // Se você precisasse passar essa chave para outro componente que o Home renderiza,
    // você armazenaria aqui num estado e passaria como prop.
  };
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
      {/*<RegisterBatchRecords />
      <DisplayRegisteredRecords />
      <DecryptRecord />
      <GrantAccess />
      <RevokeAccess />
      <ViewGrantedAccess />
      <PublicKeyRecovery
        title="Chave Pública do Usuário Conectado" // Título para exibir no componente
        onPublicKeyReady={handlePublicKeyRecovered} // Função de callback
      />
       */}
    </div>   
  );
}
