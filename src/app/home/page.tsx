"use client";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useAccount } from "wagmi";
import { Hex } from "viem";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useReadContract } from 'wagmi';
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI";
import { useIsClient } from "../is-client";
import Stack from "@mui/material/Stack";
import OwnerWrapper from "@/components/owner/owner-wrapper";
import IntitutionWrapper from "@/components/institution/intitution-wrapper";
import StudentWrapper from "@/components/student/student-wrapper";
import VisitorWrapper from "@/components/visitor/visitor-wrapper";
import HeaderPage from "@/components/header/header-page";

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
      <Stack className="pt-16">
        {userPermission === userTypes.OWNER && <OwnerWrapper />}
        {userPermission === userTypes.INSTITUTION && <IntitutionWrapper />}
        {userPermission === userTypes.STUDENT && <StudentWrapper />}
        {userPermission === userTypes.VISITOR && <VisitorWrapper />}
      </Stack>
    </>  
  );
}