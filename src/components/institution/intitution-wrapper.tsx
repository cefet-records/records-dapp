import Stack from '@mui/material/Stack'
import React from 'react'
import { AddCourse } from '../course/add-course'
import AddStudent from '../student/add-student'
import { AddDiscipline } from '../discipline/add-discipline'
import { AddGrade } from '../grade/add-grade'
import { GetGrade } from '../grade/get-grade'
import AddInstitutionInfo from './add-institution-information'
import { GetStudent } from '../student/get-student'

const IntitutionWrapper = () => {
  return (
    <Stack gap={4} mb={4}>
      <AddInstitutionInfo />
      <AddStudent />
      <GetStudent />
      <GetGrade />
    </Stack>
  )
}

export default IntitutionWrapper