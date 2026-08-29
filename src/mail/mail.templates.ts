import { layout } from './mail.layout';

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
 * Cada correo va con HTML **y** texto plano, y el texto plano no es un resumen:
 * dice lo mismo. Hay clientes que no muestran HTML y filtros que penalizan los
 * mensajes que sólo lo traen.
 *
 * La maqueta vive en `mail.layout.ts` junto con las razones de cada regla.
 */

export type Locale = 'es' | 'en';

export type Mail = { subject: string; text: string; html: string };

/**
 * Mismo criterio que el panel: `$` y no el código de moneda, y sin centavos
 * cuando el importe es redondo. Un correo que dice "$495.00" al lado de un
 * panel que dice "$495" hace dudar de cuál es el número bueno.
 */
function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('es-PA', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

/** Fecha legible sin depender del cliente de correo. */
function day(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-PA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00.000Z`));
}

// --- Recuperación de contraseña ---------------------------------------------

export function passwordReset(link: string, locale: Locale = 'es'): Mail {
  const brand = 'Daughters of Sun';

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
      html: layout({
        preheader: 'The link works once and expires in an hour.',
        brand,
        eyebrow: 'Management system',
        accent: 'palm',
        title: 'Choose a new password',
        paragraphs: [
          'Someone asked to reset the password for this account. If it was you, use the button below.',
        ],
        action: { label: 'Choose a new password', url: link },
        note: 'The link works once and expires in an hour. If it was not you, ignore this message — nothing changed.',
        footer: [brand, 'David, Chiriquí · Panama'],
      }),
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
    html: layout({
      preheader: 'El enlace sirve una sola vez y vence en una hora.',
      brand,
      eyebrow: 'Sistema de gestión',
      accent: 'palm',
      title: 'Elegí una contraseña nueva',
      paragraphs: [
        'Alguien pidió restablecer la contraseña de esta cuenta. Si fuiste vos, usá el botón de abajo.',
      ],
      action: { label: 'Elegir una contraseña nueva', url: link },
      note: 'El enlace sirve una sola vez y vence en una hora. Si no fuiste vos, ignorá este mensaje — no cambió nada.',
      footer: [brand, 'David, Chiriquí · Panamá'],
    }),
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

function detailsFor(data: BookingMailData, locale: Locale) {
  const total = money(data.totalMinor, data.currency);
  const nights =
    locale === 'en'
      ? `${data.nights} ${data.nights === 1 ? 'night' : 'nights'}`
      : `${data.nights} ${data.nights === 1 ? 'noche' : 'noches'}`;

  return locale === 'en'
    ? [
        { label: 'Room', value: data.unitTypeName },
        { label: 'Check-in', value: `${day(data.checkIn, locale)} · from 15:00` },
        { label: 'Check-out', value: `${day(data.checkOut, locale)} · until 11:00` },
        { label: 'Nights', value: nights },
        { label: 'Total', value: total, strong: true },
      ]
    : [
        { label: 'Habitación', value: data.unitTypeName },
        { label: 'Entrada', value: `${day(data.checkIn, locale)} · desde las 15:00` },
        { label: 'Salida', value: `${day(data.checkOut, locale)} · hasta las 11:00` },
        { label: 'Noches', value: nights },
        { label: 'Total', value: total, strong: true },
      ];
}

/**
 * Solicitud recibida.
 *
 * **No dice "reserva confirmada" en ninguna parte**, y es la decisión más
 * importante de este archivo — hay un test que la protege en los dos idiomas.
 * Sin pagos, lo que el huésped tiene es una solicitud que el hotel todavía
 * puede rechazar. Un correo que diga otra cosa deja a alguien viajando a
 * Chiriquí con una habitación que nadie le apartó.
 *
 * Por eso la franja va en amarillo y no en verde: el color dice "esperá" antes
 * de que se lea una palabra.
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
        `Dates:     ${day(data.checkIn, locale)} to ${day(data.checkOut, locale)} (${data.nights} nights)`,
        `Estimated: ${total}`,
        '',
        'We are holding the room for 48 hours while the hotel replies.',
        data.propertyName,
      ].join('\n'),
      html: layout({
        preheader: 'Not confirmed yet — the hotel replies within 48 hours.',
        brand: data.propertyName,
        eyebrow: 'Request received',
        accent: 'butter',
        title: `Thank you, ${data.guestName}`,
        paragraphs: [
          'We received your booking request and passed it to the hotel.',
          'We are holding the room for 48 hours while they reply.',
        ],
        callout:
          'This is not a confirmed booking yet — the hotel reviews it and writes back to confirm and arrange payment.',
        reference: { label: 'Your reference', value: data.reference },
        details: detailsFor(data, locale),
        note: 'The total is an estimate and includes tax. Keep this reference — you will need it if you write to us.',
        footer: [data.propertyName, 'David, Chiriquí · Panama'],
      }),
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
      `Fechas:     ${day(data.checkIn, locale)} al ${day(data.checkOut, locale)} (${data.nights} noches)`,
      `Estimado:   ${total}`,
      '',
      'Apartamos la habitación 48 horas mientras el hotel responde.',
      data.propertyName,
    ].join('\n'),
    html: layout({
      preheader: 'Todavía no está confirmada — el hotel responde en 48 horas.',
      brand: data.propertyName,
      eyebrow: 'Solicitud recibida',
      accent: 'butter',
      title: `Gracias, ${data.guestName}`,
      paragraphs: [
        'Recibimos tu solicitud de reserva y se la pasamos al hotel.',
        'Apartamos la habitación 48 horas mientras responden.',
      ],
      callout:
        'Todavía no es una reserva confirmada: el hotel la revisa y te escribe para confirmarla y coordinar el pago.',
      reference: { label: 'Tu referencia', value: data.reference },
      details: detailsFor(data, locale),
      note: 'El total es estimado e incluye el ITBMS. Guardá esta referencia: te la vamos a pedir si nos escribís.',
      footer: [data.propertyName, 'David, Chiriquí · Panamá'],
    }),
  };
}

/** Ahora sí: el hotel la aceptó. Franja verde. */
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
        `Dates:     ${day(data.checkIn, locale)} to ${day(data.checkOut, locale)} (${data.nights} nights)`,
        `Total:     ${total}`,
        '',
        'Check-in from 15:00, check-out until 11:00.',
        'Reply to this email if anything changes.',
        data.propertyName,
      ].join('\n'),
      html: layout({
        preheader: `Confirmed · ${day(data.checkIn, locale)} → ${day(data.checkOut, locale)}`,
        brand: data.propertyName,
        eyebrow: 'Confirmed',
        accent: 'palm',
        title: `See you soon, ${data.guestName}`,
        paragraphs: [
          'Your booking is confirmed. We look forward to having you.',
        ],
        reference: { label: 'Your reference', value: data.reference },
        details: detailsFor(data, locale),
        note: 'Reply to this email if anything changes — a delayed flight, an extra guest, an earlier arrival.',
        footer: [data.propertyName, 'David, Chiriquí · Panama'],
      }),
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
      `Fechas:     ${day(data.checkIn, locale)} al ${day(data.checkOut, locale)} (${data.nights} noches)`,
      `Total:      ${total}`,
      '',
      'Check-in desde las 15:00, check-out hasta las 11:00.',
      'Respondé este correo si algo cambia.',
      data.propertyName,
    ].join('\n'),
    html: layout({
      preheader: `Confirmada · ${day(data.checkIn, locale)} → ${day(data.checkOut, locale)}`,
      brand: data.propertyName,
      eyebrow: 'Confirmada',
      accent: 'palm',
      title: `Te esperamos, ${data.guestName}`,
      paragraphs: ['Tu reserva está confirmada. Te esperamos.'],
      reference: { label: 'Tu referencia', value: data.reference },
      details: detailsFor(data, locale),
      note: 'Respondé este correo si algo cambia: un vuelo demorado, un huésped más, una llegada más temprano.',
      footer: [data.propertyName, 'David, Chiriquí · Panamá'],
    }),
  };
}

/**
 * Cancelada.
 *
 * Sin explicar por qué: la cancelación puede ser del huésped, del hotel o el
 * vencimiento de una retención, y el sistema no distingue. Inventar un motivo
 * es peor que no darlo — el huésped llama igual, pero además desconfiando.
 *
 * Franja gris y no roja: no es una alarma, y un correo que grita cuando alguien
 * canceló su propio viaje es de mal gusto.
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
        `Booking ${data.reference} (${day(data.checkIn, locale)} to ${day(data.checkOut, locale)}) was cancelled.`,
        '',
        'If this was not what you expected, reply to this email and we will sort it out.',
        data.propertyName,
      ].join('\n'),
      html: layout({
        preheader: `Booking ${data.reference} was cancelled.`,
        brand: data.propertyName,
        eyebrow: 'Cancelled',
        accent: 'muted',
        title: 'Your booking was cancelled',
        paragraphs: [
          `Hi ${data.guestName}, booking ${data.reference} was cancelled and the room is free again.`,
        ],
        details: [
          { label: 'Room', value: data.unitTypeName },
          {
            label: 'Dates',
            value: `${day(data.checkIn, locale)} → ${day(data.checkOut, locale)}`,
          },
        ],
        note: 'If this was not what you expected, reply to this email and we will sort it out.',
        footer: [data.propertyName, 'David, Chiriquí · Panama'],
      }),
    };
  }

  return {
    subject: `Se canceló tu reserva — ${data.reference}`,
    text: [
      `Hola ${data.guestName}:`,
      '',
      `La reserva ${data.reference} (${day(data.checkIn, locale)} al ${day(data.checkOut, locale)}) quedó cancelada.`,
      '',
      'Si no era lo que esperabas, respondé este correo y lo resolvemos.',
      data.propertyName,
    ].join('\n'),
    html: layout({
      preheader: `La reserva ${data.reference} quedó cancelada.`,
      brand: data.propertyName,
      eyebrow: 'Cancelada',
      accent: 'muted',
      title: 'Se canceló tu reserva',
      paragraphs: [
        `Hola ${data.guestName}: la reserva ${data.reference} quedó cancelada y la habitación volvió a estar disponible.`,
      ],
      details: [
        { label: 'Habitación', value: data.unitTypeName },
        {
          label: 'Fechas',
          value: `${day(data.checkIn, locale)} → ${day(data.checkOut, locale)}`,
        },
      ],
      note: 'Si no era lo que esperabas, respondé este correo y lo resolvemos.',
      footer: [data.propertyName, 'David, Chiriquí · Panamá'],
    }),
  };
}
