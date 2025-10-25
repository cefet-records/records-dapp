import { Address, Hex } from "viem";

export function formatRecordStruct(recordArray: readonly any[]) {
    if (!recordArray || recordArray.length < 8) return null;
    
    return {
        recordId: recordArray[0],
        student: recordArray[1],
        institution: recordArray[2],
        encryptedData: recordArray[3],
        encryptedKeyInstitution: recordArray[4],
        encryptedKeyStudent: recordArray[5],
        signature: recordArray[6],
        timestamp: recordArray[7]
    };
}

export const INSTITUTION_PUBLIC_KEY: Hex = '0x048318535b54105d4a7aae60c08fc45f9687181b4fdfc625bd1a753fa7397fed753547f11ca8696646f2f3acb08e31016afac23e630c5d11f59f61fef57b0d2aa5';
export const STUDENT_PUBLIC_KEY_MOCKED: Hex = '0x04ba5734d8f7091719471e7f7ed6b9df170dc70cc661ca05e688601ad984f068b0d67351e5f06073092499336ab0839ef8a521afd334e53807205fa2f08eec74f4';

export const MOCK_BATCH_DATA = [
    {
        studentAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address,
        studentPublicKey: STUDENT_PUBLIC_KEY_MOCKED,
        plaintextData: {
            selfEncryptedInformation: "encrypted_data_1",
            institutionEncryptedInformation: "enc_inst_data_1",
            grades: [
                { disciplineCode: "BCC101", semester: 1, year: 2024, grade: 9.0, attendance: 95, status: "Aprovado" },
                { disciplineCode: "BCC102", semester: 2, year: 2024, grade: 8.5, attendance: 90, status: "Aprovado" }
            ],
        },
    },
];