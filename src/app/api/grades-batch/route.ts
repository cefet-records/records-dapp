// app/api/grades-batch/route.ts

import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { Address, isAddress } from 'viem';

// Estrutura DB (snake_case)
interface GradeDBPayload {
  student_address: string;
  course_code: string;
  discipline_code: string;
  semester: number;
  year: number;
  // CORREÇÃO: O tipo NUMERIC do PostgreSQL é frequentemente retornado como STRING pela biblioteca 'pg'.
  grade: string;
  attendance: number;
  status: boolean;
}

// Estrutura de Contrato/Frontend (camelCase)
interface BatchGradePayload {
  studentAddress: Address;
  courseCode: string;
  disciplineCode: string;
  semester: number;
  year: number;
  grade: number;
  attendance: number;
  status: boolean;
}

// Configuração do pool de conexão do PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: 5432,
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const institutionAddress = url.searchParams.get('institutionAddress');

    if (!institutionAddress || !isAddress(institutionAddress)) {
      return NextResponse.json(
        { message: 'institutionAddress inválido ou ausente.' },
        { status: 400 }
      );
    }

    // 1. CORREÇÃO DE CASE SENSITIVITY: Padronizando o endereço para minúsculas
    const lowerCaseInstitutionAddress = institutionAddress.toLowerCase();


    // 2. BUSCA NO BANCO DE DADOS (JOIN para filtrar apenas estudantes da instituição)
    const result = await pool.query<GradeDBPayload>(
      `SELECT 
                g.student_address, g.course_code, g.discipline_code,
                g.semester, g.year, g.grade, g.attendance, g.status
             FROM grades g
             JOIN students s ON g.student_address = s.student_address
             WHERE s.institution_address = $1`,
      [lowerCaseInstitutionAddress] // Usa o endereço em minúsculas
    );

    // 3. MAPEAR DADOS
    const batchData: BatchGradePayload[] = result.rows.map(row => ({
      studentAddress: row.student_address as Address,
      courseCode: row.course_code,
      disciplineCode: row.discipline_code,
      semester: row.semester,
      year: row.year,
      // CORREÇÃO: Converte a STRING (do tipo NUMERIC do DB) para NUMBER float.
      grade: parseFloat(row.grade),
      attendance: row.attendance,
      status: row.status,
    }));

    // 4. RETORNO DE SUCESSO
    return NextResponse.json(batchData, { status: 200 });

  } catch (error) {
    console.error('Database query error:', error);
    return NextResponse.json(
      { message: 'Falha ao buscar dados das notas no banco de dados.' },
      { status: 500 }
    );
  }
}