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