import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PAGE_W = 595;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2; // 515
const FOOTER_Y = 790;

const COLORS = {
  primary: '#1e3a8a',
  secondary: '#2563eb',
  dark: '#0f172a',
  lightBg: '#f8fafc',
  border: '#cbd5e1',
  muted: '#64748b',
  success: '#10b981',
  amber: '#f59e0b'
};

// Datos del corredor de seguros, mostrados en el encabezado (bajo el título de
// cada página) y en el pie de página de todas las páginas del PDF.
const BROKER_INFO_LINES = [
  'Johann Joubert',
  'Corredor de la Actividad Aseguradora',
  'CAA-005236 –SUDEASEG',
  'Rif V-11414838-1'
];

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
  doc.rect(0, 0, PAGE_W, 65).fill('#ffffff');

  if (logoPath) {
    try {
      doc.image(logoPath, 40, 12, { fit: [160, 42] });
    } catch (e) {
      doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(18).text('JKA CONSULTORES', 40, 22);
    }
  } else {
    doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(18).text('JKA CONSULTORES', 40, 22);
  }

  doc.fillColor(COLORS.primary).fontSize(8.5).font('Helvetica-Bold');
  doc.text((tituloPagina || 'COTIZACIÓN DE SEGUROS DE SALUD').toUpperCase(), 250, 16, { align: 'right', width: 305, lineBreak: false });

  doc.fillColor('#475569').font('Helvetica').fontSize(6.5);
  BROKER_INFO_LINES.forEach((line, i) => {
    doc.text(line, 250, 28 + i * 7.3, { align: 'right', width: 305, lineBreak: false });
  });

  doc.lineWidth(1.5).strokeColor(COLORS.primary).moveTo(40, 60).lineTo(555, 60).stroke();
}

/**
 * Dibuja el bloque de datos del asegurado
 */
function dibujarDatosAsegurado(doc, cliente, edad, sumaFormateada) {
  const hasDeps = cliente.dependientes && cliente.dependientes.length > 0;
  const depLines = hasDeps ? Math.ceil(cliente.dependientes.length / 2) : 0;
  const boxH = 70 + depLines * 14;

  doc.rect(MARGIN, 92, CONTENT_W, boxH).fill(COLORS.lightBg);
  doc.rect(MARGIN, 92, CONTENT_W, boxH).stroke(COLORS.border);

  const col1 = 55;
  const col2 = 310;
  const fechaHoy = new Date().toLocaleDateString('es-VE');
  const fechaNac = new Date(cliente.fecha_nacimiento).toLocaleDateString('es-VE');

  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(8);
  doc.text('Prospecto:', col1, 100, { lineBreak: false }).font('Helvetica').text(`${cliente.primer_nombre} ${cliente.primer_apellido}`, col1 + 60, 100, { lineBreak: false });
  doc.font('Helvetica-Bold').text('Documento:', col2, 100, { lineBreak: false }).font('Helvetica').text(`${cliente.tipo_documento}-${cliente.nro_documento}`, col2 + 65, 100, { lineBreak: false });

  doc.font('Helvetica-Bold').text('F. Nacimiento:', col1, 114, { lineBreak: false }).font('Helvetica').text(fechaNac, col1 + 75, 114, { lineBreak: false });
  doc.font('Helvetica-Bold').text('Edad / Género:', col2, 114, { lineBreak: false }).font('Helvetica').text(`${edad} años / ${cliente.genero || 'N/A'}`, col2 + 75, 114, { lineBreak: false });

  doc.font('Helvetica-Bold').text('Teléfono:', col1, 128, { lineBreak: false }).font('Helvetica').text(cliente.telefono || 'N/A', col1 + 60, 128, { lineBreak: false });
  doc.font('Helvetica-Bold').text('Suma Asegurada:', col2, 128, { lineBreak: false }).font('Helvetica-Bold').fillColor(COLORS.secondary).text(sumaFormateada, col2 + 85, 128, { lineBreak: false });
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(6.5).text('Válido por 10 días', col2 + 85, 140, { lineBreak: false });

  if (hasDeps) {
    let dy = 154;
    doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(8).text('Dependientes:', col1, dy, { lineBreak: false });
    
    cliente.dependientes.forEach((dep, idx) => {
      const col = idx % 2 === 0 ? col1 + 70 : col2;
      const rowY = dy + Math.floor(idx / 2) * 14;
      const label = dep.relacion.charAt(0).toUpperCase() + dep.relacion.slice(1);
      doc.fillColor(COLORS.dark).font('Helvetica').fontSize(8).text(`• ${label} (Edad: ${dep.edad} años)`, col, rowY, { lineBreak: false });
    });
  }

  const footY = 92 + boxH + 3;
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(6.5).text(`Fecha de emisión: ${fechaHoy}`, col1, footY, { lineBreak: false });
}

