"use client";

import { DynamicWidget, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { ReadContract } from "../read-contract";
import CheckInstitutionStatus from "../../components/institution/is-institution";
import AddInstitution from "../../components/institution/add-institution";
import RegisterBatchRecords from "../add-batch-record";
import DisplayRegisteredRecords from "../get-batch-record";
import DecryptRecord from "../decrypt-record";
import PublicKeyRecovery from "../get-pk";
import { useAccount } from "wagmi";
import { Hex } from "viem";
import ViewGrantedAccess from "../view-granted-record-access";
import RevokeAccess from "../revoke-access";
import AddStudent from "../../components/student/add-student";
import { AddInstitutionPublicKey } from "../../components/institution/add-institution-pk";
import { GetInstitutionDetails } from "../../components/institution/get-institution";
import { AddStudentInformation } from "../../components/student/add-student-information";
import { useState, useEffect } from "react";
import { isDynamicWaasConnector } from '@dynamic-labs/wallet-connector-core';
import { useEmbeddedReveal } from "@dynamic-labs/sdk-react-core";
import { ImportExistingWallet } from "../import-wallet";
import { GetStudent } from "../../components/student/get-student";
import { AddCourse } from "../../components/course/add-course";
import { AddDiscipline } from "../../components/discipline/add-discipline";
import { AddGrade } from "../../components/grade/add-grade";
import { GetGrade } from "../../components/grade/get-grade";
import { RequestAccess } from "../../components/visitor/request-access";
import { AllowAccessToAddress } from "../../components/student/allow-access-to-address";
import { useRouter } from "next/navigation";
import { useReadContract } from 'wagmi';
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI";
import { connected } from "process";
import { useIsClient } from "../is-client";
import Stack from "@mui/material/Stack";
import OwnerWrapper from "@/components/owner/owner-wrapper";
import IntitutionWrapper from "@/components/institution/intitution-wrapper";
import StudentWrapper from "@/components/student/student-wrapper";
import VisitorWrapper from "@/components/visitor/visitor-wrapper";
import HeaderPage from "@/components/header/header-page";

function AccountInfo() {
  const { primaryWallet } = useDynamicContext();
  const { isConnected, chain } = useAccount();
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const { initExportProcess } = useEmbeddedReveal();

  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const getPrivateKey = async () => {
    // ... (seu código de getPrivateKey permanece o mesmo) ...
  };

  if (!hasMounted) {
    return null;
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

const enum userTypes {
  OWNER = 'owner',
  INSTITUTION = 'institution',
  STUDENT = 'student',
  VISITOR = 'viewer'
}

export default function Home() {
  const router = useRouter();
  const { primaryWallet } = useDynamicContext();
  const { address: connectedAddress, isConnected, isConnecting } = useAccount();
  const [hasMounted, setHasMounted] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  const isClient = useIsClient();

  const { data: userPermission } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getPermission',
    args: [],
    account: connectedAddress,
    query: {
      enabled: isConnected && !!connectedAddress && isClient,
    },
  });

  useEffect(() => {
    setHasMounted(true);
    const timer = setTimeout(() => {
      setIsChecking(false);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Redireciona para "/" se não estiver conectado
  useEffect(() => {
    if (hasMounted && !isChecking && !primaryWallet && !isConnected && !isConnecting) {
      router.replace("/");
    }
  }, [hasMounted, isChecking, primaryWallet, isConnected, isConnecting, router]);

  const [pageStatusMessage, setPageStatusMessage] = useState<string | null>(null);

  const handlePublicKeyRecovered = (publicKey: Hex, address: Hex) => {
    console.log(`Chave Pública Recuperada no Home: ${publicKey} para o endereço: ${address}`);
  };

  // Não renderiza nada enquanto verifica a autenticação
  if (!hasMounted || isChecking || isConnecting || (!primaryWallet && !isConnected)) {
    return null;
  }
  // useEffect(() => {
  // console.log(`User permission: ${userPermission}`);
  // }, [userPermission]);
  console.log(userPermission);
  return (
    <>
      <HeaderPage />
      <Stack>
        {userPermission === userTypes.OWNER && <OwnerWrapper />}
        {userPermission === userTypes.INSTITUTION && <IntitutionWrapper />}
        {userPermission === userTypes.STUDENT && <StudentWrapper />}
        {userPermission === userTypes.VISITOR && <VisitorWrapper />}
      </Stack>
    </>
    // <div>
    //   <DynamicWidget />
    //   <AccountInfo />
    //   <ImportExistingWallet />
    //   <ReadContract />
    //   <AddInstitution />
    //   <CheckInstitutionStatus />
    //   <AddInstitutionPublicKey />
    //   <GetInstitutionDetails />

    //   <AddStudent />
    //   <AddStudentInformation />
    //   <GetStudent />

    //   <AddCourse />

    //   <AddDiscipline />

    //   <AddGrade />
    //   <GetGrade />

    //   <RequestAccess />
    //   <AllowAccessToAddress />
    //   {/*<RegisterBatchRecords />
    //   <DisplayRegisteredRecords />
    //   <DecryptRecord />
    //   <GrantAccess />
    //   <RevokeAccess />
    //   <ViewGrantedAccess />
    //   <PublicKeyRecovery
    //     title="Chave Pública do Usuário Conectado"
    //     onPublicKeyReady={handlePublicKeyRecovered}
    //   />
    //    */}
    // </div>   
  );
}