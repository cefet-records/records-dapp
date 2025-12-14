// app/api/disciplines-batch/route.ts (CORRIGIDO)

import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// Estrutura esperada do payload do banco de dados (snake_case)
interface DisciplineDBPayload {
  course_code: string;
  discipline_code: string;
  name: string;
  syllabus: string;
  workload: number;     // number no DB (SMALLINT)
  credit_count: number; // number no DB (SMALLINT)
}

// Estrutura esperada pelo frontend/contrato (camelCase e bigint)
interface FullDisciplinePayload {
  courseCode: string;
  disciplineCode: string;
  name: string;
  syllabus: string;
  workload: bigint;
  creditCount: bigint;
}

// FUNÇÃO AUXILIAR DE SERIALIZAÇÃO: Converte BigInt para String
function stringifyBigInts(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (key, value) =>
    (typeof value === 'bigint' ? value.toString() : value)
  ));
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
    // Query SQL para buscar TODAS as disciplinas
    const result = await pool.query<DisciplineDBPayload>(
      `SELECT course_code, discipline_code, name, syllabus, workload, credit_count FROM disciplines`
    );

    // Mapear o resultado do banco de dados (snake_case) para o formato esperado (camelCase e bigint)
    const batchData: FullDisciplinePayload[] = result.rows.map(row => ({
      courseCode: row.course_code,
      disciplineCode: row.discipline_code,
      name: row.name,
      syllabus: row.syllabus,
      workload: BigInt(row.workload),
      creditCount: BigInt(row.credit_count),
    }));

    // CORREÇÃO APLICADA: Serializar BigInts antes de enviar com NextResponse
    const serializedData = stringifyBigInts(batchData);

    return NextResponse.json(serializedData, { status: 200 });

  } catch (error) {
    console.error('Database query error:', error);
    return NextResponse.json(
      { message: 'Falha ao buscar dados das disciplinas no banco de dados.' },
      { status: 500 }
    );
  }
}