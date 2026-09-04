import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { companiasSemilla, tarifasSemilla, asesoresSemilla, clientesSemilla } from './seedData.js';
import { SCHEMA_SQL } from './schemaSql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jkaseguros',
  // Proveedores como Neon/Render firman con una CA que Node no siempre trae confiada por defecto;
  // sin esto pg rechaza el handshake TLS y el pool nunca llega a conectar.
  // Solo aplicamos SSL si la DATABASE_URL no es de un servidor de base de datos local.
  ...(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1')
    ? { ssl: { rejectUnauthorized: false } }
    : {}),
};

let pool = null;
let isFallback = false;
let fallbackData = {
  usuarios: [],
  datos_personales: [],
  asesores: [],
  companias_seguros: [],
  polizas: [],
  pagos: [],
  tarifas: [],
  logs_actividad: [],
  elearning_courses: [],
  elearning_modules: [],
  elearning_attempts: [],
  comisiones_asesores: [],
  matriz_comisiones: [],
  corridas_comisiones: [],
  historico_comisiones: [],
  cotizaciones: [],
  perfiles_clientes_360: [],
  renovaciones_polizas: []
};

function getFallbackFilePath() {
  const possiblePaths = [
    path.join(__dirname, '../../data/fallback_db.json'),
    path.join(process.cwd(), 'data/fallback_db.json'),
    path.join(process.cwd(), 'back/data/fallback_db.json'),
    path.join(__dirname, '../data/fallback_db.json'),
    path.join(__dirname, 'data/fallback_db.json')
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (e) {}
  }
  return path.join(__dirname, '../../data/fallback_db.json');
}

// Inicializar el Fallback (JSON)
function initFallback() {
  isFallback = true;
  const filePath = getFallbackFilePath();
  console.log('\x1b[33m%s\x1b[0m', '⚠️ No se pudo conectar a PostgreSQL. Activando Fallback de Base de Datos JSON local.');
  console.log(`Guardando datos en: ${filePath}`);
  
  if (fs.existsSync(filePath)) {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      fallbackData = JSON.parse(fileContent);
      if (!fallbackData.usuarios) fallbackData.usuarios = [];
      if (!fallbackData.datos_personales) fallbackData.datos_personales = [];
      if (!fallbackData.asesores) fallbackData.asesores = [];
      if (!fallbackData.companias_seguros) fallbackData.companias_seguros = [];
      if (!fallbackData.polizas) fallbackData.polizas = [];
      if (!fallbackData.pagos) fallbackData.pagos = [];
      if (!fallbackData.tarifas) fallbackData.tarifas = [];
      if (!fallbackData.logs_actividad) fallbackData.logs_actividad = [];
      if (!fallbackData.elearning_courses) fallbackData.elearning_courses = [];
      if (!fallbackData.elearning_modules) fallbackData.elearning_modules = [];
      if (!fallbackData.elearning_attempts) fallbackData.elearning_attempts = [];
      if (!fallbackData.comisiones_asesores) fallbackData.comisiones_asesores = [];
      if (!fallbackData.matriz_comisiones) fallbackData.matriz_comisiones = [];
      if (!fallbackData.corridas_comisiones) fallbackData.corridas_comisiones = [];
      if (!fallbackData.historico_comisiones) fallbackData.historico_comisiones = [];
      if (!fallbackData.cotizaciones) fallbackData.cotizaciones = [];
      if (!fallbackData.perfiles_clientes_360) fallbackData.perfiles_clientes_360 = [];
      if (!fallbackData.renovaciones_polizas) fallbackData.renovaciones_polizas = [];
      
      // Asegurar campos de comisiones y nuevos campos
      fallbackData.companias_seguros = fallbackData.companias_seguros.map(c => ({
        ...c,
        comision_estandar: c.comision_estandar !== undefined ? parseFloat(c.comision_estandar) : 0,
        comision_compania: c.comision_compania !== undefined ? parseFloat(c.comision_compania) : 0,
        comision_asesor_estandar: c.comision_asesor_estandar !== undefined ? parseFloat(c.comision_asesor_estandar) : 0
      }));
      fallbackData.polizas = fallbackData.polizas.map(p => ({
        ...p,
        comision_porcentaje: p.comision_porcentaje !== undefined ? (p.comision_porcentaje === null ? null : parseFloat(p.comision_porcentaje)) : null,
        frecuencia_pago: p.frecuencia_pago || 'contado',
        tipo_negocio: p.tipo_negocio || 'nuevo',
        tipo_cobertura: p.tipo_cobertura || 'individual',
        bono_pronto_pago: p.bono_pronto_pago || false,
        emision_online: p.emision_online || false
      }));
      fallbackData.asesores = fallbackData.asesores.map(a => ({
        ...a,
        cedula: a.cedula || '',
        fecha_nacimiento: a.fecha_nacimiento || '',
        banco: a.banco || '',
        numero_cuenta: a.numero_cuenta || '',
        estado: a.estado || 'pendiente',
        tipo_asesor: a.tipo_asesor || 'asesor_3'
      }));
      fallbackData.pagos = fallbackData.pagos.map(pa => ({
        ...pa,
        cuota_numero: pa.cuota_numero !== undefined ? pa.cuota_numero : null,
        cuota_total: pa.cuota_total !== undefined ? pa.cuota_total : null
      }));
      fallbackData.tarifas = fallbackData.tarifas.map(t => ({
        ...t,
        deducible: t.deducible !== undefined ? parseFloat(t.deducible) : 0,
        pago_contado: t.pago_contado !== undefined ? (t.pago_contado === true || t.pago_contado === 'true' || t.pago_contado === 1) : false,
        pago_semestral: t.pago_semestral !== undefined ? (t.pago_semestral === true || t.pago_semestral === 'true' || t.pago_semestral === 1) : false,
        pago_cuatrimestral: t.pago_cuatrimestral !== undefined ? (t.pago_cuatrimestral === true || t.pago_cuatrimestral === 'true' || t.pago_cuatrimestral === 1) : false,
        pago_trimestral: t.pago_trimestral !== undefined ? (t.pago_trimestral === true || t.pago_trimestral === 'true' || t.pago_trimestral === 1) : false,
        pago_bimestral: t.pago_bimestral !== undefined ? (t.pago_bimestral === true || t.pago_bimestral === 'true' || t.pago_bimestral === 1) : false,
        pago_4_cuotas: t.pago_4_cuotas !== undefined ? (t.pago_4_cuotas === true || t.pago_4_cuotas === 'true' || t.pago_4_cuotas === 1) : false,
        pago_mensual: t.pago_mensual !== undefined ? (t.pago_mensual === true || t.pago_mensual === 'true' || t.pago_mensual === 1) : false,
        atencion_medica_primaria: t.atencion_medica_primaria !== undefined ? (t.atencion_medica_primaria === true || t.atencion_medica_primaria === 'true' || t.atencion_medica_primaria === 'INCL') : (t.at_situ_medicamentos === 'INCL' || !!t.at_situ_medicamentos),
        medicinas: t.medicinas !== undefined ? (t.medicinas === true || t.medicinas === 'true' || t.medicinas === 'INCL') : false,
        consultas_medicas: t.consultas_medicas !== undefined ? (typeof t.consultas_medicas === 'boolean' ? t.consultas_medicas : (t.consultas_medicas === 'INCL' || t.consultas_medicas === '2/AÑO' || (typeof t.consultas_medicas === 'string' && t.consultas_medicas.length > 0 && t.consultas_medicas !== 'NO' && t.consultas_medicas !== 'false'))) : false,
        rehabilitacion: t.rehabilitacion !== undefined ? (t.rehabilitacion === true || t.rehabilitacion === 'true' || t.rehabilitacion === 'INCL') : false,
        protesis: t.protesis !== undefined ? (t.protesis === true || t.protesis === 'true' || t.protesis === 'INCL') : false,
        muleta_silla_ruedas: t.muleta_silla_ruedas !== undefined ? (t.muleta_silla_ruedas === true || t.muleta_silla_ruedas === 'true' || t.muleta_silla_ruedas === 'INCL') : false,
        consultas: t.consultas !== undefined ? (t.consultas === true || t.consultas === 'true' || t.consultas === 'INCL') : false,
        maternidad: t.maternidad !== undefined ? (t.maternidad === true || t.maternidad === 'true' || t.maternidad === 'INCL') : false,
        oftalmologia: t.oftalmologia !== undefined ? (t.oftalmologia === true || t.oftalmologia === 'true' || t.oftalmologia === 'INCL') : false,
        odontologia: t.odontologia !== undefined ? (t.odontologia === true || t.odontologia === 'true' || t.odontologia === 'INCL') : false,
        muerte_accidental: t.muerte_accidental !== undefined ? (t.muerte_accidental === true || t.muerte_accidental === 'true' || t.muerte_accidental === 'INCL') : false,
        muerte_accidental_suma: t.muerte_accidental_suma || '',
        muerte_accidental_costo: t.muerte_accidental_costo || '',
        invalidez_permanente: t.invalidez_permanente !== undefined ? (t.invalidez_permanente === true || t.invalidez_permanente === 'true' || t.invalidez_permanente === 'INCL') : false,
        invalidez_permanente_suma: t.invalidez_permanente_suma || '',
        invalidez_permanente_costo: t.invalidez_permanente_costo || '',
        examenes_lab_imagenologia: t.examenes_lab_imagenologia || '',
        ambulancia: t.ambulancia || '',
        maternidad_suma: t.maternidad_suma || '',
        maternidad_costo: t.maternidad_costo || '',
        asist_intl_suma: t.asist_intl_suma || '',
        asist_intl_costo: t.asist_intl_costo || '',
        funeral_suma: t.funeral_suma || '',
        funeral_costo: t.funeral_costo || '',
        ramo: t.ramo || 'Salud'
      }));

      seedFallbackElearning();

      if (!fallbackData.companias_seguros || fallbackData.companias_seguros.length === 0) {
        fallbackData.companias_seguros = [
          { id: 1, nombre: "Mercantil Seguros", comision_compania: 20.0, comision_asesor_estandar: 10.0, comision_estandar: 20.0 },
          { id: 2, nombre: "Seguros Caracas", comision_compania: 22.5, comision_asesor_estandar: 12.0, comision_estandar: 22.5 },
          { id: 3, nombre: "Seguros Venezuela", comision_compania: 22.0, comision_asesor_estandar: 11.0, comision_estandar: 22.0 },
          { id: 4, nombre: "Mapfre Seguros", comision_compania: 40.0, comision_asesor_estandar: 25.0, comision_estandar: 40.0 },
          { id: 5, nombre: "Internacional de Seguros", comision_compania: 25.0, comision_asesor_estandar: 12.0, comision_estandar: 25.0 }
        ];
      }

      if (!fallbackData.polizas) fallbackData.polizas = [];
      if (!fallbackData.pagos) fallbackData.pagos = [];

      if (!fallbackData.tarifas || fallbackData.tarifas.length === 0) {
        fallbackData.tarifas = tarifasSemilla.map((t, index) => {
          const comp = fallbackData.companias_seguros.find(c => c.nombre.toLowerCase().trim() === t.compania.toLowerCase().trim()) || fallbackData.companias_seguros[0];
          const s = (t.pago || '').toUpperCase();
          return {
            id: index + 1,
            compania_id: comp.id,
            plan: t.plan,
            pago: t.pago,
            edad_min: t.edad_min,
            edad_max: t.edad_max,
            suma_asegurada: t.suma_asegurada,
            deducible: parseFloat(t.deducible || 0),
            prima: t.prima,
            maternidad_suma: t.maternidad_suma || '',
            maternidad_costo: t.maternidad_costo || '',
            asist_intl_suma: t.asist_intl_suma || '',
            asist_intl_costo: t.asist_intl_costo || '',
            funeral_suma: t.funeral_suma || '',
            funeral_costo: t.funeral_costo || '',
            at_situ_medicamentos: t.at_situ_medicamentos || '',
            atencion_medica_primaria: t.atencion_medica_primaria !== undefined ? !!t.atencion_medica_primaria : (t.at_situ_medicamentos === 'INCL' || !!t.at_situ_medicamentos),
            medicinas: t.medicinas !== undefined ? !!t.medicinas : false,
            consultas_medicas: t.consultas_medicas !== undefined ? (typeof t.consultas_medicas === 'boolean' ? t.consultas_medicas : (t.consultas_medicas === 'INCL' || t.consultas_medicas === '2/AÑO' || (typeof t.consultas_medicas === 'string' && t.consultas_medicas.length > 0 && t.consultas_medicas !== 'NO' && t.consultas_medicas !== 'false'))) : false,
            rehabilitacion: t.rehabilitacion !== undefined ? !!t.rehabilitacion : false,
            protesis: t.protesis !== undefined ? !!t.protesis : false,
            muleta_silla_ruedas: t.muleta_silla_ruedas !== undefined ? !!t.muleta_silla_ruedas : false,
            consultas: t.consultas !== undefined ? !!t.consultas : false,
            maternidad: t.maternidad !== undefined ? !!t.maternidad : false,
            oftalmologia: t.oftalmologia !== undefined ? !!t.oftalmologia : false,
            odontologia: t.odontologia !== undefined ? !!t.odontologia : false,
            muerte_accidental: t.muerte_accidental !== undefined ? !!t.muerte_accidental : false,
            muerte_accidental_suma: t.muerte_accidental_suma || '',
            muerte_accidental_costo: t.muerte_accidental_costo || '',
            invalidez_permanente: t.invalidez_permanente !== undefined ? !!t.invalidez_permanente : false,
            invalidez_permanente_suma: t.invalidez_permanente_suma || '',
            invalidez_permanente_costo: t.invalidez_permanente_costo || '',
            examenes_lab_imagenologia: t.examenes_lab_imagenologia || '',
            ambulancia: t.ambulancia || '',
            pago_contado: s.includes('CONT') || s.includes('ANUAL') || s.includes('CONTADO'),
            pago_semestral: s.includes('SEM') || s.includes('SEMESTRAL'),
            pago_cuatrimestral: s.includes('CUATRI') || s.includes('CUATRIMESTRAL'),
            pago_trimestral: s.includes('TRIM') || s.includes('TRIMESTRAL'),
            pago_bimestral: s.includes('BIM') || s.includes('BIMESTRAL'),
            pago_4_cuotas: s.includes('4 CUOTA') || s.includes('4CUOTA') || s.includes('4_CUOTA') || s.includes('CUATRO CUOTA'),
            pago_mensual: s.includes('MENS') || s.includes('MEN') || s.includes('MENSUAL'),
            ramo: t.ramo || 'Salud',
            created_at: new Date().toISOString()
          };
        });
      }

      if (!fallbackData.matriz_comisiones || fallbackData.matriz_comisiones.length === 0 || fallbackData.matriz_comisiones.some(m => m.asesor_1 === 0 && m.total_comision > 0)) {
        fallbackData.matriz_comisiones = [
          {
            id: 1,
            mercado: 'Nacionales',
            compania_id: 1, // Mercantil Seguros
            ramo: 'Salud',
            producto_modalidad: 'ACCESS (Salud Cobertura Nacional)',
            total_comision: 20.0,
            asesor_1: 15.0,
            asesor_2: 12.0,
            asesor_3: 10.0,
            consultor_1: 15.0,
            consultor_2: 12.0,
            johans: 15.0,
            nivel_1_subagente: 10.0,
            nivel_2_agente: 8.0,
            created_at: new Date().toISOString()
          },
          {
            id: 2,
            mercado: 'Nacionales',
            compania_id: 2, // Seguros Caracas
            ramo: 'Salud',
            producto_modalidad: 'SALUD EXTERIOR (Salud Integral)',
            total_comision: 22.5,
            asesor_1: 17.0,
            asesor_2: 15.0,
            asesor_3: 12.0,
            consultor_1: 17.0,
            consultor_2: 15.0,
            johans: 17.0,
            nivel_1_subagente: 12.0,
            nivel_2_agente: 10.0,
            created_at: new Date().toISOString()
          },
          {
            id: 3,
            mercado: 'Nacionales',
            compania_id: 2, // Seguros Caracas
            ramo: 'Salud',
            producto_modalidad: 'SALUD INDIVIDUAL (Salud Integral)',
            total_comision: 22.5,
            asesor_1: 17.0,
            asesor_2: 15.0,
            asesor_3: 12.0,
            consultor_1: 17.0,
            consultor_2: 15.0,
            johans: 17.0,
            nivel_1_subagente: 12.0,
            nivel_2_agente: 10.0,
            created_at: new Date().toISOString()
          },
          {
            id: 4,
            mercado: 'Nacionales',
            compania_id: 3, // Seguros Venezuela
            ramo: 'Salud',
            producto_modalidad: 'BRONCE / PLATA / ORO (Salud Individual)',
            total_comision: 22.0,
            asesor_1: 16.0,
            asesor_2: 14.0,
            asesor_3: 11.0,
            consultor_1: 16.0,
            consultor_2: 14.0,
            johans: 16.0,
            nivel_1_subagente: 11.0,
            nivel_2_agente: 9.0,
            created_at: new Date().toISOString()
          },
          {
            id: 5,
            mercado: 'Nacionales',
            compania_id: 4, // Mapfre Seguros
            ramo: 'Patrimoniales',
            producto_modalidad: 'Incendio y Riesgos Patrimoniales',
            total_comision: 40.0,
            asesor_1: 30.0,
            asesor_2: 28.0,
            asesor_3: 25.0,
            consultor_1: 30.0,
            consultor_2: 28.0,
            johans: 30.0,
            nivel_1_subagente: 25.0,
            nivel_2_agente: 20.0,
            created_at: new Date().toISOString()
          },
          {
            id: 6,
            mercado: 'Internacionales',
            compania_id: 5, // Internacional de Seguros
            ramo: 'Viajes',
            producto_modalidad: 'Cobertura Internacional / Asistencia en Viajes',
            total_comision: 25.0,
            asesor_1: 18.0,
            asesor_2: 15.0,
            asesor_3: 12.0,
            consultor_1: 18.0,
            consultor_2: 15.0,
            johans: 18.0,
            nivel_1_subagente: 12.0,
            nivel_2_agente: 10.0,
            created_at: new Date().toISOString()
          }
        ];
      }

      saveFallback();

      if (!fallbackData.tarifario_metadata) {
        fallbackData.tarifario_metadata = {
          version: '1.0.0',
          ultima_modificacion: new Date().toISOString(),
          usuario_correo: 'admin@jkaseguros.com'
        };
      }
      console.log('✅ Base de datos JSON cargada exitosamente.');
    } catch (e) {
      console.error('Error cargando fallback_db.json, re-creando base de datos.', e);
      seedFallback();
    }
  } else {
    seedFallback();
  }
}

