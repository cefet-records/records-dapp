import { Abi } from "viem";

const CONTRACT_ADDRESS: `0x${string}` = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const AcademicRecordStorageABI = [
    {
        "inputs": [],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "owner",
                "type": "address"
            }
        ],
        "name": "OwnableInvalidOwner",
        "type": "error"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "account",
                "type": "address"
            }
        ],
        "name": "OwnableUnauthorizedAccount",
        "type": "error"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "bytes32",
                "name": "recordId",
                "type": "bytes32"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "student",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "visitorAddress",
                "type": "address"
            }
        ],
        "name": "AccessGranted",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "bytes32",
                "name": "recordId",
                "type": "bytes32"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "student",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "visitorAddress",
                "type": "address"
            }
        ],
        "name": "AccessRevoked",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "address",
                "name": "previousOwner",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "newOwner",
                "type": "address"
            }
        ],
        "name": "OwnershipTransferred",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": true,
                "internalType": "bytes32",
                "name": "recordId",
                "type": "bytes32"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "student",
                "type": "address"
            },
            {
                "indexed": true,
                "internalType": "address",
                "name": "institution",
                "type": "address"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "timestamp",
                "type": "uint256"
            }
        ],
        "name": "RecordRegistered",
        "type": "event"
    },
    {
        "stateMutability": "payable",
        "type": "fallback"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_institution",
                "type": "address"
            }
        ],
        "name": "addInstitution",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "_recordId",
                "type": "bytes32"
            }
        ],
        "name": "getRecord",
        "outputs": [
            {
                "components": [
                    {
                        "internalType": "bytes32",
                        "name": "recordId",
                        "type": "bytes32"
                    },
                    {
                        "internalType": "address",
                        "name": "student",
                        "type": "address"
                    },
                    {
                        "internalType": "address",
                        "name": "institution",
                        "type": "address"
                    },
                    {
                        "internalType": "bytes",
                        "name": "encryptedData",
                        "type": "bytes"
                    },
                    {
                        "internalType": "bytes",
                        "name": "encryptedKeyInstitution",
                        "type": "bytes"
                    },
                    {
                        "internalType": "bytes",
                        "name": "encryptedKeyStudent",
                        "type": "bytes"
                    },
                    {
                        "internalType": "bytes",
                        "name": "signature",
                        "type": "bytes"
                    },
                    {
                        "internalType": "uint256",
                        "name": "timestamp",
                        "type": "uint256"
                    }
                ],
                "internalType": "struct AcademicRecordStorage.Record",
                "name": "",
                "type": "tuple"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "_recordId",
                "type": "bytes32"
            },
            {
                "internalType": "address",
                "name": "_visitorAddress",
                "type": "address"
            },
            {
                "internalType": "bytes",
                "name": "_encryptedKeyVisitor",
                "type": "bytes"
            }
        ],
        "name": "grantVisitorAccess",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "name": "isInstitution",
        "outputs": [
            {
                "internalType": "bool",
                "name": "",
                "type": "bool"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "owner",
        "outputs": [
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "",
                "type": "bytes32"
            }
        ],
        "name": "records",
        "outputs": [
            {
                "internalType": "bytes32",
                "name": "recordId",
                "type": "bytes32"
            },
            {
                "internalType": "address",
                "name": "student",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "institution",
                "type": "address"
            },
            {
                "internalType": "bytes",
                "name": "encryptedData",
                "type": "bytes"
            },
            {
                "internalType": "bytes",
                "name": "encryptedKeyInstitution",
                "type": "bytes"
            },
            {
                "internalType": "bytes",
                "name": "encryptedKeyStudent",
                "type": "bytes"
            },
            {
                "internalType": "bytes",
                "name": "signature",
                "type": "bytes"
            },
            {
                "internalType": "uint256",
                "name": "timestamp",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32[]",
                "name": "_recordIds",
                "type": "bytes32[]"
            },
            {
                "internalType": "address[]",
                "name": "_studentes",
                "type": "address[]"
            },
            {
                "internalType": "bytes[]",
                "name": "_encryptedData",
                "type": "bytes[]"
            },
            {
                "internalType": "bytes[]",
                "name": "_encryptedKeyInstitution",
                "type": "bytes[]"
            },
            {
                "internalType": "bytes[]",
                "name": "_encryptedKeyStudent",
                "type": "bytes[]"
            },
            {
                "internalType": "bytes[]",
                "name": "_signatures",
                "type": "bytes[]"
            }
        ],
        "name": "registerBatchRecords",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "_institution",
                "type": "address"
            }
        ],
        "name": "removeInstitution",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "renounceOwnership",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "_recordId",
                "type": "bytes32"
            },
            {
                "internalType": "address",
                "name": "_visitorAddress",
                "type": "address"
            }
        ],
        "name": "revokeVisitorAccess",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "newOwner",
                "type": "address"
            }
        ],
        "name": "transferOwnership",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "",
                "type": "bytes32"
            },
            {
                "internalType": "address",
                "name": "",
                "type": "address"
            }
        ],
        "name": "visitorAccessKeys",
        "outputs": [
            {
                "internalType": "bytes",
                "name": "",
                "type": "bytes"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "stateMutability": "payable",
        "type": "receive"
    }
] as const satisfies Abi;

export const wagmiContractConfig = {
    address: CONTRACT_ADDRESS,
    abi: AcademicRecordStorageABI
};