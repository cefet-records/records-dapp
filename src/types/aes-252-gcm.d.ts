declare module 'aes-256-gcm' {
  interface EncryptedData {
    ciphertext: Uint8Array;
    tag: Uint8Array;
  }
  function encrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): EncryptedData;
  function decrypt(encryptedData: EncryptedData, key: Uint8Array, iv: Uint8Array): Uint8Array;
  export default { encrypt, decrypt };
}