// Sembrar e-learning en Fallback
function seedFallbackElearning() {
  if (!fallbackData.elearning_courses || fallbackData.elearning_courses.length === 0) {
    fallbackData.elearning_courses = [
      {
        id: 1,
        titulo: 'Curso básico de negociación',
        descripcion: 'Aprende los fundamentos y estrategias para cerrar acuerdos exitosos.',
        created_at: new Date().toISOString()
      },
      {
        id: 2,
        titulo: 'Curso de seguros',
        descripcion: 'Conceptos fundamentales de pólizas de salud, vida y automotores.',
        created_at: new Date().toISOString()
      },
      {
        id: 3,
        titulo: 'Curso de cómo se usa el sistema',
        descripcion: 'Guía rápida para cotizar y gestionar solicitudes en la plataforma Protección y Seguros 360.',
        created_at: new Date().toISOString()
      }
    ];

    fallbackData.elearning_modules = [
      {
        id: 1,
        curso_id: 1,
        titulo: 'Introducción a la Negociación',
        contenido: 'La negociación es un proceso mediante el cual dos o más partes con intereses comunes o en conflicto buscan un acuerdo. Existen dos tipos principales:\n\n1. **Negociación Distributiva**: Del tipo ganar-perder, donde los recursos son fijos.\n2. **Negociación Integrativa**: Del tipo ganar-ganar, donde se busca ampliar los beneficios para ambas partes.\n\nEs clave conocer el MAAN (Mejor Alternativa a un Acuerdo Negociado), que define tu plan de escape si la negociación fracasa.',
        orden: 1,
        quiz_preguntas: [
          { pregunta: '¿Qué caracteriza a una negociación distributiva?', opciones: ['Es del tipo ganar-perder', 'Es del tipo ganar-ganar'], correcta: 0 },
          { pregunta: '¿Qué es el MAAN (Mejor Alternativa a un Acuerdo Negociado)?', opciones: ['La opción que tienes si la negociación fracasa', 'Tu oferta inicial en la mesa'], correcta: 0 }
        ],
        created_at: new Date().toISOString()
      },
      {
        id: 2,
        curso_id: 1,
        titulo: 'Estrategias de Cierre y Objeciones',
        contenido: 'El cierre es el momento culmen. Ante objeciones comunes como el precio:\n\n- No rebajes la prima de inmediato, destruye la percepción de valor.\n- Concéntrate en la cobertura de salud completa y el respaldo de la aseguradora.\n- Usa la técnica del "Sentir-Encontrar-Demostrar" para empatizar con el cliente antes de rebatir.',
        orden: 2,
        quiz_preguntas: [
          { pregunta: 'Ante una objeción de precio del cliente, ¿cuál es la mejor estrategia?', opciones: ['Bajar el precio o prima de inmediato sin justificación', 'Resaltar el valor del seguro, las coberturas y el respaldo de la aseguradora'], correcta: 1 }
        ],
        created_at: new Date().toISOString()
      },
      {
        id: 3,
        curso_id: 2,
        titulo: 'Conceptos Fundamentales de Seguros',
        contenido: 'Para asesorar bien, debes dominar estos términos:\n\n- **Prima**: El pago que hace el cliente para mantener activa la cobertura.\n- **Suma Asegurada**: El límite máximo que la aseguradora pagará por un siniestro.\n- **Deducible**: El monto fijo que corre por cuenta del asegurado antes de que la aseguradora empiece a pagar.\n- **Siniestro**: El evento cubierto (enfermedad, accidente, etc.) que activa la póliza.',
        orden: 1,
        quiz_preguntas: [
          { pregunta: '¿Qué es la prima en una póliza de seguro?', opciones: ['El costo que paga el cliente para mantener la póliza activa', 'El deducible que paga el cliente en la clínica'], correcta: 0 },
          { pregunta: 'Si una póliza tiene un deducible de $500 y el siniestro es de $2000, ¿cuánto cubre la aseguradora?', opciones: ['Cubre los $2000 completos', 'Cubre $1500 (restando el deducible)'], correcta: 1 }
        ],
        created_at: new Date().toISOString()
      },
      {
        id: 4,
        curso_id: 2,
        titulo: 'Ramos de Seguros en Venezuela',
        contenido: 'Manejamos principalmente:\n\n1. **Salud / HCM**: Hospitalización, Cirugía y Maternidad.\n2. **Vida**: Cobertura por fallecimiento e invalidez.\n3. **Vehículos**: Daños propios y responsabilidad civil.\n\nEn Protección y Seguros 360 nos especializamos fuertemente en Salud Individual y Colectiva con las mejores aseguradoras del país (Mercantil, Seguros Caracas, Seguros Venezuela, Mapfre).',
        orden: 2,
        quiz_preguntas: [
          { pregunta: '¿Qué cubre primordialmente una póliza HCM?', opciones: ['Gastos médicos por Hospitalización, Cirugía y Maternidad', 'Daños materiales del vehículo del asegurado'], correcta: 0 }
        ],
        created_at: new Date().toISOString()
      },
      {
        id: 5,
        curso_id: 3,
        titulo: 'Cotización y Creación de Pólizas',
        contenido: 'El flujo principal es:\n\n1. El cliente ingresa y cotiza en base a su edad y suma asegurada.\n2. Para cotizar con éxito, el cliente DEBE completar primero sus datos personales en su Perfil.\n3. La solicitud se crea inicialmente en estado **Negociación**.\n4. El asesor o administrador revisen y puede pasarla a **Vigente** cuando se formaliza.',
        orden: 1,
        quiz_preguntas: [
          { pregunta: '¿Cuál es el estado inicial de una póliza cuando la solicita un cliente?', opciones: ['Vigente', 'Negociación'], correcta: 1 },
          { pregunta: '¿Qué sección del sistema es obligatoria rellenar antes de cotizar?', opciones: ['La pestaña de Perfil (Datos Personales)', 'La pestaña de Pagos'], correcta: 0 }
        ],
        created_at: new Date().toISOString()
      },
      {
        id: 6,
        curso_id: 3,
        titulo: 'Reporte y Conciliación de Pagos',
        contenido: 'Una vez creada la póliza:\n\n- Se genera una cuota de pago pendiente.\n- El cliente reporta su transferencia bancaria ingresando el Número de Referencia.\n- El asesor o admin valida y marca el pago como "pagado" para que la póliza pase a estar activa y solvente.',
        orden: 2,
        quiz_preguntas: [
          { pregunta: '¿Qué campo debe ingresar obligatoriamente el asegurado para notificar un pago?', opciones: ['La referencia bancaria', 'El nombre de su asesor de confianza'], correcta: 0 }
        ],
        created_at: new Date().toISOString()
      }
    ];
    saveFallback();
  }
}

