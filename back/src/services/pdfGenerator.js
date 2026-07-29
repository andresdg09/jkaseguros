import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Busca la ruta del logo en la carpeta public
 */
function getLogoPath() {
  const possiblePaths = [
    path.join(__dirname, '../../../front/public/logo.png'),
    path.join(process.cwd(), '../front/public/logo.png'),
    path.join(process.cwd(), 'front/public/logo.png'),
    path.join(process.cwd(), 'public/logo.png'),
    path.join(process.cwd(), 'logo.png')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * Dibuja el encabezado institucional JKA sobre fondo blanco
 */
function dibujarHeader(doc, logoPath, tituloPagina = '') {
  // Franja blanca superior
  doc.rect(0, 0, 595, 65).fill('#ffffff');

  // Logo institucional
  if (logoPath) {
    try {
      doc.image(logoPath, 40, 12, { fit: [160, 42] });
    } catch (e) {
      doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(18).text('JKA CONSULTORES', 40, 22);
    }
  } else {
    doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(18).text('JKA CONSULTORES', 40, 22);
  }

  // Textos del encabezado
  doc.fillColor('#1e3a8a').fontSize(8.5).font('Helvetica-Bold');
  if (tituloPagina) {
    doc.text(tituloPagina.toUpperCase(), 250, 16, { align: 'right', width: 305, lineBreak: false });
  } else {
    doc.text('COTIZACIÓN DE SEGUROS DE SALUD', 250, 16, { align: 'right', width: 305, lineBreak: false });
  }

  doc.fillColor('#475569').font('Helvetica').fontSize(7.5)
     .text('JKA Consultores C.A. | Asesoría de Seguros en Venezuela', 250, 29, { align: 'right', width: 305, lineBreak: false })
     .text('Caracas, Venezuela | Tel: +58 412-1234567 | Web: jkaseguros.com', 250, 41, { align: 'right', width: 305, lineBreak: false });

  // Línea divisoria azul
  doc.lineWidth(1.5).strokeColor('#1e3a8a').moveTo(40, 60).lineTo(555, 60).stroke();
}

/**
 * Dibuja el PDF estructurado estrictamente en 2 páginas
 */
function dibujarPdf(doc, cliente, edad, tipoCobertura, comparativas) {
  const logoPath = getLogoPath();

  const primaryColor = '#1e3a8a';     // Azul profundo
  const secondaryColor = '#2563eb';   // Azul vibrante
  const darkColor = '#0f172a';        // Texto principal
  const lightBg = '#f8fafc';          // Fondo de celdas
  const borderColor = '#cbd5e1';      // Bordes

  // ==========================================
  // PÁGINA 1: DATOS, RECOMENDACIÓN Y TABLA
  // ==========================================
  dibujarHeader(doc, logoPath, `DIAGNÓSTICO (${tipoCobertura.toUpperCase()})`);

  // Título Principal
  doc.fillColor(darkColor).font('Helvetica-Bold').fontSize(11)
     .text(`DIAGNÓSTICO Y COMPARATIVA DE SEGUROS DE SALUD (${tipoCobertura.toUpperCase()})`, 40, 75, { lineBreak: false });

  // --- 1. Datos del Asegurado ---
  doc.rect(40, 92, 515, 58).fill(lightBg);
  doc.rect(40, 92, 515, 58).stroke(borderColor);

  const col1 = 55;
  const col2 = 310;
  const fechaHoy = new Date().toLocaleDateString('es-VE');
  const fechaNac = new Date(cliente.fecha_nacimiento).toLocaleDateString('es-VE');

  doc.fillColor(darkColor).font('Helvetica-Bold').fontSize(8);
  doc.text('Asegurado:', col1, 100, { lineBreak: false }).font('Helvetica').text(`${cliente.primer_nombre} ${cliente.primer_apellido}`, col1 + 60, 100, { lineBreak: false });
  doc.font('Helvetica-Bold').text('Documento:', col2, 100, { lineBreak: false }).font('Helvetica').text(`${cliente.tipo_documento}-${cliente.nro_documento}`, col2 + 65, 100, { lineBreak: false });

  doc.font('Helvetica-Bold').text('F. Nacimiento:', col1, 114, { lineBreak: false }).font('Helvetica').text(fechaNac, col1 + 75, 114, { lineBreak: false });
  doc.font('Helvetica-Bold').text('Edad / Género:', col2, 114, { lineBreak: false }).font('Helvetica').text(`${edad} años / ${cliente.genero || 'N/A'}`, col2 + 75, 114, { lineBreak: false });

  doc.font('Helvetica-Bold').text('Teléfono:', col1, 128, { lineBreak: false }).font('Helvetica').text(`${cliente.codigo_area}-${cliente.numero_celular}`, col1 + 60, 128, { lineBreak: false });
  doc.font('Helvetica-Bold').text('Fecha Emisión:', col2, 128, { lineBreak: false }).font('Helvetica').text(fechaHoy, col2 + 75, 128, { lineBreak: false });

  // --- 2. Recomendación / Opción Destacada ---
  const compValidas = comparativas.filter(c => c.prima && parseFloat(c.prima) > 0);
  let mejorOpcion = null;

  if (compValidas.length > 0) {
    mejorOpcion = compValidas.reduce((min, current) => parseFloat(current.prima) < parseFloat(min.prima) ? current : min, compValidas[0]);
  }

  if (mejorOpcion) {
    doc.rect(40, 158, 515, 24).fill('#eff6ff');
    doc.rect(40, 158, 515, 24).stroke('#bfdbfe');
    doc.fillColor('#1e40af').font('Helvetica-Bold').fontSize(7.5)
       .text('RECOMENDACIÓN JKA:', 48, 166, { lineBreak: false });
    doc.font('Helvetica').fillColor(darkColor).fontSize(7.5)
       .text(`Para la edad de ${edad} años, `, 155, 166, { continued: true })
       .font('Helvetica-Bold').text(`${mejorOpcion.nombre} `, { continued: true })
       .font('Helvetica').text(`ofrece la tarifa más competitiva con una prima de `, { continued: true })
       .font('Helvetica-Bold').fillColor(secondaryColor)
       .text(`$${parseFloat(mejorOpcion.prima).toLocaleString('en-US', { minimumFractionDigits: 2 })}/año.`, { continued: false });
  }

  // --- 3. Tabla Comparativa ---
  doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(9.5)
     .text('Tarifas Estimadas y Características Generales de Cobertura', 40, 192, { lineBreak: false });

  let tableY = 205;

  // Header de Tabla
  doc.rect(40, tableY, 515, 18).fill(primaryColor);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
  doc.text('Compañía de Seguros', 45, tableY + 5, { lineBreak: false });
  doc.text('Suma Asegurada', 150, tableY + 5, { lineBreak: false });
  doc.text('Deducible', 245, tableY + 5, { lineBreak: false });
  doc.text('Maternidad', 315, tableY + 5, { lineBreak: false });
  doc.text('Plazo Espera', 395, tableY + 5, { lineBreak: false });
  doc.text('Prima Anual', 475, tableY + 5, { lineBreak: false });

  tableY += 18;

  // Filas de Aseguradoras
  comparativas.forEach((comp, idx) => {
    const rowBg = idx % 2 === 0 ? '#ffffff' : lightBg;
    doc.rect(40, tableY, 515, 22).fill(rowBg);
    doc.lineWidth(0.5).strokeColor(borderColor).moveTo(40, tableY + 22).lineTo(555, tableY + 22).stroke();

    doc.fillColor(darkColor).font('Helvetica-Bold').fontSize(7.5);
    doc.text(comp.nombre, 45, tableY + 7, { width: 100, height: 12 });

    doc.font('Helvetica').fontSize(7);
    const sumaSalud = tipoCobertura === 'colectivo' ? comp.col_suma_salud : comp.ind_suma_salud;
    doc.text(sumaSalud || 'Consultar', 150, tableY + 7, { width: 90, height: 12 });

    const deduc = tipoCobertura === 'colectivo' ? comp.col_deducible : comp.ind_deducible;
    doc.text(deduc || '$0', 245, tableY + 7, { width: 65, height: 12 });

    const mat = tipoCobertura === 'colectivo' ? comp.col_maternidad : comp.ind_maternidad;
    doc.text(mat || 'Opcional', 315, tableY + 7, { width: 75, height: 12 });

    const espera = tipoCobertura === 'colectivo' ? comp.col_espera_inicial : comp.ind_espera_vzla;
    doc.text(espera || 'No aplica', 395, tableY + 7, { width: 75, height: 12 });

    if (comp.prima) {
      doc.fillColor(secondaryColor).font('Helvetica-Bold').fontSize(8);
      doc.text(`$${parseFloat(comp.prima).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 475, tableY + 6, { lineBreak: false });
    } else {
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(7);
      doc.text('No disp.', 475, tableY + 7, { lineBreak: false });
    }

    tableY += 22;
  });

  // --- 4. Modalidades de Pago ---
  const finY = tableY + 10;
  doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(9)
     .text('Modalidades de Pago y Financiamiento', 40, finY, { lineBreak: false });

  const boxW = 160;
  const paymentModes = [
    { title: 'Pago Único Contado', desc: 'Descuentos por pronto pago según aseguradora.' },
    { title: 'Fraccionamiento Semestral', desc: '50% inicial y saldo a los 6 meses de vigencia.' },
    { title: 'Financiamiento Especial', desc: 'Desde 40% de inicial y hasta 6 cuotas.' }
  ];

  paymentModes.forEach((pm, i) => {
    const bx = 40 + (i * (boxW + 17));
    doc.rect(bx, finY + 12, boxW, 40).fill(lightBg);
    doc.rect(bx, finY + 12, boxW, 40).stroke(borderColor);

    doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(7.5)
       .text(pm.title, bx + 6, finY + 16, { width: boxW - 12 });
    doc.fillColor(darkColor).font('Helvetica').fontSize(6.5)
       .text(pm.desc, bx + 6, finY + 28, { width: boxW - 12 });
  });

  // ==========================================
  // PÁGINA 2: DETALLES TÉCNICOS Y PIE DE FIRMA
  // ==========================================
  doc.addPage();
  dibujarHeader(doc, logoPath, 'DETALLES ADICIONALES DEL DIAGNÓSTICO');

  let page2Y = 78;

  // --- 1. Servicios y Asistencias Incluidos ---
  doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(9.5)
     .text('Servicios de Asistencia Incluidos', 40, page2Y, { lineBreak: false });

  page2Y += 14;

  const services = [
    { name: 'Telemedicina y Orientación Médica:', desc: 'Atención médica telefónica o virtual las 24 horas sin deducible.' },
    { name: 'Asistencia Médica Internacional:', desc: 'Cobertura de emergencias en el exterior para seguros con dicho módulo activado.' },
    { name: 'Atención Domiciliaria y Ambulancia:', desc: 'Traslado y atención primaria de urgencias dentro de las principales ciudades.' },
    { name: 'Servicios de Odontología y Oftalmología:', desc: 'Limpiezas preventivas, evaluaciones anuales y descuentos especiales en red.' }
  ];

  services.forEach((s) => {
    doc.rect(40, page2Y, 515, 24).fill(lightBg);
    doc.rect(40, page2Y, 515, 24).stroke(borderColor);

    doc.fillColor(secondaryColor).font('Helvetica-Bold').fontSize(7.5)
       .text(s.name, 48, page2Y + 4, { lineBreak: false });
    doc.fillColor(darkColor).font('Helvetica').fontSize(7)
       .text(s.desc, 48, page2Y + 13, { width: 495, height: 10 });

    page2Y += 27;
  });

  page2Y += 5;

  // --- 2. Consideraciones Técnicas del Análisis ---
  doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(9.5)
     .text('Consideraciones Técnicas del Análisis', 40, page2Y, { lineBreak: false });

  page2Y += 14;

  const features = [
    { title: 'Exámenes de Admisión:', desc: 'Para pólizas colectivas, la mayoría de compañías no exige exámenes de admisión. En individuales es requerido según la edad (a partir de 54 o 60 años).' },
    { title: 'Cobertura Inmediata:', desc: 'Mercantil ofrece cobertura inmediata hasta $2,000; Universitas y Seguros Caracas cubren emergencias médicas de forma inmediata en colectivos.' },
    { title: 'Asistencia en Viajes:', desc: 'Mercantil y Universitas incluyen cobertura internacional en colectivos. Opcional en Pirámides e Hispanas.' },
    { title: 'Condiciones de Pago:', desc: 'Varían según la aseguradora. Mercantil destaca por financiamiento del 40% inicial y 6 cuotas. Otras aplican pago único o semestral.' }
  ];

  features.forEach(item => {
    doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(8).text(item.title, 40, page2Y, { lineBreak: false });
    doc.fillColor(darkColor).font('Helvetica').fontSize(7.5).text(item.desc, 40, page2Y + 10, { width: 515 });
    page2Y += 32;
  });

  page2Y += 4;

  // --- 3. Nota de Asesoría ---
  doc.rect(40, page2Y, 515, 40).fill('#fff3cd');
  doc.rect(40, page2Y, 515, 40).stroke('#ffeeba');
  doc.fillColor('#856404').font('Helvetica-Bold').fontSize(7.5).text('NOTA DE ASESORÍA:', 48, page2Y + 6, { lineBreak: false });
  doc.font('Helvetica').fontSize(7)
     .text('Los precios aquí reflejados son de carácter informativo e ilustrativo y pueden cambiar según la cantidad definitiva de asegurados y regulaciones de la SUDEASEG. Comuníquese con su asesor asignado para formalizar la contratación.', 48, page2Y + 16, { width: 495 });

  page2Y += 48;

  // --- 4. Bloque de Firma y Emisión JKA ---
  doc.rect(40, page2Y, 515, 55).fill(lightBg);
  doc.rect(40, page2Y, 515, 55).stroke(borderColor);

  doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(8)
     .text('Documento Emitido Por:', 52, page2Y + 8, { lineBreak: false });

  doc.fillColor(darkColor).font('Helvetica-Bold').fontSize(8.5)
     .text('JKA Consultores C.A.', 52, page2Y + 20, { lineBreak: false });
  doc.font('Helvetica').fontSize(7)
     .text('Departamento de Asesoría y Cotizaciones', 52, page2Y + 30, { lineBreak: false })
     .text('Caracas, Venezuela | www.jkaseguros.com', 52, page2Y + 40, { lineBreak: false });

  doc.lineWidth(1).strokeColor(primaryColor).moveTo(370, page2Y + 35).lineTo(510, page2Y + 35).stroke();
  doc.fillColor(darkColor).font('Helvetica-Bold').fontSize(7.5)
     .text('Firma y Sello Autorizado', 370, page2Y + 40, { align: 'center', width: 140, lineBreak: false });

  // ==========================================
  // PIE DE PÁGINA GLOBAL DE PÁGINAS EXISTENTES
  // ==========================================
  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    // Y en 790 pt con lineBreak: false para no provocar saltos no deseados
    doc.fillColor('#64748b').fontSize(7).font('Helvetica')
       .text(`Página ${i + 1} de ${totalPages} | Documento emitido por JKA Consultores C.A.`, 40, 790, { align: 'center', width: 515, lineBreak: false });
  }
}

/**
 * Genera un PDF de cotización comparativa para transmitir en respuesta Express
 */
export function generarPdfCotizacion(res, cliente, edad, tipoCobertura, comparativas) {
  // Desactivar margen inferior automático para tener control total
  const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=cotizacion_jka_${cliente.nro_documento}.pdf`);
  doc.pipe(res);

  dibujarPdf(doc, cliente, edad, tipoCobertura, comparativas);

  doc.end();
}

/**
 * Genera un PDF en memoria y retorna un Buffer
 * @returns {Promise<Buffer>}
 */
export function generarPdfBuffer(cliente, edad, tipoCobertura, comparativas) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    dibujarPdf(doc, cliente, edad, tipoCobertura, comparativas);

    doc.end();
  });
}