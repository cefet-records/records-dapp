// app/api/courses-batch/route.ts (CORRIGIDO)

import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// Estrutura esperada do payload do banco de dados (snake_case)
interface CourseDBPayload {
    code: string;
    name: string;
    course_type: string;
    number_of_semesters: number; 
}

// Estrutura esperada pelo frontend/contrato (camelCase e bigint)
interface BatchCoursePayload {
    code: string;
    name: string;
    courseType: string;
    numberOfSemesters: bigint;
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

// A função GET é o handler para requisições GET
export async function GET(request: Request) {
    try {
        // Query SQL para buscar TODOS os cursos da tabela 'courses'
        const result = await pool.query<CourseDBPayload>(
            `SELECT code, name, course_type, number_of_semesters FROM courses`
        );

        // Mapear o resultado do banco de dados (snake_case) para o formato esperado pelo contrato (camelCase e bigint)
        const batchData: BatchCoursePayload[] = result.rows.map(row => ({
            code: row.code,
            name: row.name,
            courseType: row.course_type,
            // Mantemos BigInt aqui, mas ele será serializado abaixo.
            numberOfSemesters: BigInt(row.number_of_semesters), 
        }));

        // CORREÇÃO APLICADA: Serializar BigInts antes de enviar com NextResponse
        const serializedData = stringifyBigInts(batchData);
        
        return NextResponse.json(serializedData, { status: 200 });

    } catch (error) {
        console.error('Database query error:', error);
        // Retornar erro formatado com NextResponse
        return NextResponse.json(
            { message: 'Falha ao buscar dados dos cursos no banco de dados.' }, 
            { status: 500 }
        );
    }
}