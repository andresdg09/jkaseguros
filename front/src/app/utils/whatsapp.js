/**
 * Normaliza y formatea números telefónicos para WhatsApp (Venezuela código 58 y números internacionales)
 */
export function formatWhatsAppPhone(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/[^0-9]/g, '');
  if (!digits) return '';
  
  // Si empieza por 0 (ej. 04121234567, 0424..., 0414..., 0416..., 0212...), remover el 0 y anteponer 58
  if (digits.startsWith('0')) {
    digits = '58' + digits.substring(1);
  } else if (digits.length === 10 && (digits.startsWith('412') || digits.startsWith('414') || digits.startsWith('424') || digits.startsWith('416') || digits.startsWith('426') || digits.startsWith('212'))) {
    digits = '58' + digits;
  }
  
  return digits;
}

/**
 * Genera la URL universal oficial para WhatsApp
 */
export function createWhatsAppLink(phone, text) {
  const cleanPhone = formatWhatsAppPhone(phone);
  const encodedText = encodeURIComponent(text || '');
  if (cleanPhone) {
    return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
  }
  return `https://api.whatsapp.com/send?text=${encodedText}`;
}
