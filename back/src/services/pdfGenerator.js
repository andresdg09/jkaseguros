import PDFDocument from 'pdfkit';

/**
 * Genera un PDF de cotización comparativa para el cliente
 * @param {Object} res Response object de Express
 * @param {Object} cliente Datos del cliente
 * @param {number} edad Edad calculada del cliente
 * @param {string} tipoCobertura 'colectivo' o 'individual'
 * @param {Array} comparativas Lista de cotizaciones por compañía
 */
export function generarPdfCotizacion(res, cliente, edad, tipoCobertura, comparativas) {
  const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });

  // Transmitir el PDF directamente en la respuesta HTTP
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=cotizacion_jka_${cliente.nro_documento}.pdf`);
  doc.pipe(res);

  // Colores corporativos (Teal & Dark Slate)
  const primaryColor = '#005f73';
  const secondaryColor = '#0a9396';
  const darkColor = '#2b2d42';
  const lightColor = '#f4f6f8';
  const accentColor = '#e76f51';

  // 1. Encabezado / Logo
  doc.rect(0, 0, 595, 110).fill(primaryColor);
  
  doc.fillColor('#ffffff')
     .font('Helvetica-Bold')
     .fontSize(22)
     .text('JKA SEGUROS', 50, 30);
     
  doc.fontSize(10)
     .font('Helvetica')
     .text('Cotizaciones de Seguros en Venezuela', 50, 55)
     .text('Dirección: Caracas, Venezuela | Tel: +58 412-1234567 | Web: www.jkaseguros.com', 50, 75);

  // 2. Título de la Cotización
  doc.fillColor(darkColor)
     .font('Helvetica-Bold')
     .fontSize(16)
     .text(`DIAGNÓSTICO Y COMPARATIVA DE SEGUROS DE SALUD (${tipoCobertura.toUpperCase()})`, 50, 130);

  // 3. Datos del Asegurado (Cuadro de información)
  doc.rect(50, 160, 495, 80).fill(lightColor);
  doc.rect(50, 160, 495, 80).stroke('#d8dee9');

  const col1X = 65;
  const col2X = 320;
  
  doc.fillColor(darkColor).font('Helvetica-Bold').fontSize(9);
  
  // Fila 1
  doc.text('Asegurado:', col1X, 175).font('Helvetica').text(`${cliente.primer_nombre} ${cliente.primer_apellido}`, col1X + 70, 175);
  doc.font('Helvetica-Bold').text('Documento:', col2X, 175).font('Helvetica').text(`${cliente.tipo_documento}-${cliente.nro_documento}`, col2X + 80, 175);
  
  // Fila 2
  doc.font('Helvetica-Bold').text('F. Nacimiento:', col1X, 195).font('Helvetica').text(new Date(cliente.fecha_nacimiento).toLocaleDateString('es-VE'), col1X + 70, 195);
  doc.font('Helvetica-Bold').text('Edad:', col2X, 195).font('Helvetica').text(`${edad} años`, col2X + 80, 195);

  // Fila 3
  doc.font('Helvetica-Bold').text('Teléfono:', col1X, 215).font('Helvetica').text(`${cliente.codigo_area}-${cliente.numero_celular}`, col1X + 70, 215);
  doc.font('Helvetica-Bold').text('Fecha Cotización:', col2X, 215).font('Helvetica').text(new Date().toLocaleDateString('es-VE'), col2X + 90, 215);

  // 4. Sección de Cuadro Comparativo
  doc.fillColor(primaryColor)
     .font('Helvetica-Bold')
     .fontSize(12)
     .text('Tarifas Estimadas y Características Generales de Cobertura', 50, 260);

  // Dibujar tabla comparativa
  let currentY = 285;

  // Encabezados de columna
  doc.rect(50, currentY, 495, 20).fill(primaryColor);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
  doc.text('Compañía de Seguros', 55, currentY + 6);
  doc.text('Suma Asegurada', 180, currentY + 6);
  doc.text('Deducible', 270, currentY + 6);
  doc.text('Maternidad', 330, currentY + 6);
  doc.text('Plazo Espera', 410, currentY + 6);
  doc.text('Prima Anual', 485, currentY + 6);

  currentY += 20;

  // Filas de compañías
  comparativas.forEach((comp, index) => {
    // Alternar color de fondo
    if (index % 2 === 0) {
      doc.rect(50, currentY, 495, 30).fill('#ffffff');
    } else {
      doc.rect(50, currentY, 495, 30).fill(lightColor);
    }
    
    // Dibujar línea inferior
    doc.lineWidth(0.5).strokeColor('#d8dee9').moveTo(50, currentY + 30).lineTo(545, currentY + 30).stroke();

    doc.fillColor(darkColor).font('Helvetica-Bold').fontSize(8);
    doc.text(comp.nombre, 55, currentY + 11);
    
    doc.font('Helvetica').fontSize(7.5);
    
    // Suma Salud
    const sumaSalud = tipoCobertura === 'colectivo' ? comp.col_suma_salud : comp.ind_suma_salud;
    doc.text(sumaSalud || 'Consultar', 180, currentY + 11, { width: 85 });

    // Deducible
    const deduc = tipoCobertura === 'colectivo' ? comp.col_deducible : comp.ind_deducible;
    doc.text(deduc || '$0', 270, currentY + 11);

    // Maternidad
    const mat = tipoCobertura === 'colectivo' ? comp.col_maternidad : comp.ind_maternidad;
    const matSuma = tipoCobertura === 'colectivo' ? comp.col_suma_maternidad : comp.ind_deducible_maternidad;
    const matText = matSuma && matSuma !== '-' ? `${mat} (${matSuma})` : mat;
    doc.text(matText || 'Opcional', 330, currentY + 11, { width: 75 });

    // Espera
    const espera = tipoCobertura === 'colectivo' ? comp.col_espera_inicial : comp.ind_espera_vzla;
    doc.text(espera || 'No aplica', 410, currentY + 11, { width: 70 });

    // Prima Anual
    doc.fillColor(comp.prima ? accentColor : '#a0aec0')
       .font('Helvetica-Bold')
       .fontSize(9.5);
    
    const primaText = comp.prima ? `$${parseFloat(comp.prima).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'No disp.';
    doc.text(primaText, 485, currentY + 11);

    currentY += 30;
  });

  currentY += 15;

  // Nueva página para detalles técnicos importantes
  doc.addPage();

  // Encabezado simplificado
  doc.rect(0, 0, 595, 60).fill(primaryColor);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text('JKA SEGUROS - DETALLES ADICIONALES', 50, 22);

  let detailY = 90;

  doc.fillColor(darkColor).font('Helvetica-Bold').fontSize(12).text('Consideraciones Técnicas del Análisis:', 50, detailY);
  detailY += 20;

  const features = [
    { title: 'Exámenes de Admisión:', desc: 'Para pólizas colectivas, la mayoría de compañías no exige exámenes de admisión. Para individuales, es requerido a partir de los 54 años (Hispanas, Universitas, Caracas, Occidental) o 60 años (Mercantil).' },
    { title: 'Cobertura Inmediata:', desc: 'Mercantil ofrece cobertura inmediata hasta $2,000; Universitas y Seguros Caracas cubren hasta el 100% de la Suma Asegurada de manera inmediata ante emergencias médicas en colectivos.' },
    { title: 'Asistencia en Viajes (Internacional):', desc: 'Mercantil y Universitas incluyen la cobertura internacional en colectivos. Pirámides e Hispanas la ofrecen como opcional con prima adicional.' },
    { title: 'Condiciones de Pago:', desc: 'Las condiciones de pago varían por aseguradora. Mercantil destaca por ofrecer financiamiento del 40% de inicial más 6 cuotas. Otras compañías exigen pago de contado o trimestral/semestral.' },
  ];

  features.forEach(item => {
    doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(9.5).text(item.title, 50, detailY);
    doc.fillColor(darkColor).font('Helvetica').fontSize(8.5).text(item.desc, 50, detailY + 13, { width: 495 });
    detailY += 45;
  });

  // Nota de descargo
  doc.rect(50, detailY + 10, 495, 55).fill('#fff3cd');
  doc.rect(50, detailY + 10, 495, 55).stroke('#ffeeba');
  doc.fillColor('#856404').font('Helvetica-Bold').fontSize(8.5).text('NOTA DE ASESORÍA:', 60, detailY + 20);
  doc.font('Helvetica').text('Los precios aquí reflejados son de carácter informativo e ilustrativo y pueden cambiar según la cantidad de asegurados definitiva y las regulaciones de la SUDEASEG. Comuníquese con su asesor asignado para formalizar la contratación.', 60, detailY + 32, { width: 475 });

  // Pie de página en todas las páginas
  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    doc.fillColor('#718096').fontSize(7.5).font('Helvetica')
       .text(`Página ${i + 1} de ${totalPages} | Documento emitido por JKA Seguros C.A.`, 50, 800, { align: 'center', width: 495 });
  }

  doc.end();
}
