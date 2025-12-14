// app/api/students-batch/route.ts

import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { Address, isAddress } from 'viem';

// Estrutura esperada do payload do banco de dados
interface StudentDBPayload {
    student_address: string;
    institution_address: string;
}

interface BatchStudentPayload {
    studentAddress: Address;
    institutionAddress: Address;
}

// Configuração do pool de conexão do PostgreSQL
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME, 
    password: process.env.DB_PASSWORD,
    port: 5432, 
});

// Use a função GET para lidar com requisições GET
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
        
        // CORREÇÃO CRÍTICA: Converta o endereço recebido para minúsculas antes de usar na query.
        // Isso garante que a comparação no DB (onde os dados estão em minúsculas) funcione.
        const lowerCaseInstitutionAddress = institutionAddress.toLowerCase();


        // 2. BUSCA NO BANCO DE DADOS
        const result = await pool.query<StudentDBPayload>(
            `SELECT student_address, institution_address 
             FROM students 
             WHERE institution_address = $1`,
            [lowerCaseInstitutionAddress] // Use o endereço padronizado
        );

        // 3. MAPEAR DADOS
        const batchData: BatchStudentPayload[] = result.rows.map(row => ({
            // Retornamos os dados como vieram do DB (minúsculos)
            studentAddress: row.student_address as Address,
            institutionAddress: row.institution_address as Address,
        }));

        // 4. RETORNO DE SUCESSO (App Router)
        return NextResponse.json(batchData, { status: 200 });

    } catch (error) {
        console.error('Database query error:', error);
        
        // 5. RETORNO DE ERRO (App Router)
        return NextResponse.json(
            { message: 'Falha ao buscar dados do banco de dados.' },
            { status: 500 }
        );
    }
}