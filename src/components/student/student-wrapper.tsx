import Stack from '@mui/material/Stack'
import React from 'react'
import { AddStudentInformation } from './add-student-information'
import { AllowAccessToAddress } from './allow-access-to-address'
import { GetStudent } from './get-student'
import { GrantVisitorAccess } from '@/app/grant-record-access'
import RevokeAccess from '@/app/revoke-access'

const StudentWrapper = () => {
  return (
    <Stack>
      <AllowAccessToAddress />
      <AddStudentInformation />
      <GetStudent />
      <GrantVisitorAccess />
      <RevokeAccess />
    </Stack>
  )
}

export default StudentWrapper