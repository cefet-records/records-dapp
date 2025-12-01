"use client";

import { DynamicWidget } from "@dynamic-labs/sdk-react-core";
import CheckInstitutionStatus from "./institution/is-institution";
import AddInstitution from "./institution/add-institution";
import AddStudent from "./institution/add-student";
import { GetInstitutionDetails } from "./institution/get-institution";
import { AddStudentInformation } from "./student/add-student-information";
import { GetStudent } from "./student/get-student";
import { AddCourse } from "./course/add-course";
import { AddDiscipline } from "./discipline/add-discipline";
import { AddGrade } from "./grade/add-grade";
import { GetGrade } from "./grade/get-grade";
import { RequestAccess } from "./visitor/request-access";
import { AllowAccessToAddress } from "./student/allow-access-to-address";

export default function Home() {
  return (
    <div>
      <DynamicWidget />

      <AddInstitution />
      <CheckInstitutionStatus />
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
import { DynamicEmbeddedWidget, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import Typography from "@mui/material/Typography";
import { Stack } from "@mui/system";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";

const Page = () => {
  const { isConnected, isConnecting } = useAccount();
  const { primaryWallet } = useDynamicContext();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Pequeno delay para garantir que o estado está estabilizado
    const timer = setTimeout(() => {
      setIsChecking(false);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isChecking && (isConnected || primaryWallet)) {
      router.replace("/home");
    }
  }, [isConnected, primaryWallet, router, isChecking]);

  // Não renderiza nada enquanto verifica ou está conectado
  if (isChecking || isConnecting || isConnected || primaryWallet) {
    return null;
  }

  return (
    <Stack
      sx={{
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        fontWeight: "bold",
      }}
      gap={4}
    >
      <Typography variant="h1" sx={{ fontSize: "2rem" }}>
        Records Dapp
      </Typography>

      <Stack>
        <DynamicEmbeddedWidget
          style={{ width: "40vw", maxWidth: "500px" }}
          background="with-border"
        />
      </Stack>
    </Stack>
  );
};

export default Page;