/**
 * Dibuja una tarjeta de plan de seguro para una aseguradora
 */
function dibujarTarjetaAseguradora(doc, x, y, width, height, comp, isBest) {
  const cardBg = isBest ? '#eff6ff' : '#ffffff';
  const cardBorder = isBest ? COLORS.secondary : COLORS.border;

  doc.roundedRect(x, y, width, height, 6).fill(cardBg);
  doc.roundedRect(x, y, width, height, 6).lineWidth(isBest ? 1.5 : 1).stroke(cardBorder);

  const priceBoxW = 120;
  const leftW = width - priceBoxW - 30;
  const padX = x + 14;
  let topY = y + 12;

  if (isBest) {
    doc.roundedRect(x + 12, y - 8, 165, 16, 8).fill(COLORS.success);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(6.5).text('RECOMENDACIÓN JKA', x + 12, y - 4, { width: 165, align: 'center', lineBreak: false });
    topY += 6;
  }

  // Nombre y plan
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(11).text(comp.nombre, padX, topY, { width: leftW, lineBreak: false });
  doc.fillColor(COLORS.secondary).font('Helvetica-Bold').fontSize(7.5).text(`PLAN: ${(comp.plan || 'N/A').toUpperCase()}`, padX, topY + 15, { width: leftW, lineBreak: false });

  // Grid de beneficios (2 columnas x 2 filas)
  const beneficios = [
    ['MATERNIDAD', comp.maternidad_suma ? `${comp.maternidad_suma}${comp.maternidad_costo ? ' (+' + comp.maternidad_costo + ')' : ''}` : 'No incluida'],
    ['ASISTENCIA INTERNACIONAL', comp.asist_intl_suma ? `${comp.asist_intl_suma}${comp.asist_intl_costo ? ' (+' + comp.asist_intl_costo + ')' : ''}` : 'No incluida'],
    ['FUNERAL', comp.funeral_suma ? `${comp.funeral_suma}${comp.funeral_costo ? ' (+' + comp.funeral_costo + ')' : ''}` : 'No incluido'],
    ['FORMA DE PAGO', comp.pago || 'Consultar con asesor']
  ];

  const colW = leftW / 2;
  const gridY = topY + 32;
  beneficios.forEach(([label, val], i) => {
    const colX = padX + (i % 2) * colW;
    const rowY = gridY + Math.floor(i / 2) * 26;
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(6).text(label, colX, rowY, { width: colW - 8, lineBreak: false });
    doc.fillColor(COLORS.dark).font('Helvetica').fontSize(7.5).text(val, colX, rowY + 9, { width: colW - 8, height: 14 });
  });

  // Servicios incluidos (fila de indicadores)
  const servicios = [
    ['At. Situ+Med', comp.at_situ_medicamentos],
    ['Consultas', comp.consultas_medicas],
    ['Exámenes', comp.examenes_lab_imagenologia],
    ['Ambulancia', comp.ambulancia]
  ];
  const servY = gridY + 2 * 26 + 4;
  let sx = padX;
  const servW = leftW / servicios.length;
  servicios.forEach(([label, val]) => {
    const incluido = val && String(val).trim() !== '' && String(val).toUpperCase() !== 'NO';
    doc.circle(sx + 3, servY + 4, 2.7).fill(incluido ? COLORS.success : '#cbd5e1');
    doc.fillColor(incluido ? COLORS.dark : '#94a3b8').font('Helvetica').fontSize(6).text(label, sx + 9, servY, { width: servW - 9, lineBreak: false });
    sx += servW;
  });

  // Caja de prima anual
  const priceX = x + width - priceBoxW - 12;
  const priceY = y + 10;
  const priceH = height - 20;
  doc.roundedRect(priceX, priceY, priceBoxW, priceH, 4).fill(isBest ? '#dbeafe' : COLORS.lightBg);
  doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(6.5).text('PRIMA ANUAL', priceX, priceY + 12, { width: priceBoxW, align: 'center', lineBreak: false });
  doc.fillColor(isBest ? COLORS.success : COLORS.primary).font('Helvetica-Bold').fontSize(17)
     .text(comp.prima ? `$${Number(comp.prima).toLocaleString('en-US')}` : 'N/D', priceX, priceY + 24, { width: priceBoxW, align: 'center', lineBreak: false });
  
  const numDeps = comp.desglosePrimas ? comp.desglosePrimas.length - 1 : 0;
  const labelDeps = numDeps > 0 ? `(titular + ${numDeps} dep.)` : 'por año';
  doc.fillColor('#94a3b8').font('Helvetica').fontSize(6.5).text(labelDeps, priceX, priceY + 46, { width: priceBoxW, align: 'center', lineBreak: false });

  doc.moveTo(priceX + 14, priceY + priceH - 26).lineTo(priceX + priceBoxW - 14, priceY + priceH - 26).lineWidth(0.5).strokeColor(COLORS.border).stroke();
  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(7).text(`Score: ${comp.calidadScore ?? 0}/50`, priceX, priceY + priceH - 18, { width: priceBoxW, align: 'center', lineBreak: false });
}

