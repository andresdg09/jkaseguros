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
    estado VARCHAR(50) NOT NULL DEFAULT 'negociacion' CHECK (estado IN ('negociacion', 'vigente', 'vencido', 'rechazado')),
    pago_estado VARCHAR(50) NOT NULL DEFAULT 'pendiente' CHECK (pago_estado IN ('pendiente', 'pagado', 'parcial')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Tabla de Pagos
CREATE TABLE IF NOT EXISTS pagos (
    id SERIAL PRIMARY KEY,
    poliza_id INT REFERENCES polizas(id) ON DELETE CASCADE,
    monto NUMERIC NOT NULL,
    fecha_pago DATE NOT NULL DEFAULT CURRENT_DATE,
    estado_pago VARCHAR(50) NOT NULL DEFAULT 'pendiente' CHECK (estado_pago IN ('pagado', 'pendiente', 'vencido')),
    referencia VARCHAR(100),
    fecha_vencimiento DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Tabla de Tarifas (Primas por rango de edad)
CREATE TABLE IF NOT EXISTS tarifas (
    id SERIAL PRIMARY KEY,
    compania_id INT REFERENCES companias_seguros(id) ON DELETE CASCADE,
    tipo_cobertura VARCHAR(50) NOT NULL CHECK (tipo_cobertura IN ('colectivo', 'individual')),
    edad_min INT NOT NULL,
    edad_max INT NOT NULL,
    suma_asegurada NUMERIC NOT NULL,
    prima NUMERIC NOT NULL,
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
