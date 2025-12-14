CREATE DATABASE academic_record_db;

CREATE TABLE courses (
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    course_type VARCHAR(50) NOT NULL,
    number_of_semesters SMALLINT NOT NULL
);

INSERT INTO courses (code, name, course_type, number_of_semesters) VALUES
('ADS', 'Análise e Desenvolvimento de Sistema', 'Bacharelado', 8),
('BCC', 'Ciência da Computação', 'Tecnólogo', 4);


CREATE TABLE disciplines (
    discipline_code VARCHAR(10) PRIMARY KEY,
    course_code VARCHAR(10) NOT NULL,
    name VARCHAR(255) NOT NULL,
    syllabus TEXT,
    workload SMALLINT NOT NULL,
    credit_count SMALLINT NOT NULL,
    
    FOREIGN KEY (course_code) REFERENCES courses(code)
);

INSERT INTO disciplines 
    (course_code, discipline_code, name, syllabus, workload, credit_count) 
VALUES
('ADS', 'PRG101', 'Introdução à Programação', 'Conceitos básicos de lógica e algoritmos.', 60, 4),
('ADS', 'BD202', 'Banco de Dados II', 'Modelagem avançada e otimização SQL.', 90, 6),
('BCC', 'ALC301', 'Álgebra Linear Computacional', 'Espaços vetoriais e transformações lineares.', 75, 5),
('BCC', 'SEC401', 'Segurança da Informação', 'Criptografia e políticas de segurança.', 90, 6);


CREATE TABLE grades (
    grade_id SERIAL PRIMARY KEY,
    student_address VARCHAR(42) NOT NULL,
    course_code VARCHAR(10) NOT NULL,
    discipline_code VARCHAR(10) NOT NULL,
    semester SMALLINT NOT NULL,
    year SMALLINT NOT NULL,
    grade NUMERIC(4, 2) NOT NULL,
    attendance SMALLINT NOT NULL,
    status BOOLEAN NOT NULL,
    
    FOREIGN KEY (course_code) REFERENCES courses(code),
    FOREIGN KEY (discipline_code) REFERENCES disciplines(discipline_code),
    
    UNIQUE (student_address, discipline_code, semester, year)
);

INSERT INTO grades 
    (student_address, course_code, discipline_code, semester, year, grade, attendance, status) 
VALUES
('0x0775fbe1bea4b2b3531ec4b81897e87442bfaae3', 'BCC', 'ALC301', 1, 2024, 95.00, 90, TRUE),
('0x139eda1600983c7b42dacd4f4c4aa529358d8dd0', 'ADS', 'PRG101', 1, 2024, 60.00, 70, TRUE),
('0x0775fbe1bea4b2b3531ec4b81897e87442bfaae3', 'BCC', 'SEC401', 3, 2023, 45.00, 100, FALSE);


CREATE TABLE students (
    student_address VARCHAR(42) PRIMARY KEY,
    institution_address VARCHAR(42) NOT NULL
);
INSERT INTO students (student_address, institution_address) VALUES
('0x0775fbe1bea4b2b3531ec4b81897e87442bfaae3', '0x9f69a815356bafce6a4f819d1b92bc26bfa053ae'),
('0x139eda1600983c7b42dacd4f4c4aa529358d8dd0', '0x9f69a815356bafce6a4f819d1b92bc26bfa053ae');