/**
 * Dibuja un sector (slice) de un gráfico de torta usando aproximación poligonal
 */
function dibujarSectorTorta(doc, cx, cy, radius, startAngle, endAngle, color) {
  const steps = Math.max(2, Math.ceil(((endAngle - startAngle) / (Math.PI / 90))));
  doc.moveTo(cx, cy);
  for (let i = 0; i <= steps; i++) {
    const a = startAngle + (endAngle - startAngle) * (i / steps);
    doc.lineTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
  }
  doc.closePath();
  doc.fillAndStroke(color, '#ffffff');
}

/**
 * Dibuja el gráfico de torta de distribución de protección financiera + leyenda
 */
function dibujarGraficoDistribucion(doc, cx, cy, radius, legendX, legendY) {
  const datos = [
    { label: 'Seguro de Salud', pct: 20, color: '#2563eb', grupo: 'Vida y Salud' },
    { label: 'Seguro de Vida', pct: 30, color: '#93c5fd', grupo: 'Vida y Salud' },
    { label: 'Seguro Patrimonial', pct: 25, color: COLORS.amber },
    { label: 'Responsabilidad Civil', pct: 25, color: COLORS.success }
  ];

  let angle = -Math.PI / 2; // Comenzar en las 12
  datos.forEach(d => {
    const span = (d.pct / 100) * Math.PI * 2;
    dibujarSectorTorta(doc, cx, cy, radius, angle, angle + span, d.color);
    angle += span;
  });

  // Leyenda
  let ly = legendY;
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(8).text('SEGURO DE VIDA Y SALUD — 50%', legendX, ly, { lineBreak: false });
  ly += 13;
  [datos[0], datos[1]].forEach(d => {
    doc.rect(legendX + 10, ly + 1, 8, 8).fill(d.color);
    doc.fillColor(COLORS.dark).font('Helvetica').fontSize(7.5).text(`${d.label} — ${d.pct}%`, legendX + 24, ly, { lineBreak: false });
    ly += 14;
  });
  ly += 4;
  [datos[2], datos[3]].forEach(d => {
    doc.rect(legendX, ly + 1, 8, 8).fill(d.color);
    doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(8).text(`${d.label} — ${d.pct}%`, legendX + 14, ly - 1, { lineBreak: false });
    ly += 16;
  });

  return ly;
}

