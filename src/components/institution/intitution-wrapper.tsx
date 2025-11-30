import Stack from '@mui/material/Stack'
import React from 'react'
import AddInstitution from './add-institution'
import { AddCourse } from '../course/add-course'
import AddStudent from '../student/add-student'
import { AddDiscipline } from '../discipline/add-discipline'
import { AddGrade } from '../grade/add-grade'
import { GetGrade } from '../grade/get-grade'
import RegisterBatchRecords from '@/app/add-batch-record'

const IntitutionWrapper = () => {
  return (
    <Stack>
      <AddStudent />
      <AddCourse />
      <AddDiscipline />
      <AddGrade />
      <GetGrade />
      {/* <RegisterBatchRecords /> */}
    </Stack>
  )
}

export default IntitutionWrapper