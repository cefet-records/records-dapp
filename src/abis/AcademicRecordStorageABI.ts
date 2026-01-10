import { Abi } from "viem";

const CONTRACT_ADDRESS: `0x${string}` =
  "0x8Fa723daC615E552CBea136358b438AF9b2A3dEe";
const AcademicRecordStorageABI = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "studentAddress",
        type: "address",
      },
      {
        indexed: false,
        internalType: "address",
        name: "allowedAddress",
        type: "address",
      },
    ],
    name: "AllowedAddressAdded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "institutionAddress",
        type: "address",
      },
      {
        indexed: false,
        internalType: "string",
        name: "courseCode",
        type: "string",
      },
    ],
    name: "CourseAdded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "string",
        name: "courseCode",
        type: "string",
      },
      {
        indexed: false,
        internalType: "string",
        name: "disciplineCode",
        type: "string",
      },
    ],
    name: "DisciplineAdded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "studentAddress",
        type: "address",
      },
      {
        indexed: false,
        internalType: "string",
        name: "disciplineCode",
        type: "string",
      },
      {
        indexed: false,
        internalType: "uint16",
        name: "year",
        type: "uint16",
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "semester",
        type: "uint8",
      },
    ],
    name: "GradeAdded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "institutionAddress",
        type: "address",
      },
    ],
    name: "InstitutionAdded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "institutionAddress",
        type: "address",
      },
      {
        indexed: false,
        internalType: "string",
        name: "name",
        type: "string",
      },
      {
        indexed: false,
        internalType: "string",
        name: "document",
        type: "string",
      },
    ],
    name: "InstitutionInformationAdded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "studentAddress",
        type: "address",
      },
    ],
    name: "StudentAdded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "studentAddress",
        type: "address",
      },
    ],
    name: "StudentInformationAdded",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_institutionAddress",
        type: "address",
      },
      {
        components: [
          {
            internalType: "string",
            name: "code",
            type: "string",
          },
          {
            internalType: "string",
            name: "name",
            type: "string",
          },
          {
            internalType: "string",
            name: "courseType",
            type: "string",
          },
          {
            internalType: "int256",
            name: "numberOfSemesters",
            type: "int256",
          },
        ],
        internalType: "struct AcademicRecordStorage.BatchCoursePayload[]",
        name: "_coursesInfo",
        type: "tuple[]",
      },
    ],
    name: "addBatchCourses",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_institutionAddress",
        type: "address",
      },
      {
        components: [
          {
            internalType: "address",
            name: "studentAddress",
            type: "address",
          },
          {
            internalType: "string",
            name: "courseCode",
            type: "string",
          },
          {
            internalType: "string",
            name: "disciplineCode",
            type: "string",
          },
          {
            internalType: "uint8",
            name: "semester",
            type: "uint8",
          },
          {
            internalType: "uint16",
            name: "year",
            type: "uint16",
          },
          {
            internalType: "uint8",
            name: "grade",
            type: "uint8",
          },
          {
            internalType: "uint8",
            name: "attendance",
            type: "uint8",
          },
          {
            internalType: "bool",
            name: "status",
            type: "bool",
          },
        ],
        internalType: "struct AcademicRecordStorage.BatchGradePayload[]",
        name: "_gradesInfo",
        type: "tuple[]",
      },
    ],
    name: "addBatchGrades",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "studentAddress",
            type: "address",
          },
          {
            internalType: "address",
            name: "institutionAddress",
            type: "address",
          },
        ],
        internalType: "struct AcademicRecordStorage.BatchStudentPayload[]",
        name: "_studentsInfo",
        type: "tuple[]",
      },
    ],
    name: "addBatchStudents",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_institutionAddress",
        type: "address",
      },
      {
        internalType: "string",
        name: "_code",
        type: "string",
      },
      {
        internalType: "string",
        name: "_name",
        type: "string",
      },
      {
        internalType: "string",
        name: "_courseType",
        type: "string",
      },
      {
        internalType: "int256",
        name: "_numberOfSemesters",
        type: "int256",
      },
    ],
    name: "addCourse",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "institutionAddress",
        type: "address",
      },
      {
        internalType: "string",
        name: "courseCode",
        type: "string",
      },
      {
        internalType: "string",
        name: "disciplineCode",
        type: "string",
      },
      {
        internalType: "string",
        name: "name",
        type: "string",
      },
      {
        internalType: "string",
        name: "syllabus",
        type: "string",
      },
      {
        internalType: "int256",
        name: "workload",
        type: "int256",
      },
      {
        internalType: "int256",
        name: "creditCount",
        type: "int256",
      },
    ],
    name: "addDisciplineToCourse",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_allowedAddress",
        type: "address",
      },
      {
        internalType: "address",
        name: "_studentAddress",
        type: "address",
      },
      {
        internalType: "string",
        name: "_encryptedData",
        type: "string",
      },
    ],
    name: "addEncryptedInfoWithRecipientKey",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_institutionAddress",
        type: "address",
      },
      {
        components: [
          {
            internalType: "string",
            name: "courseCode",
            type: "string",
          },
          {
            internalType: "string",
            name: "disciplineCode",
            type: "string",
          },
          {
            internalType: "string",
            name: "name",
            type: "string",
          },
          {
            internalType: "string",
            name: "syllabus",
            type: "string",
          },
          {
            internalType: "int256",
            name: "workload",
            type: "int256",
          },
          {
            internalType: "int256",
            name: "creditCount",
            type: "int256",
          },
        ],
        internalType: "struct AcademicRecordStorage.FullDisciplinePayload[]",
        name: "_fullDisciplinesInfo",
        type: "tuple[]",
      },
    ],
    name: "addGlobalBatchDisciplines",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_institutionAddress",
        type: "address",
      },
      {
        internalType: "address",
        name: "_studentAddress",
        type: "address",
      },
      {
        internalType: "string",
        name: "_courseCode",
        type: "string",
      },
      {
        components: [
          {
            internalType: "string",
            name: "disciplineCode",
            type: "string",
          },
          {
            internalType: "uint8",
            name: "semester",
            type: "uint8",
          },
          {
            internalType: "uint16",
            name: "year",
            type: "uint16",
          },
          {
            internalType: "uint8",
            name: "grade",
            type: "uint8",
          },
          {
            internalType: "uint8",
            name: "attendance",
            type: "uint8",
          },
          {
            internalType: "bool",
            name: "status",
            type: "bool",
          },
        ],
        internalType: "struct AcademicRecordStorage.Grade",
        name: "_gradeInfo",
        type: "tuple",
      },
    ],
    name: "addGrade",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_institutionAddress",
        type: "address",
      },
    ],
    name: "addInstitution",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "_name",
        type: "string",
      },
      {
        internalType: "string",
        name: "_document",
        type: "string",
      },
    ],
    name: "addInstitutionInformation",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_institutionAddress",
        type: "address",
      },
      {
        internalType: "string",
        name: "_publicKey",
        type: "string",
      },
    ],
    name: "addInstitutionPublicKey",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_institutionAddress",
        type: "address",
      },
      {
        internalType: "address",
        name: "_studentAddress",
        type: "address",
      },
    ],
    name: "addStudent",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "_selfEncryptedInformation",
        type: "string",
      },
      {
        internalType: "string",
        name: "_encryptedInformation",
        type: "string",
      },
      {
        internalType: "string",
        name: "_publicKey",
        type: "string",
      },
      {
        internalType: "string",
        name: "_publicHash",
        type: "string",
      },
    ],
    name: "addStudentInformation",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "contractOwner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "_courseCode",
        type: "string",
      },
    ],
    name: "getDisciplinesByCourseCode",
    outputs: [
      {
        components: [
          {
            internalType: "string",
            name: "code",
            type: "string",
          },
          {
            internalType: "string",
            name: "name",
            type: "string",
          },
          {
            internalType: "string",
            name: "syllabus",
            type: "string",
          },
          {
            internalType: "int256",
            name: "workload",
            type: "int256",
          },
          {
            internalType: "int256",
            name: "creditCount",
            type: "int256",
          },
        ],
        internalType: "struct AcademicRecordStorage.Discipline[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_allowedAddress",
        type: "address",
      },
      {
        internalType: "address",
        name: "_studentAddress",
        type: "address",
      },
    ],
    name: "getEncryptedInfoWithRecipientKey",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_institutionAddress",
        type: "address",
      },
    ],
    name: "getInstitution",
    outputs: [
      {
        components: [
          {
            internalType: "address",
            name: "institutionAddress",
            type: "address",
          },
          {
            internalType: "string",
            name: "name",
            type: "string",
          },
          {
            internalType: "string",
            name: "document",
            type: "string",
          },
          {
            internalType: "string",
            name: "publicKey",
            type: "string",
          },
        ],
        internalType: "struct AcademicRecordStorage.Institution",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_institutionAddress",
        type: "address",
      },
    ],
    name: "getInstitutionCourses",
    outputs: [
      {
        components: [
          {
            internalType: "string",
            name: "code",
            type: "string",
          },
          {
            internalType: "string",
            name: "name",
            type: "string",
          },
          {
            internalType: "string",
            name: "courseType",
            type: "string",
          },
          {
            internalType: "int256",
            name: "numberOfSemesters",
            type: "int256",
          },
        ],
        internalType: "struct AcademicRecordStorage.Course[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getInstitutionList",
    outputs: [
      {
        internalType: "address[]",
        name: "",
        type: "address[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getPermission",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_studentAddress",
        type: "address",
      },
    ],
    name: "getStudent",
    outputs: [
      {
        components: [
          {
            internalType: "address",
            name: "studentAddress",
            type: "address",
          },
          {
            internalType: "string",
            name: "selfEncryptedInformation",
            type: "string",
          },
          {
            internalType: "string",
            name: "institutionEncryptedInformation",
            type: "string",
          },
          {
            internalType: "string",
            name: "publicKey",
            type: "string",
          },
          {
            internalType: "string",
            name: "publicHash",
            type: "string",
          },
        ],
        internalType: "struct AcademicRecordStorage.Student",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_studentAddress",
        type: "address",
      },
    ],
    name: "getStudentGrades",
    outputs: [
      {
        components: [
          {
            internalType: "string",
            name: "disciplineCode",
            type: "string",
          },
          {
            internalType: "uint8",
            name: "semester",
            type: "uint8",
          },
          {
            internalType: "uint16",
            name: "year",
            type: "uint16",
          },
          {
            internalType: "uint8",
            name: "grade",
            type: "uint8",
          },
          {
            internalType: "uint8",
            name: "attendance",
            type: "uint8",
          },
          {
            internalType: "bool",
            name: "status",
            type: "bool",
          },
        ],
        internalType: "struct AcademicRecordStorage.Grade[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_studentAddress",
        type: "address",
      },
    ],
    name: "getStudentInstitutionData",
    outputs: [
      {
        components: [
          {
            internalType: "address",
            name: "institutionAddress",
            type: "address",
          },
          {
            internalType: "string",
            name: "name",
            type: "string",
          },
          {
            internalType: "string",
            name: "document",
            type: "string",
          },
          {
            internalType: "string",
            name: "publicKey",
            type: "string",
          },
        ],
        internalType: "struct AcademicRecordStorage.Institution",
        name: "institution",
        type: "tuple",
      },
      {
        components: [
          {
            internalType: "string",
            name: "code",
            type: "string",
          },
          {
            internalType: "string",
            name: "name",
            type: "string",
          },
          {
            internalType: "string",
            name: "courseType",
            type: "string",
          },
          {
            internalType: "int256",
            name: "numberOfSemesters",
            type: "int256",
          },
        ],
        internalType: "struct AcademicRecordStorage.Course",
        name: "course",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_studentAddress",
        type: "address",
      },
    ],
    name: "getStudentTranscript",
    outputs: [
      {
        components: [
          {
            internalType: "string",
            name: "disciplineCode",
            type: "string",
          },
          {
            internalType: "uint8",
            name: "semester",
            type: "uint8",
          },
          {
            internalType: "uint16",
            name: "year",
            type: "uint16",
          },
          {
            internalType: "uint8",
            name: "grade",
            type: "uint8",
          },
          {
            internalType: "uint8",
            name: "attendance",
            type: "uint8",
          },
          {
            internalType: "bool",
            name: "status",
            type: "bool",
          },
        ],
        internalType: "struct AcademicRecordStorage.Grade[]",
        name: "",
        type: "tuple[]",
      },
      {
        components: [
          {
            internalType: "string",
            name: "code",
            type: "string",
          },
          {
            internalType: "string",
            name: "name",
            type: "string",
          },
          {
            internalType: "string",
            name: "syllabus",
            type: "string",
          },
          {
            internalType: "int256",
            name: "workload",
            type: "int256",
          },
          {
            internalType: "int256",
            name: "creditCount",
            type: "int256",
          },
        ],
        internalType: "struct AcademicRecordStorage.Discipline[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "isInstitution",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_studentAddress",
        type: "address",
      },
      {
        internalType: "string",
        name: "_encryptKey",
        type: "string",
      },
    ],
    name: "requestAccess",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_allowedAddress",
        type: "address",
      },
      {
        internalType: "address",
        name: "_studentAddress",
        type: "address",
      },
    ],
    name: "retrieveRecipientEncrpytKey",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const satisfies Abi;

export const wagmiContractConfig = {
  address: CONTRACT_ADDRESS,
  abi: AcademicRecordStorageABI,
};