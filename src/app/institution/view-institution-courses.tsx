// components/institution/ViewInstitutionCourses.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAccount, useReadContract } from "wagmi";
import { isAddress, Address } from "viem";
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI";

// Interfaces de Tipo Baseadas nas Structs do Contrato
interface Course {
  code: string;
  name: string;
  courseType: string;
  numberOfSemesters: number;
}

interface Discipline {
  code: string;
  name: string;
  syllabus: string;
  workload: bigint;
  creditCount: bigint;
}

// Estrutura de dados para o estado
interface CourseWithDisciplines extends Course {
  disciplines: ReadonlyArray<Discipline> | null;
  isLoadingDisciplines: boolean;
  errorDisciplines: string | null;
}

export function ViewInstitutionCourses() {
  const { address: connectedAddress, isConnected } = useAccount();

  const [coursesList, setCoursesList] = useState<CourseWithDisciplines[] | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);

  // Estado que controla qual código de curso deve ser buscado pelo hook de disciplina
  const [courseCodeToFetch, setCourseCodeToFetch] = useState<string | undefined>(undefined);

  const isInstitutionValid = isConnected && !!connectedAddress && isAddress(connectedAddress);

  // --- 1. Busca dos Cursos da Instituição (Inicial) ---
  const {
    data: rawCoursesData,
    isLoading: isLoadingCourses,
    error: coursesError,
  } = useReadContract({
    ...wagmiContractConfig,
    // Assumindo que você adicionou esta função ao seu contrato
    functionName: 'getInstitutionCourses',
    args: isInstitutionValid ? [connectedAddress as Address] : undefined,
    query: {
      enabled: isInstitutionValid,
      staleTime: 5000,
    },
  });

  // --- 2. Busca das Disciplinas (Condicional) ---
  // Este hook só é habilitado quando 'courseCodeToFetch' é definido
  const {
    data: rawDisciplinesData,
    isLoading: isLoadingDisciplines,
    error: disciplinesError,
    refetch: refetchDisciplines,
  } = useReadContract({
    ...wagmiContractConfig,
    // Assumindo que você adicionou esta função ao seu contrato
    functionName: 'getDisciplinesByCourseCode',
    args: courseCodeToFetch ? [courseCodeToFetch] : undefined,
    query: {
      enabled: false,
    },
  });

  // --- Efeito 1: Processar Cursos e Inicializar o Estado ---
  useEffect(() => {
    if (rawCoursesData && Array.isArray(rawCoursesData)) {
      const processedCourses: CourseWithDisciplines[] = (rawCoursesData as Course[]).map(course => ({
        ...course,
        numberOfSemesters: Number(course.numberOfSemesters),
        disciplines: null,
        isLoadingDisciplines: false,
        errorDisciplines: null,
      }));
      setCoursesList(processedCourses);
      setStatusMessage(`Total de ${processedCourses.length} cursos encontrados.`);
    } else if (rawCoursesData === undefined && !isLoadingCourses && isInstitutionValid) {
      setCoursesList([]);
      setStatusMessage("Nenhum curso registrado para esta instituição.");
    }
  }, [rawCoursesData, isLoadingCourses, isInstitutionValid]);

  // --- Efeito 2: Monitorar a busca de Disciplinas ---
  useEffect(() => {
    if (isLoadingDisciplines || !courseCodeToFetch) return;

    // Quando a busca termina, atualizamos o estado
    if (rawDisciplinesData || disciplinesError) {
      setCoursesList(prev => {
        if (!prev) return null;
        return prev.map(c => {
          if (c.code !== courseCodeToFetch) return c;

          // Atualiza o curso que foi buscado
          if (disciplinesError) {
            return {
              ...c,
              isLoadingDisciplines: false,
              errorDisciplines: disciplinesError.message || "Erro de busca de disciplina"
            };
          }

          // Sucesso na busca
          return {
            ...c,
            disciplines: rawDisciplinesData as Discipline[],
            isLoadingDisciplines: false,
            errorDisciplines: null,
          };
        });
      });

      // Limpa o estado de busca manual após a conclusão
      setCourseCodeToFetch(undefined);
    }
  }, [rawDisciplinesData, disciplinesError, isLoadingDisciplines, courseCodeToFetch]);


  // --- Função de Disparo (Chamada pelo Clique) ---
  const toggleCourseDetails = useCallback(async (courseCode: string, hasData: boolean) => {
    if (expandedCourse === courseCode) {
      setExpandedCourse(null); // Fecha se já estiver aberto
      return;
    }

    // Abre se já tivermos dados (só muda o estado de expansão)
    if (hasData) {
      setExpandedCourse(courseCode);
      return;
    }

    // Se não houver dados, define o código para o hook buscar e dispara o fetch
    if (courseCodeToFetch !== courseCode) {
      setCourseCodeToFetch(courseCode);
    }

    const result = await refetchDisciplines(); // Dispara o fetch manual

    // Se for um erro de revert de contrato (ex: disciplina não encontrada), 
    // o useEffect 2 lidará com o estado de erro, mas podemos definir a expansão aqui.
    if (!result.isError) {
      setExpandedCourse(courseCode); // Expande se o refetch for iniciado com sucesso
    }

  }, [expandedCourse, courseCodeToFetch, refetchDisciplines]);


  // Renderização condicional para as Disciplinas
  const renderDisciplines = (course: CourseWithDisciplines) => {
    if (course.isLoadingDisciplines) {
      return <p className="p-2 text-center text-blue-600">Carregando disciplinas...</p>;
    }
    if (course.errorDisciplines) {
      return <p className="p-2 text-center text-red-600">Erro: {course.errorDisciplines}</p>;
    }
    if (!course.disciplines || course.disciplines.length === 0) {
      return <p className="p-2 text-center text-gray-500">Nenhuma disciplina registrada para este curso.</p>;
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-300 border border-gray-300 mt-2">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">Código</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">Nome</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">Carga Horária</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">Créditos</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">Ementa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {course.disciplines.map((d, i) => (
              <tr key={`${course.code}-d-${i}`} className="hover:bg-gray-50">
                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{d.code}</td>
                <td className="px-4 py-2 text-sm text-gray-700">{d.name}</td>
                <td className="px-4 py-2 text-sm text-gray-500 text-center">{d.workload}</td>
                <td className="px-4 py-2 text-sm text-gray-500 text-center">{d.creditCount}</td>
                <td className="px-4 py-2 text-sm text-gray-500 truncate max-w-xs">{d.syllabus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="view-courses-container p-4 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">Cursos e Disciplinas da Instituição</h2>

      {!isConnected ? (
        <p className="text-red-500">Conecte sua carteira para ver os cursos da sua instituição.</p>
      ) : isLoadingCourses ? (
        <p className="text-blue-600">Carregando dados dos cursos...</p>
      ) : (
        <>
          {statusMessage && <p className="mb-4 text-sm text-gray-600">{statusMessage}</p>}

          {coursesList && coursesList.length > 0 ? (
            <div className="space-y-4">
              {coursesList.map((course) => (
                <div key={course.code} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Linha do Curso */}
                  <div
                    className="p-4 flex justify-between items-center bg-gray-50 hover:bg-gray-100 cursor-pointer transition duration-150"
                    onClick={() => toggleCourseDetails(course.code, !!course.disciplines)}
                  >
                    <div className="font-semibold text-lg text-gray-800">
                      {course.name} <span className="text-sm font-normal text-gray-500">({course.code})</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {course.numberOfSemesters} semestres
                    </div>
                    <button className="text-gray-500 hover:text-gray-700 transition duration-150">
                      {expandedCourse === course.code ? '▲' : '▼'}
                    </button>
                  </div>

                  {/* Detalhes das Disciplinas (Expandido) */}
                  {expandedCourse === course.code && (
                    <div className="p-4 border-t border-gray-200">
                      <h3 className="text-md font-semibold mb-2">Disciplinas:</h3>
                      {renderDisciplines(course)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 italic">Nenhum curso registrado até o momento.</p>
          )}
        </>
      )}
    </div>
  );
}