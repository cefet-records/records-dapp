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
