import React from "react";
import Typography from '@mui/material/Typography';
import { GradeItem } from './get-grade';
import styles from './student-history.module.css'
import Stack from '@mui/material/Stack';

type StudentHistoryProps = {
  institutionInfo: any | null;
  studentInfo: any | null;
  queryStudentAddress: string;
  queriedStudentGrades: GradeItem[] | null;
}

export function StudentHistory({ institutionInfo, studentInfo, queryStudentAddress, queriedStudentGrades }: StudentHistoryProps) {
  const groupGradesBySemester = (grades: GradeItem[] | null): Record<number, GradeItem[]> => {
    if (!grades) return {};
    return grades.reduce((groups, grade) => {
      if (!groups[grade.semester]) {
        groups[grade.semester] = [];
      }
      groups[grade.semester].push(grade);
      return groups;
    }, {} as Record<number, GradeItem[]>);
  };

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Detalhes do Histórico</h3>

      <div className={styles.infoWrapper}>
        <div className={styles.studentInfo}>
          <div>
            <p className={styles.label}>Universidade</p>
            <p className={styles.value}>{institutionInfo?.institutionName}</p>
          </div>

          <div>
            <p className={styles.label}>Curso</p>
            <p className={styles.value}>{`${institutionInfo?.courseCode || ''} - ${institutionInfo?.courseName || ''}`}</p>
          </div>

          <div>
            <p className={styles.label}>Nome do Estudante</p>
            <p className={styles.value}>{studentInfo?.name}</p>
          </div>

          <div>
            <p className={styles.label}>Documento do Estudante</p>
            <p className={styles.value}>{studentInfo?.document}</p>
          </div>

          <div>
            <p className={styles.label}>Endereço do Estudante</p>
            <p className={styles.value}>{queryStudentAddress}</p>
          </div>

          <div>
            <p className={styles.label}>Hash do Estudante (Blockchain)</p>
            <p className={styles.value}>{studentInfo?.publicHash}</p>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Código</th>
                <th className={styles.th}>Disciplina</th>
                <th className={`${styles.th} ${styles.thCenter}`}>Carga Horária</th>
                <th className={`${styles.th} ${styles.thCenter}`}>Créditos</th>
                <th className={`${styles.th} ${styles.thCenter}`}>Nota</th>
                <th className={`${styles.th} ${styles.thCenter}`}>Frequência</th>
                <th className={styles.th}>Status</th>
              </tr>
            </thead>

            <tbody className={styles.tbody}>
              {Object.entries(groupGradesBySemester(queriedStudentGrades)).map(
                ([semester, grades]: [string, GradeItem[]]) => (
                  // ✅ CORREÇÃO: Usando React.Fragment com key em vez de <>
                  <React.Fragment key={`semester-group-${semester}`}>
                    <tr>
                      <td colSpan={7} className={`${styles.td} ${styles.semesterRow}`}>
                        Semestre: {semester}
                      </td>
                    </tr>
                    {grades.map((grade: GradeItem) => (
                      <tr key={`${grade.disciplineCode}-${grade.year}-${grade.semester}`} className={styles.row}>
                        <td className={styles.td}>{grade.disciplineCode}</td>
                        <td className={styles.td}>{grade.disciplineName}</td>
                        <td className={`${styles.td} ${styles.tdCenter}`}>{grade.workload}</td>
                        <td className={`${styles.td} ${styles.tdCenter}`}>
                          {grade.creditCount}
                        </td>
                        <td className={`${styles.td} ${styles.tdCenter}`}>
                          {grade.grade.toFixed(2)}
                        </td>
                        <td className={`${styles.td} ${styles.tdCenter}`}>
                          {grade.attendance}%
                        </td>
                        <td className={styles.td}>
                          <span className={styles.status}>
                            {grade.status ? "Aprovado" : "Reprovado"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}