// Sembrar el Fallback
function seedFallback() {
  console.log('🌱 Sembrando base de datos JSON local (Fallback)...');
  seedFallbackElearning();
  
  // Agregar Compañías
  fallbackData.companias_seguros = companiasSemilla.map((c, i) => ({
    id: i + 1,
    ...c,
    created_at: new Date().toISOString()
  }));

  // Agregar Tarifas
  fallbackData.tarifas = tarifasSemilla.map((t, i) => {
    const comp = fallbackData.companias_seguros.find(c => c.nombre === t.compania);
    const { compania, ...rest } = t;
    const s = String(t.pago || '').toUpperCase();
    return {
      id: i + 1,
      compania_id: comp ? comp.id : null,
      ...rest,
      ramo: t.ramo || 'Salud',
      pago_contado: s.includes('CONT') || s.includes('ANUAL') || s.includes('CONTADO'),
      pago_semestral: s.includes('SEM') || s.includes('SEMESTRAL'),
      pago_cuatrimestral: s.includes('CUATRI') || s.includes('CUATRIMESTRAL'),
      pago_trimestral: s.includes('TRIM') || s.includes('TRIMESTRAL'),
      pago_bimestral: s.includes('BIM') || s.includes('BIMESTRAL'),
      pago_4_cuotas: s.includes('4 CUOTA') || s.includes('4CUOTA') || s.includes('4_CUOTA') || s.includes('CUATRO CUOTA'),
      pago_mensual: s.includes('MENS') || s.includes('MEN') || s.includes('MENSUAL'),
      atencion_medica_primaria: t.atencion_medica_primaria !== undefined ? !!t.atencion_medica_primaria : (t.at_situ_medicamentos === 'INCL' || !!t.at_situ_medicamentos),
      medicinas: t.medicinas !== undefined ? !!t.medicinas : false,
      consultas_medicas: t.consultas_medicas !== undefined ? (typeof t.consultas_medicas === 'boolean' ? t.consultas_medicas : (t.consultas_medicas === 'INCL' || t.consultas_medicas === '2/AÑO' || (typeof t.consultas_medicas === 'string' && t.consultas_medicas.length > 0 && t.consultas_medicas !== 'NO' && t.consultas_medicas !== 'false'))) : false,
      rehabilitacion: t.rehabilitacion !== undefined ? !!t.rehabilitacion : false,
      protesis: t.protesis !== undefined ? !!t.protesis : false,
      muleta_silla_ruedas: t.muleta_silla_ruedas !== undefined ? !!t.muleta_silla_ruedas : false,
      consultas: t.consultas !== undefined ? !!t.consultas : false,
      maternidad: t.maternidad !== undefined ? !!t.maternidad : false,
      maternidad_suma: t.maternidad_suma || '',
      maternidad_costo: t.maternidad_costo || '',
      asist_intl_suma: t.asist_intl_suma || '',
      asist_intl_costo: t.asist_intl_costo || '',
      funeral_suma: t.funeral_suma || '',
      funeral_costo: t.funeral_costo || '',
      oftalmologia: t.oftalmologia !== undefined ? !!t.oftalmologia : false,
      odontologia: t.odontologia !== undefined ? !!t.odontologia : false,
      muerte_accidental: t.muerte_accidental !== undefined ? !!t.muerte_accidental : false,
      muerte_accidental_suma: t.muerte_accidental_suma || '',
      muerte_accidental_costo: t.muerte_accidental_costo || '',
      invalidez_permanente: t.invalidez_permanente !== undefined ? !!t.invalidez_permanente : false,
      invalidez_permanente_suma: t.invalidez_permanente_suma || '',
      invalidez_permanente_costo: t.invalidez_permanente_costo || '',
      examenes_lab_imagenologia: t.examenes_lab_imagenologia || '',
      ambulancia: t.ambulancia || '',
      created_at: new Date().toISOString()
    };
  });

  // Agregar un Administrador por defecto
  fallbackData.usuarios.push({
    id: 1,
    correo: 'admin@jkaseguros.com',
    contrasena: '$2a$10$hrdf4Eh7uxFnHGGVAJCLYu4pYpbO7QpextBYsF7u8nyZ7J3w.x45e', // admin123 hashed
    rango: 'admin',
    created_at: new Date().toISOString()
  });

  // Agregar Asesores Semilla
  asesoresSemilla.forEach((a, index) => {
    const uId = index + 2; // admin es 1, los asesores empiezan en 2
    fallbackData.usuarios.push({
      id: uId,
      correo: a.correo,
      contrasena: '$2a$10$JnHfHQevjvqfkZj0uJ9sIe1n1e86mib5e3HA2k7QLKFXbChH0OQcG', // 123456789
      rango: 'asesor',
      created_at: new Date().toISOString()
    });
    
    fallbackData.asesores.push({
      id: index + 1,
      usuario_id: uId,
      nombre: a.nombre,
      codigo_asesor: a.codigo,
      correo: a.correo,
      telefono: a.telefono,
      cedula: a.cedula || 'V12345678',
      fecha_nacimiento: a.fecha_nacimiento || '1990-01-01',
      banco: a.banco || 'Banco Mercantil',
      numero_cuenta: a.numero_cuenta || '01050100201000123456',
      tipo_asesor: 'asesor_3',
      estado: 'aprobado',
      created_at: new Date().toISOString()
    });
  });

  // Agregar Clientes Semilla
  clientesSemilla.forEach((c, index) => {
    const uId = index + 3; // admin es 1, asesor es 2. Clientes empiezan en 3
    fallbackData.usuarios.push({
      id: uId,
      correo: c.correo,
      contrasena: '$2a$10$hrdf4Eh7uxFnHGGVAJCLYu4pYpbO7QpextBYsF7u8nyZ7J3w.x45e', // admin123
      rango: 'cliente',
      created_at: new Date().toISOString()
    });

    fallbackData.datos_personales.push({
      id: index + 1,
      usuario_id: uId,
      primer_nombre: c.primer_nombre,
      segundo_nombre: c.segundo_nombre,
      primer_apellido: c.primer_apellido,
      segundo_apellido: c.segundo_apellido,
      fecha_nacimiento: c.fecha_nacimiento,
      tipo_documento: c.tipo_documento,
      nro_documento: c.nro_documento,
      genero: c.genero,
      estado_civil: c.estado_civil,
      codigo_area: c.codigo_area,
      numero_celular: c.numero_celular,
      created_at: new Date().toISOString()
    });
  });

  // Agregar Pólizas Semilla
  fallbackData.polizas.push({
    id: 1,
    codigo_poliza: 'POL-882731',
    cliente_id: 1,
    asesor_id: 1,
    compania_id: 1, // Mercantil Seguros
    plan: 'ACCESS',
    area: 'Salud',
    suma_asegurada: 50000,
    deducible: 0,
    prima_anual: 612,
    estado: 'vigente',
    pago_estado: 'en_revision',
    frecuencia_pago: 'mensual',
    tipo_negocio: 'nuevo',
    tipo_cobertura: 'individual',
    bono_pronto_pago: false,
    emision_online: false,
    created_at: new Date().toISOString()
  });

  const samplePagos = [
    { id: 1, poliza_id: 1, monto: 51, monto_reportado: 51000, moneda_pago: 'VES', fecha_pago: '2026-08-25', estado_pago: 'pagado', referencia: '789456', fecha_vencimiento: '2026-09-25', cuota_numero: 1, cuota_total: 12, observaciones: 'Pago reportado en Bs. 51.000', created_at: new Date().toISOString() },
    { id: 2, poliza_id: 1, monto: 51, monto_reportado: 51000, moneda_pago: 'VES', fecha_pago: '2026-08-25', estado_pago: 'en_revision', referencia: '457892', fecha_vencimiento: '2026-10-25', cuota_numero: 2, cuota_total: 12, observaciones: 'Pago reportado en Bs. 51.000', created_at: new Date().toISOString() },
    { id: 3, poliza_id: 1, monto: 51, monto_reportado: 51000, moneda_pago: 'VES', fecha_pago: '2026-08-25', estado_pago: 'en_revision', referencia: '123456', fecha_vencimiento: '2026-11-25', cuota_numero: 3, cuota_total: 12, observaciones: 'Pago reportado en Bs. 51.000', created_at: new Date().toISOString() },
    { id: 4, poliza_id: 1, monto: 51, monto_reportado: null, moneda_pago: 'USD', fecha_pago: null, estado_pago: 'pendiente', referencia: null, fecha_vencimiento: '2026-12-25', cuota_numero: 4, cuota_total: 12, created_at: new Date().toISOString() },
    { id: 5, poliza_id: 1, monto: 51, monto_reportado: null, moneda_pago: 'USD', fecha_pago: null, estado_pago: 'pendiente', referencia: null, fecha_vencimiento: '2027-01-25', cuota_numero: 5, cuota_total: 12, created_at: new Date().toISOString() },
    { id: 6, poliza_id: 1, monto: 51, monto_reportado: null, moneda_pago: 'USD', fecha_pago: null, estado_pago: 'pendiente', referencia: null, fecha_vencimiento: '2027-02-25', cuota_numero: 6, cuota_total: 12, created_at: new Date().toISOString() },
    { id: 7, poliza_id: 1, monto: 51, monto_reportado: null, moneda_pago: 'USD', fecha_pago: null, estado_pago: 'pendiente', referencia: null, fecha_vencimiento: '2027-03-25', cuota_numero: 7, cuota_total: 12, created_at: new Date().toISOString() },
    { id: 8, poliza_id: 1, monto: 51, monto_reportado: null, moneda_pago: 'USD', fecha_pago: null, estado_pago: 'pendiente', referencia: null, fecha_vencimiento: '2027-04-25', cuota_numero: 8, cuota_total: 12, created_at: new Date().toISOString() },
    { id: 9, poliza_id: 1, monto: 51, monto_reportado: null, moneda_pago: 'USD', fecha_pago: null, estado_pago: 'pendiente', referencia: null, fecha_vencimiento: '2027-05-25', cuota_numero: 9, cuota_total: 12, created_at: new Date().toISOString() },
    { id: 10, poliza_id: 1, monto: 51, monto_reportado: null, moneda_pago: 'USD', fecha_pago: null, estado_pago: 'pendiente', referencia: null, fecha_vencimiento: '2027-06-25', cuota_numero: 10, cuota_total: 12, created_at: new Date().toISOString() },
    { id: 11, poliza_id: 1, monto: 51, monto_reportado: null, moneda_pago: 'USD', fecha_pago: null, estado_pago: 'pendiente', referencia: null, fecha_vencimiento: '2027-07-25', cuota_numero: 11, cuota_total: 12, created_at: new Date().toISOString() },
    { id: 12, poliza_id: 1, monto: 51, monto_reportado: null, moneda_pago: 'USD', fecha_pago: null, estado_pago: 'pendiente', referencia: null, fecha_vencimiento: '2027-08-25', cuota_numero: 12, cuota_total: 12, created_at: new Date().toISOString() }
  ];
  fallbackData.pagos.push(...samplePagos);

  // Agregar Logs Semilla
  fallbackData.logs_actividad.push({
    id: 1,
    usuario_id: 1,
    correo_usuario: 'admin@jkaseguros.com',
    accion: 'REGISTRO',
    descripcion: 'Administrador inicial del sistema configurado.',
    created_at: new Date().toISOString()
  });
  fallbackData.logs_actividad.push({
    id: 2,
    usuario_id: 2,
    correo_usuario: 'info@jkaconsultores.com',
    accion: 'REGISTRO',
    descripcion: 'Asesor Johann Joubert registrado con código ASE-001.',
    created_at: new Date().toISOString()
  });
  fallbackData.logs_actividad.push({
    id: 3,
    usuario_id: 3,
    correo_usuario: 'fanianosj@gmail.com',
    accion: 'REGISTRO',
    descripcion: 'Asegurado Jorge Fanianos registrado en el sistema.',
    created_at: new Date().toISOString()
  });
  fallbackData.logs_actividad.push({
    id: 4,
    usuario_id: 3,
    correo_usuario: 'fanianosj@gmail.com',
    accion: 'CREACION_POLIZA',
    descripcion: 'Póliza POL-882731 emitida y aprobada para Jorge Fanianos.',
    created_at: new Date().toISOString()
  });
  fallbackData.logs_actividad.push({
    id: 5,
    usuario_id: 3,
    correo_usuario: 'fanianosj@gmail.com',
    accion: 'PAGO_REPORTADO',
    descripcion: 'Jorge Fanianos reportó pago de cuota $740. Ref: REF-99887766.',
    created_at: new Date().toISOString()
  });

  // Sembrar Matriz de Comisiones en Fallback
  const scComp = fallbackData.companias_seguros.find(c => c.nombre === 'Seguros Caracas') || { id: 2 };
  const mfComp = fallbackData.companias_seguros.find(c => c.nombre === 'Mapfre Seguros') || { id: 4 };
  const msComp = fallbackData.companias_seguros.find(c => c.nombre === 'Mercantil Seguros') || { id: 1 };
  const svComp = fallbackData.companias_seguros.find(c => c.nombre === 'Seguros Venezuela') || { id: 3 };
  const isComp = fallbackData.companias_seguros.find(c => c.nombre === 'Internacional de Seguros') || { id: 5 };

  fallbackData.matriz_comisiones = [
    {
      id: 1,
      mercado: 'Nacionales',
      compania_id: msComp.id,
      ramo: 'Salud',
      producto_modalidad: 'ACCESS - PLATINO - EMERGENCIAS (Salud Cobertura Nacional)',
      total_comision: 20.0,
      asesor_1: 15.0,
      asesor_2: 12.0,
      asesor_3: 10.0,
      consultor_1: 15.0,
      consultor_2: 12.0,
      johans: 15.0,
      nivel_1_subagente: 10.0,
      nivel_2_agente: 8.0,
      created_at: new Date().toISOString()
    },
    {
      id: 2,
      mercado: 'Nacionales',
      compania_id: scComp.id,
      ramo: 'Salud',
      producto_modalidad: 'SALUD EXTERIOR - SALUD INDIVIDUAL (Salud Integral)',
      total_comision: 22.5,
      asesor_1: 17.0,
      asesor_2: 15.0,
      asesor_3: 12.0,
      consultor_1: 17.0,
      consultor_2: 15.0,
      johans: 17.0,
      nivel_1_subagente: 12.0,
      nivel_2_agente: 10.0,
      created_at: new Date().toISOString()
    },
    {
      id: 3,
      mercado: 'Nacionales',
      compania_id: svComp.id,
      ramo: 'Salud',
      producto_modalidad: 'BRONCE - PLATA - ORO (Salud Individual)',
      total_comision: 22.0,
      asesor_1: 16.0,
      asesor_2: 14.0,
      asesor_3: 11.0,
      consultor_1: 16.0,
      consultor_2: 14.0,
      johans: 16.0,
      nivel_1_subagente: 11.0,
      nivel_2_agente: 9.0,
      created_at: new Date().toISOString()
    },
    {
      id: 4,
      mercado: 'Nacionales',
      compania_id: mfComp.id,
      ramo: 'Patrimoniales',
      producto_modalidad: 'Incendio - Todo Riesgo Comercial / Residencial',
      total_comision: 40.0,
      asesor_1: 30.0,
      asesor_2: 28.0,
      asesor_3: 25.0,
      consultor_1: 30.0,
      consultor_2: 28.0,
      johans: 30.0,
      nivel_1_subagente: 25.0,
      nivel_2_agente: 20.0,
      created_at: new Date().toISOString()
    },
    {
      id: 5,
      mercado: 'Internacionales',
      compania_id: isComp.id,
      ramo: 'Salud',
      producto_modalidad: 'Cobertura Internacional - Asistencia en Viajes',
      total_comision: 25.0,
      asesor_1: 18.0,
      asesor_2: 15.0,
      asesor_3: 12.0,
      consultor_1: 18.0,
      consultor_2: 15.0,
      johans: 18.0,
      nivel_1_subagente: 12.0,
      nivel_2_agente: 10.0,
      created_at: new Date().toISOString()
    }
  ];

  fallbackData.corridas_comisiones = [];
  fallbackData.historico_comisiones = [];

  fallbackData.tarifario_metadata = {
    version: '1.0.0',
    ultima_modificacion: new Date().toISOString(),
    usuario_correo: 'admin@jkaseguros.com'
  };

  saveFallback();
  console.log('✅ Base de datos JSON sembrada exitosamente con tarifas, compañías, asesores, clientes, pólizas y pagos.');
}

function saveFallback() {
  try {
    const filePath = getFallbackFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(fallbackData, null, 2), 'utf8');
  } catch (err) {
    // Ignorar en sistemas read-only de Vercel Serverless
  }
}

// Helper para ejecutar migraciones de forma segura e idempotente sin fallar por duplicados
async function safeQuery(client, sql, params = []) {
  try {
    return await client.query(sql, params);
  } catch (err) {
    // 42710: duplicate_object / constraint already exists
    // 42701: duplicate_column / column already exists
    // 42P07: duplicate_table / table already exists
    if (['42710', '42701', '42P07'].includes(err.code) || (err.message && err.message.includes('already exists'))) {
      return null;
    }
    console.warn(`⚠️ Aviso en migración [${sql.slice(0, 45).trim()}...]:`, err.message);
    return null;
  }
}

