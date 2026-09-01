-- Esquema de Base de Datos para JKA Seguros

-- 1. Tabla de Usuarios (Credenciales y Roles)
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    correo VARCHAR(150) UNIQUE NOT NULL,
    contrasena VARCHAR(255) NOT NULL,
    rango VARCHAR(50) NOT NULL DEFAULT 'cliente' CHECK (rango IN ('cliente', 'asesor', 'admin')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Asesores
CREATE TABLE IF NOT EXISTS asesores (
    id SERIAL PRIMARY KEY,
    usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
    nombre VARCHAR(200) NOT NULL,
    codigo_asesor VARCHAR(50) UNIQUE NOT NULL,
    correo VARCHAR(150) NOT NULL,
    telefono VARCHAR(50) NOT NULL,
    cedula VARCHAR(50),
    fecha_nacimiento DATE,
    banco VARCHAR(100),
    numero_cuenta VARCHAR(50),
    estado VARCHAR(50) DEFAULT 'pendiente',
    tipo_asesor VARCHAR(50) DEFAULT 'asesor_3' CHECK (tipo_asesor IN ('asesor_1', 'asesor_2', 'asesor_3', 'consultor_1', 'consultor_2', 'johans', 'nivel_1_subagente', 'nivel_2_agente')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de Datos Personales (Clientes)
CREATE TABLE IF NOT EXISTS datos_personales (
    id SERIAL PRIMARY KEY,
    usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
    primer_nombre VARCHAR(100) NOT NULL,
    segundo_nombre VARCHAR(100),
    primer_apellido VARCHAR(100) NOT NULL,
    segundo_apellido VARCHAR(100),
    fecha_nacimiento DATE NOT NULL,
    tipo_documento VARCHAR(50) NOT NULL, -- 'Venezolano', 'Extranjero', 'Pasaporte'
    nro_documento VARCHAR(50) UNIQUE NOT NULL,
    genero VARCHAR(50) NOT NULL, -- 'Masculino', 'Femenino'
    estado_civil VARCHAR(50) NOT NULL, -- 'Soltero', 'Casado', 'Divorciado', 'Viudo'
    codigo_area VARCHAR(10) NOT NULL, -- '0412', '0414', etc.
    numero_celular VARCHAR(50) NOT NULL,
    numero_hijos INT DEFAULT 0,
    asesor_id INT REFERENCES asesores(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla de Compañías de Seguros
CREATE TABLE IF NOT EXISTS companias_seguros (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL,
    comision_estandar NUMERIC DEFAULT 0,
    comision_compania NUMERIC DEFAULT 0,
    comision_asesor_estandar NUMERIC DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabla de Pólizas
CREATE TABLE IF NOT EXISTS polizas (
    id SERIAL PRIMARY KEY,
    codigo_poliza VARCHAR(50) UNIQUE NOT NULL,
    cliente_id INT REFERENCES datos_personales(id) ON DELETE CASCADE,
    asesor_id INT REFERENCES asesores(id) ON DELETE SET NULL,
    compania_id INT REFERENCES companias_seguros(id) ON DELETE RESTRICT,
    plan VARCHAR(100), -- Nombre del plan contratado (ej. 'PLATINO', 'ACCESS')
    area VARCHAR(100) NOT NULL DEFAULT 'Salud',
    suma_asegurada NUMERIC NOT NULL,
    deducible NUMERIC DEFAULT 0,
    prima_anual NUMERIC NOT NULL,
    comision_porcentaje NUMERIC,
    estado VARCHAR(50) NOT NULL DEFAULT 'negociacion' CHECK (estado IN ('negociacion', 'vigente', 'vencido', 'rechazado', 'anulada')),
    pago_estado VARCHAR(50) NOT NULL DEFAULT 'pendiente' CHECK (pago_estado IN ('pendiente', 'pagado', 'parcial')),
    frecuencia_pago VARCHAR(50) DEFAULT 'contado' CHECK (frecuencia_pago IN ('contado', 'semestral', 'cuatrimestral', 'trimestral', 'bimestral', '4_cuotas', 'cuatro_cuotas', 'mensual')),
    tipo_negocio VARCHAR(50) DEFAULT 'nuevo' CHECK (tipo_negocio IN ('nuevo', 'renovacion')),
    tipo_cobertura VARCHAR(50) DEFAULT 'individual' CHECK (tipo_cobertura IN ('individual', 'colectivo')),
    bono_pronto_pago BOOLEAN DEFAULT FALSE,
    emision_online BOOLEAN DEFAULT FALSE,
    recordatorio_24h BOOLEAN DEFAULT FALSE,
    recordatorio_48h BOOLEAN DEFAULT FALSE,
    recordatorio_5d BOOLEAN DEFAULT FALSE,
    motivo_rechazo TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Tabla de Pagos
CREATE TABLE IF NOT EXISTS pagos (
    id SERIAL PRIMARY KEY,
    poliza_id INT REFERENCES polizas(id) ON DELETE CASCADE,
    monto NUMERIC NOT NULL,
    fecha_pago DATE,
    estado_pago VARCHAR(50) NOT NULL DEFAULT 'pendiente' CHECK (estado_pago IN ('pendiente', 'en_revision', 'pagado', 'vencido', 'rechazado')),
    referencia VARCHAR(100),
    fecha_vencimiento DATE,
    cuota_numero INT,
    cuota_total INT,
    recordatorio_2d BOOLEAN DEFAULT FALSE,
    recordatorio_vencido BOOLEAN DEFAULT FALSE,
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Tabla de Tarifas (Primas por rango de edad)
CREATE TABLE IF NOT EXISTS tarifas (
    id SERIAL PRIMARY KEY,
    compania_id INT REFERENCES companias_seguros(id) ON DELETE CASCADE,
    edad_min INT NOT NULL,
    edad_max INT NOT NULL,
    suma_asegurada NUMERIC NOT NULL,
    deducible NUMERIC DEFAULT 0,
    prima NUMERIC NOT NULL,
    plan VARCHAR(100),
    pago VARCHAR(100),
    pago_contado BOOLEAN DEFAULT FALSE,
    pago_semestral BOOLEAN DEFAULT FALSE,
    pago_cuatrimestral BOOLEAN DEFAULT FALSE,
    pago_trimestral BOOLEAN DEFAULT FALSE,
    pago_bimestral BOOLEAN DEFAULT FALSE,
    pago_4_cuotas BOOLEAN DEFAULT FALSE,
    pago_mensual BOOLEAN DEFAULT FALSE,
    maternidad_suma VARCHAR(50),
    maternidad_costo VARCHAR(50),
    asist_intl_suma VARCHAR(50),
    asist_intl_costo VARCHAR(50),
    funeral_suma VARCHAR(50),
    funeral_costo VARCHAR(50),
    at_situ_medicamentos VARCHAR(50),
    atencion_medica_primaria BOOLEAN DEFAULT FALSE,
    medicinas BOOLEAN DEFAULT FALSE,
    consultas_medicas VARCHAR(50),
    rehabilitacion BOOLEAN DEFAULT FALSE,
    protesis BOOLEAN DEFAULT FALSE,
    muleta_silla_ruedas BOOLEAN DEFAULT FALSE,
    examenes_lab_imagenologia VARCHAR(50),
    consultas BOOLEAN DEFAULT FALSE,
    maternidad BOOLEAN DEFAULT FALSE,
    oftalmologia BOOLEAN DEFAULT FALSE,
    odontologia BOOLEAN DEFAULT FALSE,
    muerte_accidental BOOLEAN DEFAULT FALSE,
    muerte_accidental_suma VARCHAR(50),
    muerte_accidental_costo VARCHAR(50),
    invalidez_permanente BOOLEAN DEFAULT FALSE,
    invalidez_permanente_suma VARCHAR(50),
    invalidez_permanente_costo VARCHAR(50),
    ambulancia VARCHAR(50),
    ramo VARCHAR(100) NOT NULL DEFAULT 'Salud',
    reembolso_carta_aval BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Tabla de Logs de Actividad (Trazabilidad)
CREATE TABLE IF NOT EXISTS logs_actividad (
    id SERIAL PRIMARY KEY,
    usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    correo_usuario VARCHAR(150),
    accion VARCHAR(100) NOT NULL,
    descripcion TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Tabla de Configuración de Comisiones Personalizadas por Asesor y Aseguradora (Fallback/Legacy)
CREATE TABLE IF NOT EXISTS comisiones_asesores (
    id SERIAL PRIMARY KEY,
    asesor_id INT REFERENCES asesores(id) ON DELETE CASCADE,
    compania_id INT REFERENCES companias_seguros(id) ON DELETE CASCADE,
    porcentaje NUMERIC NOT NULL,
    UNIQUE(asesor_id, compania_id)
);

-- 10. Tabla de Matriz de Comisiones Jerárquica (Excel)
CREATE TABLE IF NOT EXISTS matriz_comisiones (
    id SERIAL PRIMARY KEY,
    mercado VARCHAR(100) NOT NULL, -- 'Nacionales' o 'Internacionales'
    compania_id INT REFERENCES companias_seguros(id) ON DELETE CASCADE,
    ramo VARCHAR(100) NOT NULL, -- Salud, Automovil, etc.
    producto_modalidad VARCHAR(255) NOT NULL, -- Plan o condición
    total_comision NUMERIC NOT NULL DEFAULT 0, -- Margen total pagado por aseguradora
    asesor_1 NUMERIC DEFAULT 0,
    asesor_2 NUMERIC DEFAULT 0,
    asesor_3 NUMERIC DEFAULT 0,
    consultor_1 NUMERIC DEFAULT 0,
    consultor_2 NUMERIC DEFAULT 0,
    johans NUMERIC DEFAULT 0,
    nivel_1_subagente NUMERIC DEFAULT 0,
    nivel_2_agente NUMERIC DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Tabla de Corridas de Comisiones (Historial BNC)
CREATE TABLE IF NOT EXISTS corridas_comisiones (
    id SERIAL PRIMARY KEY,
    fecha_ejecucion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tipo_ejecucion VARCHAR(50) NOT NULL, -- 'automatica' o 'manual'
    total_pagado NUMERIC NOT NULL,
    cantidad_asesores INT NOT NULL,
    archivo_txt TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. Tabla de Histórico de Comisiones (Registro unitario por pago)
CREATE TABLE IF NOT EXISTS historico_comisiones (
    id SERIAL PRIMARY KEY,
    pago_id INT REFERENCES pagos(id) ON DELETE CASCADE,
    poliza_id INT REFERENCES polizas(id) ON DELETE CASCADE,
    asesor_id INT REFERENCES asesores(id) ON DELETE SET NULL,
    monto_pago NUMERIC NOT NULL,
    total_comision_porcentaje NUMERIC NOT NULL,
    asesor_porcentaje NUMERIC NOT NULL,
    comision_bruta NUMERIC NOT NULL,
    pago_asesor NUMERIC NOT NULL,
    margen_broker NUMERIC NOT NULL,
    fecha_pago DATE NOT NULL,
    estado_corrida VARCHAR(50) NOT NULL DEFAULT 'pendiente' CHECK (estado_corrida IN ('pendiente', 'procesado')),
    corrida_id INT REFERENCES corridas_comisiones(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. Tabla de Metadatos de Tarifario
CREATE TABLE IF NOT EXISTS tarifario_metadata (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) NOT NULL,
    ultima_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario_correo VARCHAR(150) NOT NULL
);

-- 14. Tablas de E-Learning
CREATE TABLE IF NOT EXISTS elearning_cursos (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS elearning_modulos (
    id SERIAL PRIMARY KEY,
    curso_id INT REFERENCES elearning_cursos(id) ON DELETE CASCADE,
    titulo VARCHAR(255) NOT NULL,
    contenido TEXT NOT NULL,
    orden INT NOT NULL,
    quiz_preguntas JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS elearning_intentos (
    id SERIAL PRIMARY KEY,
    usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
    modulo_id INT REFERENCES elearning_modulos(id) ON DELETE CASCADE,
    puntaje INT NOT NULL,
    total_preguntas INT NOT NULL,
    aprobado BOOLEAN NOT NULL,
    respuestas_usuario JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 15. Tabla de Cotizaciones Compartidas (WhatsApp)
CREATE TABLE IF NOT EXISTS cotizaciones (
    id SERIAL PRIMARY KEY,
    token VARCHAR(100) UNIQUE NOT NULL,
    asesor_id INT REFERENCES asesores(id) ON DELETE SET NULL,
    cliente_datos JSONB NOT NULL,
    suma_asegurada NUMERIC NOT NULL,
    suma_asegurada_2 NUMERIC,
    dependientes JSONB NOT NULL DEFAULT '[]',
    comparativa JSONB NOT NULL DEFAULT '[]',
    comparativa_2 JSONB DEFAULT '[]',
    estado VARCHAR(50) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
