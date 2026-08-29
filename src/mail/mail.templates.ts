/**
 * Los cuatro correos que el sistema necesita hoy.
 *
 * Plantillas en español e inglés. El idioma sale de `Guest.locale`, que se
 * guarda cuando alguien reserva desde el sitio — el único momento en que el
 * sistema lo sabe. Cae a español cuando la reserva la cargó el personal.
 *
 * Sin ese campo, una huésped que reservaba en inglés recibía la solicitud en
 * inglés y la confirmación en español. Se vio en una prueba real antes de que
 * llegara a nadie.
 *
 * El HTML es deliberadamente pobre: tablas no, CSS externo no, imágenes no. Los
 * clientes de correo son un pantano —Outlook renderiza con Word— y un correo
 * transaccional que no se lee vale menos que uno feo que sí. El texto plano dice
 * exactamente lo mismo, no es un resumen.
 */

export type Locale = 'es' | 'en';

export type Mail = { subject: string; text: string; html: string };

/** Envoltura mínima común. Sin logo: la marca todavía no existe. */
function wrap(bodyHtml: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1c1c1a;max-width:520px">
${bodyHtml}
</div>`;
}

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('es-PA', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(amountMinor / 100);
}

// --- Recuperación de contraseña ---------------------------------------------

export function passwordReset(
  link: string,
  locale: Locale = 'es',
): Mail {
  if (locale === 'en') {
    return {
      subject: 'Reset your password',
      text: [
        'Someone asked to reset the password for this account.',
        '',
        `Open this link to choose a new one: ${link}`,
        '',
        'The link works once and expires in an hour.',
        'If it was not you, ignore this message — nothing changed.',
      ].join('\n'),
      html: wrap(`
<p>Someone asked to reset the password for this account.</p>
<p><a href="${link}">Choose a new password</a></p>
<p style="color:#6b6b66;font-size:13px">The link works once and expires in an hour.<br>
If it was not you, ignore this message — nothing changed.</p>`),
    };
  }

  return {
    subject: 'Restablecer tu contraseña',
    text: [
      'Alguien pidió restablecer la contraseña de esta cuenta.',
      '',
      `Abrí este enlace para elegir una nueva: ${link}`,
      '',
      'El enlace sirve una sola vez y vence en una hora.',
      'Si no fuiste vos, ignorá este mensaje — no cambió nada.',
    ].join('\n'),
    html: wrap(`
<p>Alguien pidió restablecer la contraseña de esta cuenta.</p>
<p><a href="${link}">Elegir una contraseña nueva</a></p>
<p style="color:#6b6b66;font-size:13px">El enlace sirve una sola vez y vence en una hora.<br>
Si no fuiste vos, ignorá este mensaje — no cambió nada.</p>`),
  };
}

// --- Reservas ----------------------------------------------------------------

export type BookingMailData = {
  guestName: string;
  reference: string;
  propertyName: string;
  unitTypeName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalMinor: number;
  currency: string;
};

/**
 * Solicitud recibida.
 *
 * **No dice "reserva confirmada" en ninguna parte**, y es la decisión más
 * importante de este archivo: sin pagos, lo que el huésped tiene es una
 * solicitud que el hotel todavía puede rechazar. Un correo que diga otra cosa
 * deja a alguien viajando a Chiriquí con una habitación que nadie le apartó.
 */
export function bookingRequested(
  data: BookingMailData,
  locale: Locale = 'es',
): Mail {
  const total = money(data.totalMinor, data.currency);

  if (locale === 'en') {
    return {
      subject: `We received your request — ${data.reference}`,
      text: [
        `Hi ${data.guestName},`,
        '',
        'We received your booking request. This is not a confirmed booking yet:',
        'the hotel reviews it and writes back to confirm and arrange payment.',
        '',
        `Reference: ${data.reference}`,
        `Room:      ${data.unitTypeName}`,
        `Dates:     ${data.checkIn} to ${data.checkOut} (${data.nights} nights)`,
        `Estimated: ${total}`,
        '',
        'We are holding the room for 48 hours while the hotel replies.',
        data.propertyName,
      ].join('\n'),
      html: wrap(`
<p>Hi ${data.guestName},</p>
<p>We received your booking request. <strong>This is not a confirmed booking yet</strong>: the hotel reviews it and writes back to confirm and arrange payment.</p>
<p><strong>Reference ${data.reference}</strong><br>
${data.unitTypeName}<br>
${data.checkIn} → ${data.checkOut} · ${data.nights} nights<br>
Estimated total: ${total}</p>
<p style="color:#6b6b66;font-size:13px">We are holding the room for 48 hours while the hotel replies.<br>${data.propertyName}</p>`),
    };
  }

  return {
    subject: `Recibimos tu solicitud — ${data.reference}`,
    text: [
      `Hola ${data.guestName}:`,
      '',
      'Recibimos tu solicitud de reserva. Todavía no es una reserva confirmada:',
      'el hotel la revisa y te escribe para confirmarla y coordinar el pago.',
      '',
      `Referencia: ${data.reference}`,
      `Habitación: ${data.unitTypeName}`,
      `Fechas:     ${data.checkIn} al ${data.checkOut} (${data.nights} noches)`,
      `Estimado:   ${total}`,
      '',
      'Apartamos la habitación 48 horas mientras el hotel responde.',
      data.propertyName,
    ].join('\n'),
    html: wrap(`
<p>Hola ${data.guestName}:</p>
<p>Recibimos tu solicitud de reserva. <strong>Todavía no es una reserva confirmada</strong>: el hotel la revisa y te escribe para confirmarla y coordinar el pago.</p>
<p><strong>Referencia ${data.reference}</strong><br>
${data.unitTypeName}<br>
${data.checkIn} → ${data.checkOut} · ${data.nights} noches<br>
Total estimado: ${total}</p>
<p style="color:#6b6b66;font-size:13px">Apartamos la habitación 48 horas mientras el hotel responde.<br>${data.propertyName}</p>`),
  };
}

/** Ahora sí: el hotel la aceptó. */
export function bookingConfirmed(
  data: BookingMailData,
  locale: Locale = 'es',
): Mail {
  const total = money(data.totalMinor, data.currency);

  if (locale === 'en') {
    return {
      subject: `Your booking is confirmed — ${data.reference}`,
      text: [
        `Hi ${data.guestName},`,
        '',
        'Your booking is confirmed. We look forward to having you.',
        '',
        `Reference: ${data.reference}`,
        `Room:      ${data.unitTypeName}`,
        `Dates:     ${data.checkIn} to ${data.checkOut} (${data.nights} nights)`,
        `Total:     ${total}`,
        '',
        'Check-in from 15:00, check-out until 11:00.',
        'Reply to this email if anything changes.',
        data.propertyName,
      ].join('\n'),
      html: wrap(`
<p>Hi ${data.guestName},</p>
<p>Your booking is confirmed. We look forward to having you.</p>
<p><strong>Reference ${data.reference}</strong><br>
${data.unitTypeName}<br>
${data.checkIn} → ${data.checkOut} · ${data.nights} nights<br>
Total: ${total}</p>
<p style="color:#6b6b66;font-size:13px">Check-in from 15:00, check-out until 11:00.<br>
Reply to this email if anything changes.<br>${data.propertyName}</p>`),
    };
  }

  return {
    subject: `Tu reserva está confirmada — ${data.reference}`,
    text: [
      `Hola ${data.guestName}:`,
      '',
      'Tu reserva está confirmada. Te esperamos.',
      '',
      `Referencia: ${data.reference}`,
      `Habitación: ${data.unitTypeName}`,
      `Fechas:     ${data.checkIn} al ${data.checkOut} (${data.nights} noches)`,
      `Total:      ${total}`,
      '',
      'Check-in desde las 15:00, check-out hasta las 11:00.',
      'Respondé este correo si algo cambia.',
      data.propertyName,
    ].join('\n'),
    html: wrap(`
<p>Hola ${data.guestName}:</p>
<p>Tu reserva está confirmada. Te esperamos.</p>
<p><strong>Referencia ${data.reference}</strong><br>
${data.unitTypeName}<br>
${data.checkIn} → ${data.checkOut} · ${data.nights} noches<br>
Total: ${total}</p>
<p style="color:#6b6b66;font-size:13px">Check-in desde las 15:00, check-out hasta las 11:00.<br>
Respondé este correo si algo cambia.<br>${data.propertyName}</p>`),
  };
}

/**
 * Cancelada.
 *
 * Sin explicar por qué: la cancelación puede ser del huésped, del hotel o el
 * vencimiento de una retención, y el sistema no distingue. Inventar un motivo
 * en el correo es peor que no darlo — el huésped llama igual, pero además
 * desconfiando.
 */
export function bookingCancelled(
  data: BookingMailData,
  locale: Locale = 'es',
): Mail {
  if (locale === 'en') {
    return {
      subject: `Your booking was cancelled — ${data.reference}`,
      text: [
        `Hi ${data.guestName},`,
        '',
        `Booking ${data.reference} (${data.checkIn} to ${data.checkOut}) was cancelled.`,
        '',
        'If this was not what you expected, reply to this email and we will sort it out.',
        data.propertyName,
      ].join('\n'),
      html: wrap(`
<p>Hi ${data.guestName},</p>
<p>Booking <strong>${data.reference}</strong> (${data.checkIn} → ${data.checkOut}) was cancelled.</p>
<p style="color:#6b6b66;font-size:13px">If this was not what you expected, reply to this email and we will sort it out.<br>${data.propertyName}</p>`),
    };
  }

  return {
    subject: `Se canceló tu reserva — ${data.reference}`,
    text: [
      `Hola ${data.guestName}:`,
      '',
      `La reserva ${data.reference} (${data.checkIn} al ${data.checkOut}) quedó cancelada.`,
      '',
      'Si no era lo que esperabas, respondé este correo y lo resolvemos.',
      data.propertyName,
    ].join('\n'),
    html: wrap(`
<p>Hola ${data.guestName}:</p>
<p>La reserva <strong>${data.reference}</strong> (${data.checkIn} → ${data.checkOut}) quedó cancelada.</p>
<p style="color:#6b6b66;font-size:13px">Si no era lo que esperabas, respondé este correo y lo resolvemos.<br>${data.propertyName}</p>`),
  };
}
