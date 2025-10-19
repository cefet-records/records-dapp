import { stringToBytes, bytesToHex, keccak256, toHex, Address } from "viem";

export const MOCK_INSTITUTION_ADDRESS: Address = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";

export const stringToBytesHex = (value: string): `0x${string}` => {
    return bytesToHex(stringToBytes(value));
};

export const stringToBytes32Hex = (value: string): `0x${string}` => {
    return keccak256(toHex(value)); 
};