// Conexión a PostgreSQL, expuesta como función explícita (en vez de código top-level)
// para que index.js pueda hacer `await initDb()` y garantizar que el esquema base y
// las migraciones terminen ANTES de levantar rutas, el cron de recordatorios o
// cualquier otra consulta sobre asesores/usuarios/polizas.
export async function initDb() {
try {
  pool = new pg.Pool(dbConfig);
  // Probar la conexión
  const client = await pool.connect();
  console.log('✅ Conexión establecida con PostgreSQL.');

  // Verificar si las tablas base ya existen (ej. restauradas con backup o dump previo)
  let tablesExist = false;
  try {
    const checkTable = await client.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'usuarios' LIMIT 1;");
    tablesExist = (checkTable.rows && checkTable.rows.length > 0);
  } catch (e) {
    tablesExist = false;
  }

  if (!tablesExist) {
    try {
      let schemaSql = SCHEMA_SQL;
      const schemaPath = path.join(__dirname, 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        schemaSql = fs.readFileSync(schemaPath, 'utf8');
      }
      await client.query(schemaSql);
      console.log('📋 Esquema base verificado/creado exitosamente.');
    } catch (schemaErr) {
      console.warn('⚠️ Nota al aplicar esquema base:', schemaErr.message);
    }
  } else {
    console.log('📋 Tablas existentes detectadas (base de datos restaurada).');
  }

  await safeQuery(client, 'ALTER TABLE datos_personales ADD COLUMN IF NOT EXISTS asesor_id INT REFERENCES asesores(id) ON DELETE SET NULL;');
  await safeQuery(client, 'ALTER TABLE datos_personales ADD COLUMN IF NOT EXISTS numero_hijos INT DEFAULT 0;');
  await safeQuery(client, 'ALTER TABLE datos_personales ADD COLUMN IF NOT EXISTS cliente_desde DATE;');
  await safeQuery(client, 'ALTER TABLE polizas ADD COLUMN IF NOT EXISTS fecha_renovacion DATE;');
  await safeQuery(client, `
    CREATE TABLE IF NOT EXISTS renovaciones_polizas (
      id SERIAL PRIMARY KEY,
      poliza_id INT REFERENCES polizas(id) ON DELETE CASCADE,
      cliente_id INT REFERENCES datos_personales(id) ON DELETE CASCADE,
      asesor_id INT REFERENCES asesores(id) ON DELETE SET NULL,
      fecha_renovacion DATE NOT NULL,
      frecuencia_anterior VARCHAR(50),
      frecuencia_nueva VARCHAR(50) NOT NULL,
      prima_anual NUMERIC NOT NULL,
      suma_asegurada NUMERIC,
      observaciones TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migración de la Matriz de Tarifas: nueva estructura por plan/edad/suma asegurada con beneficios
  await safeQuery(client, 'ALTER TABLE tarifas DROP CONSTRAINT IF EXISTS tarifas_tipo_cobertura_check;');
  await safeQuery(client, 'ALTER TABLE tarifas DROP COLUMN IF EXISTS tipo_cobertura;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS plan VARCHAR(100);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS deducible NUMERIC DEFAULT 0;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS pago VARCHAR(100);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS maternidad_suma VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS maternidad_costo VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS asist_intl_suma VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS asist_intl_costo VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS funeral_suma VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS funeral_costo VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS at_situ_medicamentos VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS consultas_medicas VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS examenes_lab_imagenologia VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS ambulancia VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS pago_contado BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS pago_semestral BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS pago_cuatrimestral BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS pago_trimestral BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS pago_bimestral BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS pago_4_cuotas BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS pago_mensual BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS atencion_medica_primaria BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS medicinas BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS rehabilitacion BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS protesis BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS muleta_silla_ruedas BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS consultas BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS maternidad BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS oftalmologia BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS odontologia BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS muerte_accidental BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS muerte_accidental_suma VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS muerte_accidental_costo VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS invalidez_permanente BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS invalidez_permanente_suma VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS invalidez_permanente_costo VARCHAR(50);');
  await safeQuery(client, "ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS ramo VARCHAR(100) DEFAULT 'Salud';");
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS reembolso_carta_aval BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS examenes_especiales BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS asist_intl BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS oftalmologia_suma VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS oftalmologia_costo VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS odontologia_suma VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS odontologia_costo VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS consultas_suma VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS consultas_costo VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS asist_medica_primaria_suma VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS asist_medica_primaria_costo VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS odonto_oftal_suma VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS odonto_oftal_costo VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS fisio_psico_suma VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS fisio_psico_costo VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS dermato_nutricion_suma VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS dermato_nutricion_costo VARCHAR(50);');

  // Pólizas: la modalidad colectivo/individual se reemplaza por el nombre de plan contratado
  await safeQuery(client, 'ALTER TABLE polizas DROP CONSTRAINT IF EXISTS polizas_tipo_cobertura_check;');
  await safeQuery(client, `
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='polizas' AND column_name='tipo_cobertura')
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='polizas' AND column_name='plan') THEN
        ALTER TABLE polizas RENAME COLUMN tipo_cobertura TO plan;
      END IF;
    END $$;
  `);
  await safeQuery(client, 'ALTER TABLE polizas ADD COLUMN IF NOT EXISTS plan VARCHAR(100);');
  await safeQuery(client, 'ALTER TABLE polizas ALTER COLUMN plan DROP NOT NULL;');

  // Migración para recordatorios y estado 'anulada'
  await safeQuery(client, 'ALTER TABLE polizas ADD COLUMN IF NOT EXISTS recordatorio_24h BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE polizas ADD COLUMN IF NOT EXISTS recordatorio_48h BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE polizas ADD COLUMN IF NOT EXISTS recordatorio_5d BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE polizas DROP CONSTRAINT IF EXISTS polizas_estado_check;');
  await safeQuery(client, "ALTER TABLE polizas ADD CONSTRAINT polizas_estado_check CHECK (estado IN ('negociacion', 'vigente', 'vencido', 'rechazado', 'anulada'));");
  await safeQuery(client, 'ALTER TABLE polizas ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;');

  // Tabla de metadatos de tarifario
  await safeQuery(client, `
    CREATE TABLE IF NOT EXISTS tarifario_metadata (
      id SERIAL PRIMARY KEY,
      version VARCHAR(50) NOT NULL,
      ultima_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      usuario_correo VARCHAR(150) NOT NULL
    );
  `);
  // Insertar por defecto si está vacía
  await safeQuery(client, `
    INSERT INTO tarifario_metadata (version, usuario_correo)
    SELECT '1.0.0', 'admin@jkaseguros.com'
    WHERE NOT EXISTS (SELECT 1 FROM tarifario_metadata);
  `);

  // Migraciones de E-Learning
  await safeQuery(client, `
    CREATE TABLE IF NOT EXISTS elearning_cursos (
      id SERIAL PRIMARY KEY,
      titulo VARCHAR(255) NOT NULL,
      descripcion TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await safeQuery(client, `
    CREATE TABLE IF NOT EXISTS elearning_modulos (
      id SERIAL PRIMARY KEY,
      curso_id INT REFERENCES elearning_cursos(id) ON DELETE CASCADE,
      titulo VARCHAR(255) NOT NULL,
      contenido TEXT NOT NULL,
      orden INT NOT NULL,
      quiz_preguntas JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await safeQuery(client, `
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
  `);

  // Migraciones de Comisiones y Nuevos Campos
  await safeQuery(client, 'ALTER TABLE companias_seguros ADD COLUMN IF NOT EXISTS comision_estandar NUMERIC DEFAULT 0;');
  await safeQuery(client, 'ALTER TABLE companias_seguros ADD COLUMN IF NOT EXISTS comision_compania NUMERIC DEFAULT 0;');
  await safeQuery(client, 'ALTER TABLE companias_seguros ADD COLUMN IF NOT EXISTS comision_asesor_estandar NUMERIC DEFAULT 0;');
  
  await safeQuery(client, 'ALTER TABLE polizas ADD COLUMN IF NOT EXISTS comision_porcentaje NUMERIC;');
  await safeQuery(client, 'ALTER TABLE polizas ADD COLUMN IF NOT EXISTS frecuencia_pago VARCHAR(50) DEFAULT \'contado\';');
  await safeQuery(client, 'ALTER TABLE polizas DROP CONSTRAINT IF EXISTS polizas_frecuencia_pago_check;');
  await safeQuery(client, "ALTER TABLE polizas ADD CONSTRAINT polizas_frecuencia_pago_check CHECK (frecuencia_pago IN ('contado', 'semestral', 'cuatrimestral', 'trimestral', 'bimestral', '4_cuotas', 'cuatro_cuotas', 'mensual'));");
  await safeQuery(client, 'ALTER TABLE polizas ADD COLUMN IF NOT EXISTS tipo_negocio VARCHAR(50) DEFAULT \'nuevo\';');
  await safeQuery(client, 'ALTER TABLE polizas DROP CONSTRAINT IF EXISTS polizas_tipo_negocio_check;');
  await safeQuery(client, 'ALTER TABLE polizas ADD CONSTRAINT polizas_tipo_negocio_check CHECK (tipo_negocio IN (\'nuevo\', \'renovacion\'));');
  await safeQuery(client, 'ALTER TABLE polizas ADD COLUMN IF NOT EXISTS tipo_cobertura VARCHAR(50) DEFAULT \'individual\';');
  await safeQuery(client, 'ALTER TABLE polizas DROP CONSTRAINT IF EXISTS polizas_tipo_cobertura_check2;');
  await safeQuery(client, 'ALTER TABLE polizas ADD CONSTRAINT polizas_tipo_cobertura_check2 CHECK (tipo_cobertura IN (\'individual\', \'colectivo\'));');
  await safeQuery(client, 'ALTER TABLE polizas ADD COLUMN IF NOT EXISTS bono_pronto_pago BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE pagos ADD COLUMN IF NOT EXISTS cuota_numero INT;');
  await safeQuery(client, 'ALTER TABLE pagos ADD COLUMN IF NOT EXISTS cuota_total INT;');
  await safeQuery(client, 'ALTER TABLE pagos ADD COLUMN IF NOT EXISTS recordatorio_2d BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE pagos ADD COLUMN IF NOT EXISTS recordatorio_vencido BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE pagos ADD COLUMN IF NOT EXISTS monto_reportado NUMERIC;');
  await safeQuery(client, 'ALTER TABLE pagos ADD COLUMN IF NOT EXISTS moneda_pago VARCHAR(10) DEFAULT \'VES\';');
  await safeQuery(client, 'ALTER TABLE pagos ADD COLUMN IF NOT EXISTS observaciones TEXT;');
  await safeQuery(client, 'ALTER TABLE pagos ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;');
  await safeQuery(client, 'ALTER TABLE pagos ALTER COLUMN fecha_pago DROP NOT NULL;');
  await safeQuery(client, 'ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_estado_pago_check;');
  await safeQuery(client, "ALTER TABLE pagos ADD CONSTRAINT pagos_estado_pago_check CHECK (estado_pago IN ('pendiente', 'en_revision', 'pagado', 'vencido', 'rechazado'));");

  await safeQuery(client, 'ALTER TABLE asesores ADD COLUMN IF NOT EXISTS cedula VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE asesores ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE;');
  await safeQuery(client, 'ALTER TABLE asesores ADD COLUMN IF NOT EXISTS banco VARCHAR(100);');
  await safeQuery(client, 'ALTER TABLE asesores ADD COLUMN IF NOT EXISTS numero_cuenta VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE asesores ADD COLUMN IF NOT EXISTS estado VARCHAR(50) DEFAULT \'pendiente\';');
  await safeQuery(client, 'ALTER TABLE asesores ADD COLUMN IF NOT EXISTS tipo_asesor VARCHAR(50) DEFAULT \'asesor_3\';');
  await safeQuery(client, 'ALTER TABLE asesores DROP CONSTRAINT IF EXISTS asesores_tipo_asesor_check;');
  await safeQuery(client, 'ALTER TABLE asesores ADD CONSTRAINT asesores_tipo_asesor_check CHECK (tipo_asesor IN (\'asesor_1\', \'asesor_2\', \'asesor_3\', \'consultor_1\', \'consultor_2\', \'johans\', \'nivel_1_subagente\', \'nivel_2_agente\'));');

  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS pago_contado BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS pago_semestral BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS pago_cuatrimestral BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS pago_trimestral BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS pago_bimestral BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS pago_4_cuotas BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS pago_mensual BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS atencion_medica_primaria BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS medicinas BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS rehabilitacion BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS protesis BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS muleta_silla_ruedas BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS consultas BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS maternidad BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS oftalmologia BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS odontologia BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS muerte_accidental BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS muerte_accidental_suma VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS muerte_accidental_costo VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS invalidez_permanente BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS invalidez_permanente_suma VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS invalidez_permanente_costo VARCHAR(50);');
  await safeQuery(client, 'ALTER TABLE tarifas ADD COLUMN IF NOT EXISTS ramo VARCHAR(100) DEFAULT \'Salud\';');
  await safeQuery(client, 'ALTER TABLE polizas DROP CONSTRAINT IF EXISTS polizas_frecuencia_pago_check;');
  await safeQuery(client, "ALTER TABLE polizas ADD CONSTRAINT polizas_frecuencia_pago_check CHECK (frecuencia_pago IN ('contado', 'semestral', 'cuatrimestral', 'trimestral', 'bimestral', '4_cuotas', 'cuatro_cuotas', 'mensual'));");

  await safeQuery(client, `
    CREATE TABLE IF NOT EXISTS comisiones_asesores (
      id SERIAL PRIMARY KEY,
      asesor_id INT REFERENCES asesores(id) ON DELETE CASCADE,
      compania_id INT REFERENCES companias_seguros(id) ON DELETE CASCADE,
      porcentaje NUMERIC NOT NULL,
      UNIQUE(asesor_id, compania_id)
    );
  `);

  await safeQuery(client, `
    CREATE TABLE IF NOT EXISTS matriz_comisiones (
      id SERIAL PRIMARY KEY,
      mercado VARCHAR(100) NOT NULL,
      compania_id INT REFERENCES companias_seguros(id) ON DELETE CASCADE,
      ramo VARCHAR(100) NOT NULL,
      producto_modalidad VARCHAR(255) NOT NULL,
      total_comision NUMERIC NOT NULL DEFAULT 0,
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
  `);
  await safeQuery(client, 'ALTER TABLE matriz_comisiones ADD COLUMN IF NOT EXISTS asesor_1 NUMERIC DEFAULT 0;');
  await safeQuery(client, 'ALTER TABLE matriz_comisiones ADD COLUMN IF NOT EXISTS asesor_2 NUMERIC DEFAULT 0;');
  await safeQuery(client, 'ALTER TABLE matriz_comisiones ADD COLUMN IF NOT EXISTS asesor_3 NUMERIC DEFAULT 0;');

  await safeQuery(client, `
    CREATE TABLE IF NOT EXISTS corridas_comisiones (
      id SERIAL PRIMARY KEY,
      fecha_ejecucion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      tipo_ejecucion VARCHAR(50) NOT NULL,
      total_pagado NUMERIC NOT NULL,
      cantidad_asesores INT NOT NULL,
      archivo_txt TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await safeQuery(client, `
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
  `);

  await safeQuery(client, `
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
        recordatorio_24h BOOLEAN DEFAULT FALSE,
        recordatorio_48h BOOLEAN DEFAULT FALSE,
        recordatorio_5d BOOLEAN DEFAULT FALSE,
        notas_seguimiento TEXT,
        ultimo_contacto TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await safeQuery(client, 'ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS recordatorio_24h BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS recordatorio_48h BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS recordatorio_5d BOOLEAN DEFAULT FALSE;');
  await safeQuery(client, 'ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS notas_seguimiento TEXT;');
  await safeQuery(client, 'ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS ultimo_contacto TIMESTAMP;');

  // Tabla Perfiles 360 de Clientes (Sociodemográfico, Familiar, Patrimonial, Conductual)
  await client.query(`
    CREATE TABLE IF NOT EXISTS perfiles_clientes_360 (
      id SERIAL PRIMARY KEY,
      cliente_id INT UNIQUE REFERENCES datos_personales(id) ON DELETE CASCADE,
      token_publico VARCHAR(100) UNIQUE NOT NULL,
      profesion_ocupacion VARCHAR(150),
      empresa_trabajo VARCHAR(150),
      nivel_educativo VARCHAR(100),
      ciudad_residencia VARCHAR(100),
      zona_sector VARCHAR(150),
      tipo_vivienda VARCHAR(50),
      fumador VARCHAR(50),
      practica_deportes VARCHAR(100),
      frecuencia_viajes VARCHAR(100),
      sosten_principal BOOLEAN DEFAULT TRUE,
      dependientes_economicos INT DEFAULT 0,
      edades_hijos VARCHAR(100),
      nombre_conyuge VARCHAR(150),
      prioridad_familiar VARCHAR(150),
      rango_ingresos VARCHAR(100),
      posee_vehiculos BOOLEAN DEFAULT FALSE,
      cantidad_vehiculos INT DEFAULT 0,
      detalles_vehiculos TEXT,
      posee_inmuebles BOOLEAN DEFAULT FALSE,
      cantidad_inmuebles INT DEFAULT 0,
      posee_empresa_negocio BOOLEAN DEFAULT FALSE,
      nombre_empresa_ramo VARCHAR(150),
      capacidad_ahorro VARCHAR(100),
      tiene_hipoteca_deuda BOOLEAN DEFAULT FALSE,
      seguros_actuales JSONB DEFAULT '[]',
      experiencia_previa VARCHAR(100),
      perfil_riesgo VARCHAR(50),
      interes_principal VARCHAR(150),
      canal_contacto VARCHAR(50) DEFAULT 'WhatsApp',
      horario_contacto VARCHAR(50) DEFAULT 'Indiferente',
      notas_asesor TEXT,
      actualizado_por_cliente TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Auto-sincronizar perfiles 360 para clientes que no lo tengan
  await client.query(`
    INSERT INTO perfiles_clientes_360 (cliente_id, token_publico)
    SELECT id, md5(random()::text || clock_timestamp()::text || id::text)
    FROM datos_personales
    WHERE id NOT IN (SELECT cliente_id FROM perfiles_clientes_360 WHERE cliente_id IS NOT NULL);
  `);

  // Seeder de cursos en PostgreSQL si está vacío
  const checkCursos = await client.query('SELECT count(*) FROM elearning_cursos');
  if (parseInt(checkCursos.rows[0].count) === 0) {
    console.log('🌱 Sembrando cursos de E-Learning en PostgreSQL...');
    // Curso 1: Negociación
    const c1 = await client.query(`
      INSERT INTO elearning_cursos (titulo, descripcion) 
      VALUES ('Curso básico de negociación', 'Aprende los fundamentos y estrategias para cerrar acuerdos exitosos.') 
      RETURNING id
    `);
    const c1Id = c1.rows[0].id;
    await client.query(`
      INSERT INTO elearning_modulos (curso_id, titulo, contenido, orden, quiz_preguntas) 
      VALUES ($1, 'Introducción a la Negociación', 'La negociación es un proceso mediante el cual dos o más partes con intereses comunes o en conflicto buscan un acuerdo. Existen dos tipos principales:\n\n1. **Negociación Distributiva**: Del tipo ganar-perder, donde los recursos son fijos.\n2. **Negociación Integrativa**: Del tipo ganar-ganar, donde se busca ampliar los beneficios para ambas partes.\n\nEs clave conocer el MAAN (Mejor Alternativa a un Acuerdo Negociado), que define tu plan de escape si la negociación fracasa.', 1, $2)
    `, [c1Id, JSON.stringify([
      { pregunta: '¿Qué caracteriza a una negociación distributiva?', opciones: ['Es del tipo ganar-perder', 'Es del tipo ganar-ganar'], correcta: 0 },
      { pregunta: '¿Qué es el MAAN (Mejor Alternativa a un Acuerdo Negociado)?', opciones: ['La opción que tienes si la negociación fracasa', 'Tu oferta inicial en la mesa'], correcta: 0 }
    ])]);
    await client.query(`
      INSERT INTO elearning_modulos (curso_id, titulo, contenido, orden, quiz_preguntas) 
      VALUES ($1, 'Estrategias de Cierre y Objeciones', 'El cierre es el momento culmen. Ante objeciones comunes como el precio:\n\n- No rebajes la prima de inmediato, destruye la percepción de valor.\n- Concéntrate en la cobertura de salud completa y el respaldo de la aseguradora.\n- Usa la técnica del "Sentir-Encontrar-Demostrar" para empatizar con el cliente antes de rebatir.', 2, $2)
    `, [c1Id, JSON.stringify([
      { pregunta: 'Ante una objeción de precio del cliente, ¿cuál es la mejor estrategia?', opciones: ['Bajar el precio o prima de inmediato sin justificación', 'Resaltar el valor del seguro, las coberturas y el respaldo de la aseguradora'], correcta: 1 }
    ])]);

    // Curso 2: Seguros
    const c2 = await client.query(`
      INSERT INTO elearning_cursos (titulo, descripcion) 
      VALUES ('Curso de seguros', 'Conceptos fundamentales de pólizas de salud, vida y automotores.') 
      RETURNING id
    `);
    const c2Id = c2.rows[0].id;
    await client.query(`
      INSERT INTO elearning_modulos (curso_id, titulo, contenido, orden, quiz_preguntas) 
      VALUES ($1, 'Conceptos Fundamentales de Seguros', 'Para asesorar bien, debes dominar estos términos:\n\n- **Prima**: El pago que hace el cliente para mantener activa la cobertura.\n- **Suma Asegurada**: El límite máximo que la aseguradora pagará por un siniestro.\n- **Deducible**: El monto fijo que corre por cuenta del asegurado antes de que la aseguradora empiece a pagar.\n- **Siniestro**: El evento cubierto (enfermedad, accidente, etc.) que activa la póliza.', 1, $2)
    `, [c2Id, JSON.stringify([
      { pregunta: '¿Qué es la prima en una póliza de seguro?', opciones: ['El costo que paga el cliente para mantener la póliza activa', 'El deducible que paga el cliente en la clínica'], correcta: 0 },
      { pregunta: 'Si una póliza tiene un deducible de $500 y el siniestro es de $2000, ¿cuánto cubre la aseguradora?', opciones: ['Cubre los $2000 completos', 'Cubre $1500 (restando el deducible)'], correcta: 1 }
    ])]);
    await client.query(`
      INSERT INTO elearning_modulos (curso_id, titulo, contenido, orden, quiz_preguntas) 
      VALUES ($1, 'Ramos de Seguros en Venezuela', 'Manejamos principalmente:\n\n1. **Salud / HCM**: Hospitalización, Cirugía y Maternidad.\n2. **Vida**: Cobertura por fallecimiento e invalidez.\n3. **Vehículos**: Daños propios y responsabilidad civil.\n\nEn Protección y Seguros 360 nos especializamos fuertemente en Salud Individual y Colectiva con las mejores aseguradoras del país (Mercantil, Seguros Caracas, Seguros Venezuela, Mapfre).', 2, $2)
    `, [c2Id, JSON.stringify([
      { pregunta: '¿Qué cubre primordialmente una póliza HCM?', opciones: ['Gastos médicos por Hospitalización, Cirugía y Maternidad', 'Daños materiales del vehículo del asegurado'], correcta: 0 }
    ])]);

    // Curso 3: Cómo se usa el sistema
    const c3 = await client.query(`
      INSERT INTO elearning_cursos (titulo, descripcion) 
      VALUES ('Curso de cómo se usa el sistema', 'Guía rápida para cotizar y gestionar solicitudes en la plataforma Protección y Seguros 360.') 
      RETURNING id
    `);
    const c3Id = c3.rows[0].id;
    await client.query(`
      INSERT INTO elearning_modulos (curso_id, titulo, contenido, orden, quiz_preguntas) 
      VALUES ($1, 'Cotización y Creación de Pólizas', 'El flujo principal es:\n\n1. El cliente ingresa y cotiza en base a su edad y suma asegurada.\n2. Para cotizar con éxito, el cliente DEBE completar primero sus datos personales en su Perfil.\n3. La solicitud se crea inicialmente en estado **Negociación**.\n4. El asesor o administrador revisa y puede pasarla a **Vigente** cuando se formaliza.', 1, $2)
    `, [c3Id, JSON.stringify([
      { pregunta: '¿Cuál es el estado inicial de una póliza cuando la solicita un cliente?', opciones: ['Vigente', 'Negociación'], correcta: 1 },
      { pregunta: '¿Qué sección del sistema es obligatoria rellenar antes de cotizar?', opciones: ['La pestaña de Perfil (Datos Personales)', 'La pestaña de Pagos'], correcta: 0 }
    ])]);
    await client.query(`
      INSERT INTO elearning_modulos (curso_id, titulo, contenido, orden, quiz_preguntas) 
      VALUES ($1, 'Reporte y Conciliación de Pagos', 'Una vez creada la póliza:\n\n- Se genera una cuota de pago pendiente.\n- El cliente reporta su transferencia bancaria ingresando el Número de Referencia.\n- El asesor o admin valida y marca el pago como "pagado" para que la póliza pase a estar activa y solvente.', 2, $2)
    `, [c3Id, JSON.stringify([
      { pregunta: '¿Qué campo debe ingresar obligatoriamente el asegurado para notificar un pago?', opciones: ['La referencia bancaria', 'El nombre de su asesor de confianza'], correcta: 0 }
    ])]);
  }

  client.release();
} catch (err) {
  console.error('❌ Error al conectar con PostgreSQL (Neon):', err.message);
  if (!process.env.DATABASE_URL) {
    pool = null;
    initFallback();
  } else {
    pool = null;
    throw err;
  }
}
}

function syncFallbackFromDisk() {
  const filePath = getFallbackFilePath();
  if (fs.existsSync(filePath)) {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(fileContent);
      if (parsed && typeof parsed === 'object') {
        fallbackData = parsed;
      }
    } catch (e) {}
  }
}

// Emulación de consultas SQL simples sobre JSON
function fallbackQuery(text, params = []) {
  const cleanSql = text.replace(/\s+/g, ' ').trim();
  
  // 1. SELECT * FROM usuarios WHERE correo = $1
  if (cleanSql.includes('FROM usuarios WHERE correo =')) {
    const email = params[0];
    const user = fallbackData.usuarios.find(u => u.correo?.toLowerCase() === email?.toLowerCase());
    return { rows: user ? [user] : [] };
  }
  
  // 2. SELECT * FROM usuarios WHERE id = $1
  if (cleanSql.includes('FROM usuarios WHERE id =')) {
    const id = parseInt(params[0]);
    const user = fallbackData.usuarios.find(u => u.id === id);
    return { rows: user ? [user] : [] };
  }

  // 3. SELECT * FROM usuarios
  if (cleanSql.includes('FROM usuarios') && !cleanSql.includes('WHERE') && !cleanSql.startsWith('INSERT') && !cleanSql.startsWith('UPDATE') && !cleanSql.startsWith('DELETE')) {
    return { rows: [...fallbackData.usuarios] };
  }

  // 4. INSERT INTO usuarios (correo, contrasena, rango) VALUES ($1, $2, $3) RETURNING *
  if (cleanSql.startsWith('INSERT INTO usuarios')) {
    const [correo, contrasena, rango] = params;
    const newId = fallbackData.usuarios.length ? Math.max(...fallbackData.usuarios.map(u => u.id)) + 1 : 1;
    const newUser = {
      id: newId,
      correo: correo ? correo.toLowerCase() : '',
      contrasena,
      rango: rango || 'cliente',
      created_at: new Date().toISOString()
    };
    fallbackData.usuarios.push(newUser);
    saveFallback();
    return { rows: [newUser], rowCount: 1 };
  }

  // 5. UPDATE usuarios SET rango = $1 WHERE id = $2
  if (cleanSql.startsWith('UPDATE usuarios SET rango =')) {
    const [rango, id] = params;
    const userIdx = fallbackData.usuarios.findIndex(u => u.id === parseInt(id));
    if (userIdx !== -1) {
      fallbackData.usuarios[userIdx].rango = rango;
      saveFallback();
      return { rows: [fallbackData.usuarios[userIdx]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 6. SELECT * FROM datos_personales WHERE usuario_id = $1
  if (cleanSql.includes('FROM datos_personales WHERE usuario_id =')) {
    const userId = parseInt(params[0]);
    const details = fallbackData.datos_personales.find(d => d.usuario_id === userId);
    return { rows: details ? [details] : [] };
  }

  // 6b. SELECT id FROM datos_personales WHERE nro_documento = $1
  if (cleanSql.includes('FROM datos_personales WHERE nro_documento =')) {
    const doc = params[0];
    const details = fallbackData.datos_personales.find(d => d.nro_documento === doc);
    return { rows: details ? [details] : [] };
  }

  // 6c. SELECT FROM datos_personales WHERE asesor_id = $1
  if (cleanSql.includes('FROM datos_personales WHERE asesor_id =')) {
    const aseId = parseInt(params[0]);
    const details = fallbackData.datos_personales.filter(d => d.asesor_id === aseId);
    return { rows: details };
  }

  // 6d. SELECT * FROM datos_personales (todos)
  if (cleanSql.includes('FROM datos_personales') && !cleanSql.startsWith('INSERT') && !cleanSql.startsWith('UPDATE') && !cleanSql.startsWith('DELETE')) {
    return { rows: [...fallbackData.datos_personales] };
  }

  // 7. INSERT INTO datos_personales (columnas leídas dinámicamente del SQL para soportar distintos llamadores)
  if (cleanSql.startsWith('INSERT INTO datos_personales')) {
    const colMatch = cleanSql.match(/INSERT INTO datos_personales\s*\(([^)]+)\)/i);
    const columns = colMatch ? colMatch[1].split(',').map(c => c.trim()) : [];

    const newId = fallbackData.datos_personales.length ? Math.max(...fallbackData.datos_personales.map(d => d.id)) + 1 : 1;
    const newPerson = { id: newId, created_at: new Date().toISOString() };

    columns.forEach((col, i) => {
      let val = params[i];
      if (col === 'usuario_id' || col === 'asesor_id') val = val ? parseInt(val) : null;
      if (col === 'numero_hijos') val = (val !== undefined && val !== null && val !== '') ? parseInt(val) : 0;
      newPerson[col] = val;
    });

    // Si ya existe uno con este usuario_id, lo quitamos
    if (newPerson.usuario_id) {
      fallbackData.datos_personales = fallbackData.datos_personales.filter(d => d.usuario_id !== newPerson.usuario_id);
    }

    fallbackData.datos_personales.push(newPerson);
    saveFallback();
    return { rows: [newPerson] };
  }

  // 8. UPDATE datos_personales (columnas y WHERE leídos dinámicamente del SQL)
  if (cleanSql.startsWith('UPDATE datos_personales SET')) {
    let idx = -1;
    const userMatch = cleanSql.match(/WHERE usuario_id = \$(\d+)/i);
    const idMatch = cleanSql.match(/WHERE id = \$(\d+)/i);

    if (userMatch) {
      const whereParamIdx = parseInt(userMatch[1]) - 1;
      const usuario_id = parseInt(params[whereParamIdx]);
      idx = fallbackData.datos_personales.findIndex(d => d.usuario_id === usuario_id);
    } else if (idMatch) {
      const whereParamIdx = parseInt(idMatch[1]) - 1;
      const id = parseInt(params[whereParamIdx]);
      idx = fallbackData.datos_personales.findIndex(d => d.id === id);
    }

    if (idx !== -1) {
      const setMatch = cleanSql.match(/UPDATE datos_personales SET (.+) WHERE /i);
      if (setMatch) {
        const assignments = setMatch[1].split(',').map(s => s.trim());
        assignments.forEach(assignment => {
          const parts = assignment.split('=').map(s => s.trim());
          const col = parts[0];
          const placeholder = parts[1];
          const paramNumMatch = placeholder ? placeholder.match(/\$(\d+)/) : null;
          if (paramNumMatch) {
            const paramIdx = parseInt(paramNumMatch[1]) - 1;
            let val = params[paramIdx];
            if (val !== undefined && val !== null) {
              if (col === 'numero_hijos') val = parseInt(val) || 0;
              fallbackData.datos_personales[idx][col] = val;
            }
          }
        });
      }
      saveFallback();
      return { rows: [fallbackData.datos_personales[idx]] };
    }
    return { rows: [] };
  }

  // 9. SELECT * FROM asesores
  if (cleanSql.includes('FROM asesores WHERE usuario_id =')) {
    const userId = parseInt(params[0]);
    const advisor = fallbackData.asesores.find(a => a.usuario_id === userId);
    return { rows: advisor ? [advisor] : [] };
  }

  if (cleanSql.includes('FROM asesores WHERE id =')) {
    const aId = parseInt(params[0]);
    const advisor = fallbackData.asesores.find(a => a.id === aId);
    return { rows: advisor ? [advisor] : [] };
  }

  if (cleanSql.includes('FROM asesores ORDER BY id ASC LIMIT 1') || cleanSql.startsWith('SELECT id FROM asesores')) {
    const sorted = [...fallbackData.asesores].sort((a, b) => a.id - b.id);
    return { rows: sorted.length > 0 ? [{ id: sorted[0].id }] : [] };
  }

  if (cleanSql.includes('COALESCE(a.id, u.id)') || cleanSql.includes("u.rango = 'asesor'")) {
    const list = fallbackData.usuarios
      .filter(u => u.rango === 'asesor')
      .map(u => {
        const a = fallbackData.asesores.find(adv => adv.usuario_id === u.id);
        const dp = fallbackData.datos_personales.find(d => d.usuario_id === u.id);
        let nombre = u.correo;
        if (a && a.nombre) {
          nombre = a.nombre;
        } else if (dp && dp.primer_nombre) {
          nombre = `${dp.primer_nombre} ${dp.primer_apellido}`;
        }
        let tel = 'N/A';
        if (a && a.telefono) {
          tel = a.telefono;
        } else if (dp && dp.numero_celular) {
          tel = `${dp.codigo_area}-${dp.numero_celular}`;
        }
        return {
          id: a ? a.id : u.id,
          nombre,
          codigo_asesor: a ? a.codigo_asesor : `ASE-${u.id}`,
          telefono: tel,
          correo: u.correo
        };
      });
    list.sort((x, y) => x.nombre.localeCompare(y.nombre));
    return { rows: list };
  }

  if (cleanSql.startsWith('SELECT * FROM asesores')) {
    return { rows: fallbackData.asesores };
  }

  // 10. SELECT ... FROM companias_seguros (con o sin columnas explícitas / ORDER BY)
  if (cleanSql.includes('FROM companias_seguros') && !cleanSql.includes('FROM tarifas')) {
    const sorted = [...fallbackData.companias_seguros];
    if (cleanSql.includes('ORDER BY nombre')) sorted.sort((a, b) => a.nombre.localeCompare(b.nombre));
    return { rows: sorted };
  }

  // 11. SELECT * FROM tarifas
  if (cleanSql.startsWith('SELECT * FROM tarifas') || cleanSql.includes('FROM tarifas')) {
    const result = fallbackData.tarifas.map(t => {
      const comp = fallbackData.companias_seguros.find(c => c.id === t.compania_id);
      return {
        ...t,
        compania_nombre: comp ? comp.nombre : 'Desconocida'
      };
    });
    return { rows: result };
  }

  // 12. SELECT * FROM polizas
  if (cleanSql.includes('DISTINCT cliente_id') && cleanSql.includes('asesor_id = $1')) {
    const aseId = parseInt(params[0]);
    const matched = fallbackData.polizas.filter(p => p.asesor_id === aseId).map(p => ({ cliente_id: p.cliente_id }));
    return { rows: matched };
  }
  if (cleanSql.startsWith('SELECT * FROM polizas') || cleanSql.includes('FROM polizas')) {
    let result = [...fallbackData.polizas];
    
    // Unir con cliente (datos_personales) y asesor (asesores) y compañía
    result = result.map(p => {
      const cliente = fallbackData.datos_personales.find(d => d.id === p.cliente_id);
      const asesor = fallbackData.asesores.find(a => a.id === p.asesor_id);
      const compania = fallbackData.companias_seguros.find(c => c.id === p.compania_id);
      return {
        ...p,
        recordatorio_24h: p.recordatorio_24h || false,
        recordatorio_48h: p.recordatorio_48h || false,
        recordatorio_5d: p.recordatorio_5d || false,
        cliente_nombre: cliente ? `${cliente.primer_nombre} ${cliente.primer_apellido}` : 'Cliente Desconocido',
        cliente_email: cliente ? fallbackData.usuarios.find(u => u.id === cliente.usuario_id)?.correo : '',
        asesor_nombre: asesor ? asesor.nombre : 'Sin Asesor',
        compania_nombre: compania ? compania.nombre : 'Desconocida'
      };
    });

    if (cleanSql.includes('WHERE id = $1') || cleanSql.includes('WHERE p.id = $1')) {
      const polId = parseInt(params[0]);
      result = result.filter(p => parseInt(p.id) === polId);
    } else if (cleanSql.includes('cliente_id = $1')) {
      const cliId = parseInt(params[0]);
      result = result.filter(p => parseInt(p.cliente_id) === cliId);
    } else if (cleanSql.includes('asesor_id = $1')) {
      const aseId = parseInt(params[0]);
      result = result.filter(p => parseInt(p.asesor_id) === aseId);
    }
    
    return { rows: result };
  }

  // 13. INSERT INTO polizas (columnas y VALUES leídos del SQL: algunos valores son placeholders $n, otros literales)
  if (cleanSql.startsWith('INSERT INTO polizas')) {
    const colMatch = cleanSql.match(/INSERT INTO polizas\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    const columns = colMatch[1].split(',').map(c => c.trim());
    const valueExprs = colMatch[2].split(',').map(v => v.trim());

    const row = {};
    columns.forEach((col, i) => {
      const expr = valueExprs[i];
      const placeholderMatch = expr.match(/^\$(\d+)$/);
      let val;
      if (placeholderMatch) {
        val = params[parseInt(placeholderMatch[1]) - 1];
      } else if (/^'.*'$/.test(expr)) {
        val = expr.slice(1, -1);
      } else if (!isNaN(parseFloat(expr))) {
        val = parseFloat(expr);
      } else {
        val = expr;
      }
      row[col] = val;
    });

    const newId = fallbackData.polizas.length ? Math.max(...fallbackData.polizas.map(p => p.id)) + 1 : 1;
    const newPol = {
      id: newId,
      codigo_poliza: row.codigo_poliza,
      cliente_id: parseInt(row.cliente_id),
      asesor_id: row.asesor_id ? parseInt(row.asesor_id) : null,
      compania_id: parseInt(row.compania_id),
      plan: row.plan || null,
      area: row.area || 'Salud',
      suma_asegurada: parseFloat(row.suma_asegurada),
      deducible: parseFloat(row.deducible || 0),
      prima_anual: parseFloat(row.prima_anual),
      estado: row.estado || 'negociacion',
      pago_estado: row.pago_estado || 'pendiente',
      created_at: new Date().toISOString()
    };
    fallbackData.polizas.push(newPol);

    saveFallback();
    return { rows: [newPol] };
  }

  // 14. UPDATE polizas SET ...
  if (cleanSql.startsWith('UPDATE polizas SET')) {
    if (cleanSql.startsWith('UPDATE polizas SET estado =')) {
      const [estado, id] = params;
      const idx = fallbackData.polizas.findIndex(p => p.id === parseInt(id));
      if (idx !== -1) {
        fallbackData.polizas[idx].estado = estado;
        saveFallback();
        return { rows: [fallbackData.polizas[idx]], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (cleanSql.startsWith('UPDATE polizas SET asesor_id = $1 WHERE id = $2')) {
      const [asesorId, id] = params;
      const idx = fallbackData.polizas.findIndex(p => p.id === parseInt(id));
      if (idx !== -1) {
        fallbackData.polizas[idx].asesor_id = asesorId ? parseInt(asesorId) : null;
        saveFallback();
        return { rows: [fallbackData.polizas[idx]], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (cleanSql.startsWith('UPDATE polizas SET pago_estado =')) {
      const [pago_estado, id] = params;
      const idx = fallbackData.polizas.findIndex(p => p.id === parseInt(id));
      if (idx !== -1) {
        fallbackData.polizas[idx].pago_estado = pago_estado;
        saveFallback();
        return { rows: [fallbackData.polizas[idx]], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // Generic UPDATE polizas SET ... WHERE id = $X
    const lastParam = params[params.length - 1];
    const polId = parseInt(lastParam);
    const idx = fallbackData.polizas.findIndex(p => p.id === polId);
    if (idx !== -1) {
      if (cleanSql.includes('frecuencia_pago = $8') || cleanSql.includes('frecuencia_pago = $6')) {
        // Parse according to admin/advisor query
        if (cleanSql.includes('asesor_id = $1, compania_id = $2, plan = $3, suma_asegurada = $4, prima_anual = $5, estado = $6, motivo_rechazo = $7, frecuencia_pago = $8')) {
          const [asesor_id, compania_id, plan, suma_asegurada, prima_anual, estado, motivo_rechazo, frecuencia_pago, tipo_negocio, tipo_cobertura] = params;
          fallbackData.polizas[idx].asesor_id = asesor_id ? parseInt(asesor_id) : null;
          fallbackData.polizas[idx].compania_id = parseInt(compania_id);
          fallbackData.polizas[idx].plan = plan;
          fallbackData.polizas[idx].suma_asegurada = parseFloat(suma_asegurada);
          fallbackData.polizas[idx].prima_anual = parseFloat(prima_anual);
          fallbackData.polizas[idx].estado = estado;
          fallbackData.polizas[idx].motivo_rechazo = motivo_rechazo;
          fallbackData.polizas[idx].frecuencia_pago = frecuencia_pago || 'contado';
          fallbackData.polizas[idx].tipo_negocio = tipo_negocio || 'nuevo';
          fallbackData.polizas[idx].tipo_cobertura = tipo_cobertura || 'individual';
        } else {
          const [plan, suma_asegurada, prima_anual, estado, motivo_rechazo, frecuencia_pago, tipo_negocio, tipo_cobertura] = params;
          fallbackData.polizas[idx].plan = plan;
          fallbackData.polizas[idx].suma_asegurada = parseFloat(suma_asegurada);
          fallbackData.polizas[idx].prima_anual = parseFloat(prima_anual);
          fallbackData.polizas[idx].estado = estado;
          fallbackData.polizas[idx].motivo_rechazo = motivo_rechazo;
          fallbackData.polizas[idx].frecuencia_pago = frecuencia_pago || 'contado';
          fallbackData.polizas[idx].tipo_negocio = tipo_negocio || 'nuevo';
          fallbackData.polizas[idx].tipo_cobertura = tipo_cobertura || 'individual';
        }
      }
      saveFallback();
      return { rows: [fallbackData.polizas[idx]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 14b. UPDATE polizas SET recordatorio_24h = ...
  if (cleanSql.includes('UPDATE polizas SET recordatorio_24h =')) {
    const [recordatorio_24h, recordatorio_48h, recordatorio_5d, estado, id] = params;
    const idx = fallbackData.polizas.findIndex(p => p.id === parseInt(id));
    if (idx !== -1) {
      fallbackData.polizas[idx].recordatorio_24h = !!recordatorio_24h;
      fallbackData.polizas[idx].recordatorio_48h = !!recordatorio_48h;
      fallbackData.polizas[idx].recordatorio_5d = !!recordatorio_5d;
      fallbackData.polizas[idx].estado = estado;
      saveFallback();
      return { rows: [fallbackData.polizas[idx]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 14c. SELECT FROM tarifario_metadata
  if (cleanSql.includes('FROM tarifario_metadata')) {
    const meta = fallbackData.tarifario_metadata || {
      version: '1.0.0',
      ultima_modificacion: new Date().toISOString(),
      usuario_correo: 'admin@jkaseguros.com'
    };
    return { rows: [meta] };
  }

  // 15. SELECT * FROM pagos
  if (cleanSql.startsWith('SELECT * FROM pagos') || cleanSql.includes('FROM pagos')) {
    let result = [...fallbackData.pagos];
    
    if (cleanSql.includes('WHERE id = $1') || cleanSql.includes('WHERE pa.id = $1')) {
      const pId = parseInt(params[0]);
      result = result.filter(pa => parseInt(pa.id) === pId);
    } else if (cleanSql.includes('poliza_id = $1')) {
      const polId = parseInt(params[0]);
      result = result.filter(pa => parseInt(pa.poliza_id) === polId);
    } else if (cleanSql.includes('poliza_id IN (')) {
      const ids = params.map(x => String(x));
      result = result.filter(pa => ids.includes(String(pa.poliza_id)));
    }
    
    // Cruzar con detalles de póliza, compañía, cliente y asesor
    result = result.map(pa => {
      const pol = fallbackData.polizas.find(p => String(p.id) === String(pa.poliza_id));
      const compania = pol ? fallbackData.companias_seguros.find(c => String(c.id) === String(pol.compania_id)) : null;
      const cliente = pol ? fallbackData.datos_personales.find(d => String(d.id) === String(pol.cliente_id)) : null;
      const asesor = pol ? fallbackData.asesores.find(a => String(a.id) === String(pol.asesor_id)) : null;
      return {
        ...pa,
        asesor_id: pol ? pol.asesor_id : (pa.asesor_id || null),
        poliza_codigo: pol ? pol.codigo_poliza : (pa.poliza_codigo || `POL-${pa.poliza_id}`),
        poliza_plan: pol ? pol.plan : (pa.poliza_plan || ''),
        poliza_frecuencia: pol ? pol.frecuencia_pago : (pa.poliza_frecuencia || 'contado'),
        poliza_prima: pol ? pol.prima_anual : (pa.poliza_prima || 0),
        compania_nombre: compania ? compania.nombre : (pa.compania_nombre || 'Seguros'),
        cliente_nombre: cliente ? `${cliente.primer_nombre} ${cliente.primer_apellido}` : (pa.cliente_nombre || 'Asociado'),
        asesor_nombre: asesor ? asesor.nombre : (pa.asesor_nombre || 'Sin Asesor')
      };
    });

    return { rows: result };
  }

  // 16. INSERT INTO pagos
  if (cleanSql.startsWith('INSERT INTO pagos')) {
    const colMatch = cleanSql.match(/INSERT INTO pagos\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    const columns = colMatch ? colMatch[1].split(',').map(c => c.trim()) : [];
    const valueExprs = colMatch ? colMatch[2].split(',').map(v => v.trim()) : [];

    const row = {};
    columns.forEach((col, i) => {
      const expr = valueExprs[i];
      if (!expr) return;
      const placeholderMatch = expr.match(/^\$(\d+)$/);
      let val;
      if (placeholderMatch) {
        val = params[parseInt(placeholderMatch[1]) - 1];
      } else if (/^'.*'$/.test(expr)) {
        val = expr.slice(1, -1);
      } else if (!isNaN(parseFloat(expr))) {
        val = parseFloat(expr);
      } else {
        val = expr;
      }
      row[col] = val;
    });

    const newId = fallbackData.pagos.length ? Math.max(...fallbackData.pagos.map(pa => pa.id)) + 1 : 1;
    const newPay = {
      id: newId,
      poliza_id: parseInt(row.poliza_id || params[0] || 1),
      monto: parseFloat(row.monto !== undefined ? row.monto : (params[1] || 0)),
      monto_reportado: row.monto_reportado !== undefined ? (row.monto_reportado ? parseFloat(row.monto_reportado) : null) : null,
      moneda_pago: row.moneda_pago || 'USD',
      tasa_bcv: row.tasa_bcv ? parseFloat(row.tasa_bcv) : null,
      fecha_pago: row.fecha_pago || (row.estado_pago === 'en_revision' ? new Date().toISOString().split('T')[0] : null),
      estado_pago: row.estado_pago || 'pendiente',
      referencia: row.referencia || null,
      fecha_vencimiento: row.fecha_vencimiento || null,
      cuota_numero: row.cuota_numero !== undefined ? parseInt(row.cuota_numero) : 1,
      cuota_total: row.cuota_total !== undefined ? parseInt(row.cuota_total) : 1,
      observaciones: row.observaciones || null,
      created_at: new Date().toISOString()
    };
    fallbackData.pagos.push(newPay);
    saveFallback();
    return { rows: [newPay], rowCount: 1 };
  }

  // 17. DELETE FROM asesores
  if (cleanSql.startsWith('DELETE FROM asesores WHERE id =')) {
    const aId = parseInt(params[0]);
    fallbackData.asesores = fallbackData.asesores.filter(a => a.id !== aId);
    (fallbackData.polizas || []).forEach(p => { if (p.asesor_id === aId) p.asesor_id = null; });
    (fallbackData.datos_personales || []).forEach(d => { if (d.asesor_id === aId) d.asesor_id = null; });
    (fallbackData.cotizaciones || []).forEach(c => { if (c.asesor_id === aId) c.asesor_id = null; });
    saveFallback();
    return { rowCount: 1 };
  }
  if (cleanSql.startsWith('DELETE FROM asesores WHERE usuario_id =')) {
    const userId = parseInt(params[0]);
    fallbackData.asesores = fallbackData.asesores.filter(a => a.usuario_id !== userId);
    saveFallback();
    return { rowCount: 1 };
  }

  // 17.5 DELETE FROM usuarios WHERE id = $1
  if (cleanSql.startsWith('DELETE FROM usuarios WHERE id =')) {
    const uId = parseInt(params[0]);
    fallbackData.usuarios = fallbackData.usuarios.filter(u => u.id !== uId);
    saveFallback();
    return { rowCount: 1 };
  }

  // 18. UPDATE polizas SET asesor_id = $1 WHERE id = $2
  if (cleanSql.startsWith('UPDATE polizas SET asesor_id =')) {
    const [asesorId, id] = params;
    const idx = fallbackData.polizas.findIndex(p => p.id === parseInt(id));
    if (idx !== -1) {
      fallbackData.polizas[idx].asesor_id = asesorId ? parseInt(asesorId) : null;
      saveFallback();
      return { rows: [fallbackData.polizas[idx]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 19. UPDATE pagos SET ...
  if (cleanSql.startsWith('UPDATE pagos SET')) {
    let targetId = null;
    const whereIdParam = cleanSql.match(/WHERE id\s*=\s*\$(\d+)/i);
    if (whereIdParam) {
      targetId = parseInt(params[parseInt(whereIdParam[1]) - 1]);
    } else {
      const whereIdDirect = cleanSql.match(/WHERE id\s*=\s*(\d+)/i);
      if (whereIdDirect) targetId = parseInt(whereIdDirect[1]);
    }

    if (targetId) {
      const idx = fallbackData.pagos.findIndex(pa => parseInt(pa.id) === targetId);
      if (idx !== -1) {
        // Caso específico: Reporte de pago (UPDATE pagos SET monto = ..., monto_reportado = $2, moneda_pago = 'VES', referencia = $3, fecha_pago = $4, estado_pago = 'en_revision', observaciones = $5 WHERE id = $6)
        if (cleanSql.includes("estado_pago = 'en_revision'") || cleanSql.includes("moneda_pago = 'VES'")) {
          const [montoUSD, montoVES, ref, fecha, obs] = params;
          if (montoUSD && parseFloat(montoUSD) > 0) fallbackData.pagos[idx].monto = parseFloat(montoUSD);
          if (montoVES) fallbackData.pagos[idx].monto_reportado = parseFloat(montoVES);
          fallbackData.pagos[idx].moneda_pago = 'VES';
          if (ref) fallbackData.pagos[idx].referencia = ref;
          if (fecha) fallbackData.pagos[idx].fecha_pago = fecha;
          fallbackData.pagos[idx].estado_pago = 'en_revision';
          if (obs) fallbackData.pagos[idx].observaciones = obs;
        } else if (cleanSql.includes("estado_pago = 'pagado'")) {
          fallbackData.pagos[idx].estado_pago = 'pagado';
        } else if (cleanSql.includes("estado_pago = 'vencido'")) {
          fallbackData.pagos[idx].estado_pago = 'vencido';
          if (cleanSql.includes("recordatorio_vencido = true")) {
            fallbackData.pagos[idx].recordatorio_vencido = true;
          }
        } else if (cleanSql.includes("estado_pago = 'rechazado'")) {
          fallbackData.pagos[idx].estado_pago = 'rechazado';
          if (params[0]) fallbackData.pagos[idx].motivo_rechazo = params[0];
        } else if (cleanSql.includes("recordatorio_2d = true")) {
          fallbackData.pagos[idx].recordatorio_2d = true;
        } else {
          // Fallback parsing
          if (cleanSql.includes('estado_pago = $1')) fallbackData.pagos[idx].estado_pago = params[0];
          if (cleanSql.includes('referencia = $2')) fallbackData.pagos[idx].referencia = params[1];
        }
        saveFallback();
        return { rows: [fallbackData.pagos[idx]], rowCount: 1 };
      }
    }
    return { rows: [], rowCount: 0 };
  }

  // 20. UPDATE polizas SET pago_estado = $1 WHERE id = $2
  if (cleanSql.startsWith('UPDATE polizas SET pago_estado =')) {
    const [pago_estado, id] = params;
    const idx = fallbackData.polizas.findIndex(p => p.id === parseInt(id));
    if (idx !== -1) {
      fallbackData.polizas[idx].pago_estado = pago_estado;
      saveFallback();
      return { rows: [fallbackData.polizas[idx]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 21. INSERT INTO logs_actividad
  if (cleanSql.startsWith('INSERT INTO logs_actividad')) {
    const [usuario_id, correo_usuario, accion, descripcion] = params;
    const newId = fallbackData.logs_actividad.length ? Math.max(...fallbackData.logs_actividad.map(l => l.id)) + 1 : 1;
    const newLog = {
      id: newId,
      usuario_id: usuario_id ? parseInt(usuario_id) : null,
      correo_usuario: correo_usuario || 'sistema',
      accion,
      descripcion,
      created_at: new Date().toISOString()
    };
    fallbackData.logs_actividad.push(newLog);
    saveFallback();
    return { rows: [newLog] };
  }

  // 22. SELECT * FROM logs_actividad
  if (cleanSql.startsWith('SELECT * FROM logs_actividad') || cleanSql.includes('FROM logs_actividad')) {
    const sorted = [...fallbackData.logs_actividad].sort((a, b) => b.id - a.id);
    return { rows: sorted };
  }

  // 22b. UPDATE asesores SET tipo_asesor = $1 WHERE id = $2
  if (cleanSql.startsWith('UPDATE asesores SET tipo_asesor =')) {
    const [tipo_asesor, id] = params;
    const idx = fallbackData.asesores.findIndex(a => a.id === parseInt(id));
    if (idx !== -1) {
      fallbackData.asesores[idx].tipo_asesor = tipo_asesor;
      saveFallback();
      return { rows: [fallbackData.asesores[idx]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 22c. UPDATE asesores SET nombre = $1, telefono = $2, cedula = $3, banco = $4, numero_cuenta = $5, fecha_nacimiento = $6 WHERE usuario_id = $7
  if (cleanSql.startsWith('UPDATE asesores SET nombre =')) {
    const [nombre, telefono, cedula, banco, numero_cuenta, fecha_nacimiento, usuario_id] = params;
    const idx = fallbackData.asesores.findIndex(a => a.usuario_id === parseInt(usuario_id));
    if (idx !== -1) {
      fallbackData.asesores[idx].nombre = nombre;
      fallbackData.asesores[idx].telefono = telefono;
      fallbackData.asesores[idx].cedula = cedula || 'V00000000';
      fallbackData.asesores[idx].banco = banco;
      fallbackData.asesores[idx].numero_cuenta = numero_cuenta;
      fallbackData.asesores[idx].fecha_nacimiento = fecha_nacimiento;
      saveFallback();
      return { rows: [fallbackData.asesores[idx]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 23. SELECT FROM matriz_comisiones
  if (cleanSql.includes('FROM matriz_comisiones')) {
    const enriched = (fallbackData.matriz_comisiones || []).map(m => {
      const comp = (fallbackData.companias_seguros || []).find(c => c.id === m.compania_id);
      return {
        ...m,
        compania_nombre: comp ? comp.nombre : 'Todas'
      };
    });
    return { rows: enriched };
  }

  // 23b. INSERT INTO matriz_comisiones
  if (cleanSql.startsWith('INSERT INTO matriz_comisiones')) {
    const [mercado, compania_id, ramo, producto_modalidad, total_comision, asesor_1, asesor_2, asesor_3, consultor_1, consultor_2, johans, nivel_1_subagente, nivel_2_agente] = params;
    const newId = fallbackData.matriz_comisiones.length ? Math.max(...fallbackData.matriz_comisiones.map(m => m.id)) + 1 : 1;
    const newRule = {
      id: newId,
      mercado: mercado || 'Nacionales',
      compania_id: compania_id ? parseInt(compania_id) : null,
      ramo: ramo || 'Salud',
      producto_modalidad: producto_modalidad || 'General',
      total_comision: parseFloat(total_comision || 0),
      asesor_1: parseFloat(asesor_1 || consultor_1 || 0),
      asesor_2: parseFloat(asesor_2 || consultor_2 || 0),
      asesor_3: parseFloat(asesor_3 || 0),
      consultor_1: parseFloat(consultor_1 || asesor_1 || 0),
      consultor_2: parseFloat(consultor_2 || asesor_2 || 0),
      johans: parseFloat(johans || 0),
      nivel_1_subagente: parseFloat(nivel_1_subagente || 0),
      nivel_2_agente: parseFloat(nivel_2_agente || 0),
      created_at: new Date().toISOString()
    };
    fallbackData.matriz_comisiones.push(newRule);
    saveFallback();
    return { rows: [newRule] };
  }

  // 23c. UPDATE matriz_comisiones
  if (cleanSql.startsWith('UPDATE matriz_comisiones')) {
    const [mercado, compania_id, ramo, producto_modalidad, total_comision, asesor_1, asesor_2, asesor_3, consultor_1, consultor_2, johans, nivel_1_subagente, nivel_2_agente, id] = params;
    const idx = fallbackData.matriz_comisiones.findIndex(m => m.id === parseInt(id));
    if (idx !== -1) {
      fallbackData.matriz_comisiones[idx] = {
        ...fallbackData.matriz_comisiones[idx],
        mercado: mercado || fallbackData.matriz_comisiones[idx].mercado,
        compania_id: compania_id ? parseInt(compania_id) : fallbackData.matriz_comisiones[idx].compania_id,
        ramo: ramo || fallbackData.matriz_comisiones[idx].ramo,
        producto_modalidad: producto_modalidad || fallbackData.matriz_comisiones[idx].producto_modalidad,
        total_comision: parseFloat(total_comision !== undefined ? total_comision : fallbackData.matriz_comisiones[idx].total_comision),
        asesor_1: parseFloat(asesor_1 !== undefined ? asesor_1 : fallbackData.matriz_comisiones[idx].asesor_1),
        asesor_2: parseFloat(asesor_2 !== undefined ? asesor_2 : fallbackData.matriz_comisiones[idx].asesor_2),
        asesor_3: parseFloat(asesor_3 !== undefined ? asesor_3 : fallbackData.matriz_comisiones[idx].asesor_3),
        consultor_1: parseFloat(consultor_1 !== undefined ? consultor_1 : fallbackData.matriz_comisiones[idx].consultor_1),
        consultor_2: parseFloat(consultor_2 !== undefined ? consultor_2 : fallbackData.matriz_comisiones[idx].consultor_2),
        johans: parseFloat(johans !== undefined ? johans : fallbackData.matriz_comisiones[idx].johans),
        nivel_1_subagente: parseFloat(nivel_1_subagente !== undefined ? nivel_1_subagente : fallbackData.matriz_comisiones[idx].nivel_1_subagente),
        nivel_2_agente: parseFloat(nivel_2_agente !== undefined ? nivel_2_agente : fallbackData.matriz_comisiones[idx].nivel_2_agente)
      };
      saveFallback();
      return { rows: [fallbackData.matriz_comisiones[idx]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 23d. DELETE FROM matriz_comisiones
  if (cleanSql.startsWith('DELETE FROM matriz_comisiones')) {
    const id = parseInt(params[0]);
    const prevLen = fallbackData.matriz_comisiones.length;
    fallbackData.matriz_comisiones = fallbackData.matriz_comisiones.filter(m => m.id !== id);
    saveFallback();
    return { rowCount: prevLen - fallbackData.matriz_comisiones.length };
  }

  // 24. SELECT / INSERT corridas_comisiones
  if (cleanSql.startsWith('INSERT INTO corridas_comisiones')) {
    const [tipo_ejecucion, total_pagado, cantidad_asesores, archivo_txt] = params;
    const newId = fallbackData.corridas_comisiones.length ? Math.max(...fallbackData.corridas_comisiones.map(c => c.id)) + 1 : 1;
    const newRun = {
      id: newId,
      fecha_ejecucion: new Date().toISOString(),
      tipo_ejecucion,
      total_pagado: parseFloat(total_pagado),
      cantidad_asesores: parseInt(cantidad_asesores),
      archivo_txt,
      created_at: new Date().toISOString()
    };
    fallbackData.corridas_comisiones.push(newRun);
    saveFallback();
    return { rows: [newRun] };
  }

  if (cleanSql.includes('FROM corridas_comisiones')) {
    return { rows: fallbackData.corridas_comisiones };
  }

  // 24b. Comisiones Asesores por asesor y compania
  if (cleanSql.includes('FROM comisiones_asesores WHERE asesor_id =')) {
    const [aseId, compId] = params;
    const rule = (fallbackData.comisiones_asesores || []).find(ca => ca.asesor_id === parseInt(aseId) && ca.compania_id === parseInt(compId));
    return { rows: rule ? [rule] : [] };
  }

  // 24c. UPDATE historico_comisiones corrida_id
  if (cleanSql.startsWith("UPDATE historico_comisiones SET estado_corrida = 'procesado'")) {
    const corridaId = parseInt(params[0]);
    let count = 0;
    (fallbackData.historico_comisiones || []).forEach(h => {
      if (h.estado_corrida === 'pendiente') {
        h.estado_corrida = 'procesado';
        h.corrida_id = corridaId;
        count++;
      }
    });
    saveFallback();
    return { rowCount: count };
  }

  // 25. SELECT FROM historico_comisiones
  if (cleanSql.includes('FROM historico_comisiones')) {
    let result = [...fallbackData.historico_comisiones];
    if (cleanSql.includes('estado_corrida = $1')) {
      const state = params[0];
      result = result.filter(h => h.estado_corrida === state);
    } else if (cleanSql.includes("estado_corrida = 'pendiente'")) {
      result = result.filter(h => h.estado_corrida === 'pendiente');
    }
    if (cleanSql.includes('pago_id = $1')) {
      const pId = parseInt(params[0]);
      result = result.filter(h => h.pago_id === pId);
    }

    // Unir con asesores para obtener datos bancarios y personales
    result = result.map(h => {
      const adv = (fallbackData.asesores || []).find(a => parseInt(a.id) === parseInt(h.asesor_id)) || {};
      return {
        ...h,
        nombre: adv.nombre || 'Asesor Sin Nombre',
        correo: adv.correo || 'info@jkaconsultores.com',
        cedula: adv.cedula || 'V00000000',
        banco: adv.banco || 'BNC',
        numero_cuenta: adv.numero_cuenta || '00000000000000000000'
      };
    });

    return { rows: result };
  }

  // 26. INSERT INTO historico_comisiones
  if (cleanSql.startsWith('INSERT INTO historico_comisiones')) {
    const [pago_id, poliza_id, asesor_id, monto_pago, total_comision_porcentaje, asesor_porcentaje, comision_bruta, pago_asesor, margen_broker, fecha_pago, estado_corrida] = params;
    const newId = fallbackData.historico_comisiones.length ? Math.max(...fallbackData.historico_comisiones.map(h => h.id)) + 1 : 1;
    const newHist = {
      id: newId,
      pago_id: parseInt(pago_id),
      poliza_id: parseInt(poliza_id),
      asesor_id: asesor_id ? parseInt(asesor_id) : null,
      monto_pago: parseFloat(monto_pago),
      total_comision_porcentaje: parseFloat(total_comision_porcentaje),
      asesor_porcentaje: parseFloat(asesor_porcentaje),
      comision_bruta: parseFloat(comision_bruta),
      pago_asesor: parseFloat(pago_asesor),
      margen_broker: parseFloat(margen_broker),
      fecha_pago: fecha_pago || new Date().toISOString().split('T')[0],
      estado_corrida: estado_corrida || 'pendiente',
      corrida_id: null,
      created_at: new Date().toISOString()
    };
    fallbackData.historico_comisiones.push(newHist);
    saveFallback();
    return { rows: [newHist] };
  }

  // 27. INSERT INTO cotizaciones
  if (cleanSql.startsWith('INSERT INTO cotizaciones')) {
    const [token, asesor_id, cliente_datos, suma_asegurada, suma_asegurada_2, dependientes, comparativa, comparativa_2] = params;
    const newId = fallbackData.cotizaciones.length ? Math.max(...fallbackData.cotizaciones.map(c => c.id)) + 1 : 1;
    const newQuote = {
      id: newId,
      token,
      asesor_id: asesor_id ? parseInt(asesor_id) : null,
      cliente_datos: typeof cliente_datos === 'string' ? JSON.parse(cliente_datos) : cliente_datos,
      suma_asegurada: parseFloat(suma_asegurada),
      suma_asegurada_2: suma_asegurada_2 ? parseFloat(suma_asegurada_2) : null,
      dependientes: typeof dependientes === 'string' ? JSON.parse(dependientes) : (dependientes || []),
      comparativa: typeof comparativa === 'string' ? JSON.parse(comparativa) : (comparativa || []),
      comparativa_2: typeof comparativa_2 === 'string' ? JSON.parse(comparativa_2) : (comparativa_2 || []),
      estado: 'pendiente',
      created_at: new Date().toISOString()
    };
    fallbackData.cotizaciones.push(newQuote);
    saveFallback();
    return { rows: [newQuote] };
  }

  // 28. SELECT * FROM cotizaciones WHERE token = $1
  if (cleanSql.includes('FROM cotizaciones WHERE token =')) {
    const tokenVal = params[0];
    const quote = fallbackData.cotizaciones.find(c => c.token === tokenVal);
    return { rows: quote ? [quote] : [] };
  }

  // 28.1 SELECT * FROM cotizaciones (with optional asesor_id filter)
  if (cleanSql.includes('FROM cotizaciones') && !cleanSql.startsWith('INSERT') && !cleanSql.startsWith('UPDATE') && !cleanSql.startsWith('DELETE')) {
    let list = [...(fallbackData.cotizaciones || [])];
    if (cleanSql.includes('WHERE asesor_id =') || cleanSql.includes('WHERE c.asesor_id =')) {
      const aId = parseInt(params[0]);
      list = list.filter(c => c.asesor_id === aId);
    }
    // Join with asesor if requested
    const formatted = list.map(c => {
      const ase = c.asesor_id ? fallbackData.asesores?.find(a => a.id === c.asesor_id) : null;
      return {
        ...c,
        asesor_nombre: ase ? `${ase.primer_nombre || ''} ${ase.primer_apellido || ''}`.trim() : null,
        asesor_codigo: ase ? ase.codigo_asesor : null
      };
    });
    formatted.sort((a, b) => (b.id || 0) - (a.id || 0));
    return { rows: formatted };
  }

  // 29. UPDATE cotizaciones SET estado = $1 WHERE token = $2
  if (cleanSql.startsWith('UPDATE cotizaciones SET estado =')) {
    const [estado, tokenVal] = params;
    const idx = fallbackData.cotizaciones.findIndex(c => c.token === tokenVal);
    if (idx !== -1) {
      fallbackData.cotizaciones[idx].estado = estado;
      saveFallback();
      return { rows: [fallbackData.cotizaciones[idx]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 29.1 UPDATE cotizaciones reminders and notes
  if (cleanSql.startsWith('UPDATE cotizaciones SET') && cleanSql.includes('recordatorio_24h =')) {
    const qId = parseInt(params[params.length - 1]);
    const idx = fallbackData.cotizaciones.findIndex(c => c.id === qId);
    if (idx !== -1) {
      const [r24, r48, r5d, notas, contacto] = params;
      fallbackData.cotizaciones[idx].recordatorio_24h = !!r24;
      fallbackData.cotizaciones[idx].recordatorio_48h = !!r48;
      fallbackData.cotizaciones[idx].recordatorio_5d = !!r5d;
      fallbackData.cotizaciones[idx].notas_seguimiento = notas || '';
      fallbackData.cotizaciones[idx].ultimo_contacto = contacto || new Date().toISOString();
      saveFallback();
      return { rows: [fallbackData.cotizaciones[idx]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 30. DELETE FROM cotizaciones
  if (cleanSql.startsWith('DELETE FROM cotizaciones')) {
    const prev = (fallbackData.cotizaciones || []).length;
    fallbackData.cotizaciones = [];
    saveFallback();
    return { rowCount: prev };
  }

  // 31. DELETE FROM polizas
  if (cleanSql.startsWith('DELETE FROM polizas')) {
    const prev = (fallbackData.polizas || []).length;
    fallbackData.polizas = [];
    saveFallback();
    return { rowCount: prev };
  }

  // 32. DELETE FROM pagos
  if (cleanSql.startsWith('DELETE FROM pagos')) {
    if (cleanSql.includes('WHERE poliza_id =')) {
      const targetPolId = parseInt(params[0]);
      const prevLen = (fallbackData.pagos || []).length;
      fallbackData.pagos = (fallbackData.pagos || []).filter(pa => pa.poliza_id !== targetPolId);
      saveFallback();
      return { rowCount: prevLen - fallbackData.pagos.length };
    }
    const prev = (fallbackData.pagos || []).length;
    fallbackData.pagos = [];
    saveFallback();
    return { rowCount: prev };
  }

  // 33. DELETE FROM historico_comisiones
  if (cleanSql.startsWith('DELETE FROM historico_comisiones')) {
    const prev = (fallbackData.historico_comisiones || []).length;
    fallbackData.historico_comisiones = [];
    saveFallback();
    return { rowCount: prev };
  }

  // 35. INSERT INTO renovaciones_polizas
  if (cleanSql.startsWith('INSERT INTO renovaciones_polizas')) {
    const [poliza_id, cliente_id, asesor_id, fecha_renovacion, frecuencia_anterior, frecuencia_nueva, prima_anual, suma_asegurada, observaciones] = params;
    const newId = (fallbackData.renovaciones_polizas || []).length ? Math.max(...fallbackData.renovaciones_polizas.map(r => r.id)) + 1 : 1;
    const newRen = {
      id: newId,
      poliza_id: parseInt(poliza_id),
      cliente_id: parseInt(cliente_id),
      asesor_id: asesor_id ? parseInt(asesor_id) : null,
      fecha_renovacion: fecha_renovacion || new Date().toISOString().split('T')[0],
      frecuencia_anterior: frecuencia_anterior || null,
      frecuencia_nueva: frecuencia_nueva || 'contado',
      prima_anual: parseFloat(prima_anual || 0),
      suma_asegurada: suma_asegurada ? parseFloat(suma_asegurada) : null,
      observaciones: observaciones || null,
      created_at: new Date().toISOString()
    };
    if (!fallbackData.renovaciones_polizas) fallbackData.renovaciones_polizas = [];
    fallbackData.renovaciones_polizas.push(newRen);
    saveFallback();
    return { rows: [newRen], rowCount: 1 };
  }

  // 36. SELECT FROM renovaciones_polizas
  if (cleanSql.includes('FROM renovaciones_polizas')) {
    let result = [...(fallbackData.renovaciones_polizas || [])];
    if (cleanSql.includes('WHERE cliente_id = $1') || cleanSql.includes('WHERE r.cliente_id = $1')) {
      const cId = parseInt(params[0]);
      result = result.filter(r => parseInt(r.cliente_id) === cId);
    } else if (cleanSql.includes('WHERE poliza_id = $1') || cleanSql.includes('WHERE r.poliza_id = $1')) {
      const pId = parseInt(params[0]);
      result = result.filter(r => parseInt(r.poliza_id) === pId);
    } else if (cleanSql.includes('WHERE asesor_id = $1') || cleanSql.includes('WHERE r.asesor_id = $1')) {
      const aId = parseInt(params[0]);
      result = result.filter(r => parseInt(r.asesor_id) === aId);
    }
    result = result.map(r => {
      const pol = (fallbackData.polizas || []).find(p => p.id === r.poliza_id);
      const adv = (fallbackData.asesores || []).find(a => a.id === r.asesor_id);
      const cli = (fallbackData.datos_personales || []).find(c => c.id === r.cliente_id);
      const comp = pol ? (fallbackData.companias_seguros || []).find(c => c.id === pol.compania_id) : null;
      return {
        ...r,
        poliza_codigo: pol ? pol.codigo_poliza : `POL-${r.poliza_id}`,
        plan: pol ? pol.plan : '',
        compania_nombre: comp ? comp.nombre : 'Seguros',
        asesor_nombre: adv ? adv.nombre : 'Asesor',
        cliente_nombre: cli ? `${cli.primer_nombre} ${cli.primer_apellido}` : 'Cliente'
      };
    });
    result.sort((a, b) => b.id - a.id);
    return { rows: result };
  }

  console.log(`⚠️ Consulta SQL no emulada en fallback: "${cleanSql}"`);
  return { rows: [] };
}

// Exportar interfaz de consultas
export const db = {
  isFallback: () => isFallback,
  getFallbackData: () => {
    return fallbackData;
  },
  saveFallback: () => saveFallback(),
  query: async (text, params) => {
    if (pool) {
      return await pool.query(text, params);
    }
    if (!process.env.DATABASE_URL) {
      if (!isFallback) initFallback();
      return fallbackQuery(text, params);
    }
    await initDb();
    if (pool) {
      return await pool.query(text, params);
    }
    throw new Error('No se pudo conectar a la base de datos PostgreSQL.');
  }
};
export default db;
