import Stack from '@mui/material/Stack';
import React from 'react';
import { AddStudentInformation } from './add-student-information';
import { AllowAccessToAddress } from './allow-access-to-address';
import { GetStudent } from './get-student';
import { GetGrade } from '../grade/get-grade';

const StudentWrapper = (): React.JSX.Element => {
  return (
    <Stack gap={4} mb={4}>
      <AddStudentInformation />
      <GetStudent />
      <GetGrade />
      <AllowAccessToAddress />
    </Stack>
  );
};

export default StudentWrapper;