/**
 * Dibuja el PDF estructurado en varias páginas
 */
function dibujarPdf(doc, cliente, edad, sumaAsegurada, comparativas, asesor) {
  const logoPath = getLogoPath();
  const sumaFormateada = `$${Number(sumaAsegurada).toLocaleString('en-US')}`;

  // ==========================================
  // PÁGINA 1: DATOS DEL ASEGURADO + TARJETAS DE PLANES
  // ==========================================
  dibujarHeader(doc, logoPath, `DIAGNÓSTICO (SUMA ASEGURADA ${sumaFormateada})`);

  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(11)
     .text(`DIAGNÓSTICO Y COMPARATIVA DE SEGUROS DE SALUD (SUMA ASEGURADA ${sumaFormateada})`, MARGIN, 75, { lineBreak: false });

  dibujarDatosAsegurado(doc, cliente, edad, sumaFormateada);

  const hasDeps = cliente.dependientes && cliente.dependientes.length > 0;
  const depLines = hasDeps ? Math.ceil(cliente.dependientes.length / 2) : 0;
  const boxH = 70 + depLines * 14;

  const titleY = 92 + boxH + 12;
  const subtitleY = titleY + 12;
  const startCardsY = subtitleY + 16;

  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(9.5)
     .text('Tu Comparativo Personalizado de Aseguradoras', MARGIN, titleY, { lineBreak: false });
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7)
     .text('Cada tarjeta resume el plan, la prima anual y los beneficios adicionales ofrecidos para la edad y suma asegurada cotizadas.', MARGIN, subtitleY, { width: CONTENT_W, lineBreak: false });

  let cardY = startCardsY;
  const cardH = 140;
  const cardGap = 14;

  comparativas.forEach((comp) => {
    if (cardY + cardH > FOOTER_Y - 20) {
      doc.addPage();
      dibujarHeader(doc, logoPath, 'DIAGNÓSTICO (CONTINUACIÓN)');
      cardY = 80;
    }
    dibujarTarjetaAseguradora(doc, MARGIN, cardY, CONTENT_W, cardH, comp, !!comp.recomendada);
    cardY += cardH + cardGap;
  });

  // ==========================================
  // PÁGINA: SECCIÓN DE MARKETING / DISTRIBUCIÓN DE PROTECCIÓN
  // ==========================================
  doc.addPage();
  dibujarHeader(doc, logoPath, 'PROTEGE TODO TU PATRIMONIO');

  let mktY = 78;
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(15)
     .text('¿Sabías que un seguro de salud es solo una parte de tu protección?', MARGIN, mktY, { width: CONTENT_W });
  mktY += 34;
  doc.fillColor(COLORS.dark).font('Helvetica').fontSize(8.5)
     .text('Una protección financiera completa cubre tu salud y tu vida, pero también tu patrimonio (vivienda, vehículo, negocio) y tu responsabilidad ante terceros. Mira cómo se distribuye una cobertura integral recomendada por JKA Consultores:', MARGIN, mktY, { width: CONTENT_W });
  mktY += 46;

  const chartCx = MARGIN + 90;
  const chartCy = mktY + 85;
  const chartRadius = 78;
  dibujarGraficoDistribucion(doc, chartCx, chartCy, chartRadius, MARGIN + 210, mktY + 20);

  const calloutY = mktY + 180;
  doc.roundedRect(MARGIN, calloutY, CONTENT_W, 42, 6).fill('#fff7ed');
  doc.roundedRect(MARGIN, calloutY, CONTENT_W, 42, 6).stroke('#fed7aa');
  doc.fillColor('#9a3412').font('Helvetica-Bold').fontSize(8.5)
     .text('¡ATENCIÓN! HOY SOLO ESTÁS CUBRIENDO EL 20% DE TU PROTECCIÓN FINANCIERA IDEAL', MARGIN + 12, calloutY + 8, { width: CONTENT_W - 24, lineBreak: false });
  doc.fillColor(COLORS.dark).font('Helvetica').fontSize(7.5)
     .text('Con un seguro de Salud contratado, aún te falta cubrir Vida, Patrimonio y Responsabilidad Civil. Conversa con tu asesor JKA para armar un plan a tu medida.', MARGIN + 12, calloutY + 20, { width: CONTENT_W - 24 });

  let boxesY = calloutY + 56;
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(9.5)
     .text('Conoce los seguros que completan tu protección', MARGIN, boxesY, { lineBreak: false });
  boxesY += 16;

  const productos = [
    { titulo: 'Seguro de Vida (30%)', color: '#93c5fd', desc: 'Garantiza estabilidad económica a tu familia ante un imprevisto, cubriendo deudas, educación y gastos del hogar.' },
    { titulo: 'Seguro Patrimonial (25%)', color: COLORS.amber, desc: 'Protege tu vivienda, vehículo o negocio ante incendios, robos, daños o desastres naturales.' },
    { titulo: 'Responsabilidad Civil (25%)', color: COLORS.success, desc: 'Te respalda ante reclamos por daños a terceros, evitando que un accidente comprometa tu patrimonio.' }
  ];

  const boxW = (CONTENT_W - 2 * 14) / 3;
  productos.forEach((p, i) => {
    const bx = MARGIN + i * (boxW + 14);
    doc.roundedRect(bx, boxesY, boxW, 82, 5).fill(COLORS.lightBg);
    doc.roundedRect(bx, boxesY, boxW, 82, 5).stroke(COLORS.border);
    doc.rect(bx, boxesY, 4, 82).fill(p.color);
    doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(7.5).text(p.titulo, bx + 12, boxesY + 10, { width: boxW - 20 });
    doc.fillColor(COLORS.dark).font('Helvetica').fontSize(6.8).text(p.desc, bx + 12, boxesY + 26, { width: boxW - 20, height: 50 });
  });

  // ==========================================
  // PÁGINA: CONDICIONES Y CONTACTO
  // ==========================================
  doc.addPage();
  dibujarHeader(doc, logoPath, 'CONDICIONES Y CONTACTO');

  let condY = 80;

  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(9.5)
     .text('Consideraciones Técnicas del Análisis', MARGIN, condY, { lineBreak: false });
  condY += 16;

  const features = [
    { title: 'Suma Asegurada:', desc: `Esta cotización refleja la suma asegurada de ${sumaFormateada} seleccionada. Cambiar la suma asegurada puede variar la prima y los beneficios disponibles.` },
    { title: 'Maternidad y Asistencia Internacional:', desc: 'Cuando aparecen como "No incluida", la aseguradora no ofrece ese beneficio para el plan y edad cotizados; de estar disponibles, se indica el límite de cobertura y su costo anual adicional.' },
    { title: 'Condiciones de Pago:', desc: 'Varían según la aseguradora (contado, semestral, trimestral o mensual). Consulte con su asesor las condiciones exactas antes de formalizar la contratación.' }
  ];

  features.forEach(item => {
    doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(8).text(item.title, MARGIN, condY, { lineBreak: false });
    doc.fillColor(COLORS.dark).font('Helvetica').fontSize(7.5).text(item.desc, MARGIN, condY + 10, { width: CONTENT_W });
    condY += 32;
  });

  condY += 4;

  // Nota de Asesoría
  doc.rect(MARGIN, condY, CONTENT_W, 40).fill('#fff3cd');
  doc.rect(MARGIN, condY, CONTENT_W, 40).stroke('#ffeeba');
  doc.fillColor('#856404').font('Helvetica-Bold').fontSize(7.5).text('NOTA DE ASESORÍA:', MARGIN + 8, condY + 6, { lineBreak: false });
  doc.font('Helvetica').fontSize(7)
     .text('Los precios aquí reflejados son de carácter informativo e ilustrativo y pueden cambiar según la cantidad definitiva de asegurados y regulaciones de la SUDEASEG. Comuníquese con su asesor asignado para formalizar la contratación.', MARGIN + 8, condY + 16, { width: CONTENT_W - 16 });

  condY += 52;

  // Contacta a tu asesor
  doc.roundedRect(MARGIN, condY, CONTENT_W, 60, 6).fill('#eff6ff');
  doc.roundedRect(MARGIN, condY, CONTENT_W, 60, 6).stroke('#bfdbfe');
  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(9).text('CONTACTA A TU ASESOR JKA', MARGIN + 12, condY + 8, { lineBreak: false });

  if (asesor && asesor.nombre) {
    doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(8).text(asesor.nombre, MARGIN + 12, condY + 24, { lineBreak: false });
    doc.font('Helvetica').fontSize(7.5)
       .text(`Tel/WhatsApp: ${asesor.telefono || 'N/A'}   |   Correo: ${asesor.correo || 'N/A'}`, MARGIN + 12, condY + 36, { lineBreak: false });
    doc.fillColor(COLORS.muted).fontSize(7).text('Escríbele hoy mismo para resolver tus dudas y contratar la mejor opción para ti.', MARGIN + 12, condY + 48, { lineBreak: false });
  } else {
    doc.fillColor(COLORS.dark).font('Helvetica').fontSize(7.5)
       .text('Comunícate con JKA Consultores al +58 412-1234567 o escríbenos a contacto@jkaseguros.com para ser atendido por uno de nuestros asesores certificados.', MARGIN + 12, condY + 26, { width: CONTENT_W - 24 });
  }

  condY += 74;

  // Bloque de Firma y Emisión JKA
  doc.rect(MARGIN, condY, CONTENT_W, 55).fill(COLORS.lightBg);
  doc.rect(MARGIN, condY, CONTENT_W, 55).stroke(COLORS.border);

  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(8)
     .text('Documento Emitido Por:', MARGIN + 12, condY + 8, { lineBreak: false });

  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(8.5)
     .text('JKA Consultores C.A.', MARGIN + 12, condY + 20, { lineBreak: false });
  doc.font('Helvetica').fontSize(7)
     .text('Departamento de Asesoría y Cotizaciones', MARGIN + 12, condY + 30, { lineBreak: false })
     .text('Caracas, Venezuela | www.jkaseguros.com', MARGIN + 12, condY + 40, { lineBreak: false });

  doc.lineWidth(1).strokeColor(COLORS.primary).moveTo(370, condY + 35).lineTo(510, condY + 35).stroke();
  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(7.5)
     .text('Firma y Sello Autorizado', 370, condY + 40, { align: 'center', width: 140, lineBreak: false });

  // ==========================================
  // PIE DE PÁGINA GLOBAL DE TODAS LAS PÁGINAS
  // ==========================================
  const totalPages = doc.bufferedPageRange().count;
  const brokerFooterLine = BROKER_INFO_LINES.join(' | ');
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    doc.fillColor(COLORS.muted).fontSize(6.5).font('Helvetica')
       .text(brokerFooterLine, MARGIN, FOOTER_Y - 9, { align: 'center', width: CONTENT_W, lineBreak: false });
    doc.fontSize(7)
       .text(`Página ${i + 1} de ${totalPages} | Documento emitido por JKA Consultores C.A.`, MARGIN, FOOTER_Y, { align: 'center', width: CONTENT_W, lineBreak: false });
  }
}

/**
 * Genera un PDF de cotización comparativa para transmitir en respuesta Express
 */
export function generarPdfCotizacion(res, cliente, edad, sumaAsegurada, comparativas, asesor) {
  const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=cotizacion_jka_${cliente.nro_documento}.pdf`);
  doc.pipe(res);

  dibujarPdf(doc, cliente, edad, sumaAsegurada, comparativas, asesor);

  doc.end();
}

/**
 * Genera un PDF en memoria y retorna un Buffer
 * @returns {Promise<Buffer>}
 */
export function generarPdfBuffer(cliente, edad, sumaAsegurada, comparativas, asesor) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    dibujarPdf(doc, cliente, edad, sumaAsegurada, comparativas, asesor);

    doc.end();
  });
}
