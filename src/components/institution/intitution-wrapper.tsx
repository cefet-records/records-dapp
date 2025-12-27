import Stack from '@mui/material/Stack'
import React from 'react'
import { AddCourse } from '../course/add-course'
import AddStudent from '../student/add-student'
import { AddDiscipline } from '../discipline/add-discipline'
import { AddGrade } from '../grade/add-grade'
import { GetGrade } from '../grade/get-grade'
import AddInstitutionInfo from './add-institution-information'
import { GetStudent } from '../student/get-student'
import { AddBatchGrade } from '@/app/institution/add-batch-record'
import { ViewInstitutionCourses } from '@/app/institution/view-institution-courses'
import { AddBatchStudents } from '../student/add-batch-students'
import { AddBatchCourses } from '../course/add-batch-course'
import { AddGlobalBatchDisciplines } from '../discipline/add-batch-discipline'

const IntitutionWrapper = () => {
  return (
    <Stack gap={4} mb={4}>
      <AddInstitutionInfo />
      <Stack 
        direction="row" 
        gap={2} 
        flexWrap="wrap" 
        justifyContent="space-between"
      >
        <AddBatchStudents />
        <AddBatchCourses />
        <AddGlobalBatchDisciplines />
        <AddBatchGrade />
      </Stack>
      <GetStudent />
      <GetGrade />
    </Stack>
  )
}

export default IntitutionWrapper