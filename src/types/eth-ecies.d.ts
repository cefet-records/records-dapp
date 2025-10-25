declare module 'eth-ecies' {
  export function encrypt(publicKey: Buffer, plaintext: Buffer): Buffer;
  export function decrypt(privateKey: Buffer, ciphertext: Buffer): Buffer;
}