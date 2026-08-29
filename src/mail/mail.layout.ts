/**
 * La envoltura visual de todos los correos.
 *
 * Escribir HTML para correo no se parece a escribir HTML para la web, y las
 * reglas de acá no son gusto personal:
 *
 *  - **Tablas para maquetar.** Outlook renderiza con el motor de Word, que no
 *    entiende flexbox ni grid. Las tablas no son un vicio heredado: son la
 *    única caja que se comporta igual en los cuarenta clientes que existen.
 *  - **CSS en línea.** Gmail borra el `<style>` del `<head>` en varias de sus
 *    vistas. Un estilo que no está en el atributo `style` puede simplemente no
 *    existir.
 *  - **Sin webfonts.** No cargan en la mayoría de los clientes. Se usa una pila
 *    de fuentes del sistema con Georgia al frente, que pertenece al mismo
 *    género que la Newsreader del sitio, así que el correo se siente de la
 *    misma familia sin depender de una descarga.
 *  - **Sin imágenes.** Casi todos los clientes las bloquean por defecto, y un
 *    correo cuyo encabezado es una imagen bloqueada aparece vacío. Cuando
 *    Julius entregue el logo se puede sumar, pero el correo tiene que
 *    entenderse igual sin él.
 *  - **600 píxeles.** Es el ancho que entra en el panel de lectura de Outlook
 *    sin scroll horizontal.
 *
 * La paleta es la del sitio, convertida a hexadecimal: `oklch` no existe en
 * correo.
 */

const CREAM = '#fdfaf4';
const INK = '#15231a';
const PALM = '#2b5f43';
const PALM_DEEP = '#14291d';
const BUTTER = '#efc762';
const MUTED = '#6f7a72';
const LINE = '#e4ded1';

const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export type Accent = 'butter' | 'palm' | 'muted';

const ACCENT: Record<Accent, string> = {
  butter: BUTTER,
  palm: PALM,
  muted: MUTED,
};

export type LayoutInput = {
  /** Aparece junto al asunto en la bandeja, antes de abrir el correo. */
  preheader: string;
  /** Nombre del hotel, en la banda superior. */
  brand: string;
  /** Palabra de estado sobre el título: "Solicitud recibida", "Confirmada". */
  eyebrow: string;
  accent: Accent;
  title: string;
  /** Párrafos del cuerpo, ya en el idioma correcto. */
  paragraphs: string[];
  /**
   * Una sola frase destacada en un recuadro, cuando el correo tiene algo que
   * el huésped **no puede** pasar por alto.
   *
   * Existe por un caso concreto: "todavía no es una reserva confirmada" leído
   * como un párrafo más se saltea, y quien lo saltea aparece en la puerta del
   * hotel convencido de que tiene habitación.
   */
  callout?: string;
  /** Filas de la ficha: etiqueta y valor. */
  details?: { label: string; value: string; strong?: boolean }[];
  /** Referencia grande, si el correo la tiene. */
  reference?: { label: string; value: string };
  /** Botón. Sólo uno, porque un correo con dos acciones no tiene ninguna. */
  action?: { label: string; url: string };
  /** Nota final en letra chica. */
  note?: string;
  footer: string[];
};

const escape = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function layout(input: LayoutInput): string {
  const accent = ACCENT[input.accent];

  const detailRows = (input.details ?? [])
    .map(
      (row, index) => `
              <tr>
                <td style="padding:${index === 0 ? '0' : '10px'} 0 10px;border-top:${index === 0 ? 'none' : `1px solid ${LINE}`};font-family:${SANS};font-size:14px;color:${MUTED};">${escape(row.label)}</td>
                <td align="right" style="padding:${index === 0 ? '0' : '10px'} 0 10px;border-top:${index === 0 ? 'none' : `1px solid ${LINE}`};font-family:${SANS};font-size:14px;color:${INK};${row.strong ? 'font-weight:700;' : ''}">${escape(row.value)}</td>
              </tr>`,
    )
    .join('');

  const calloutBlock = input.callout
    ? `
          <tr>
            <td style="padding:0 32px 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fdf4dd;border-left:3px solid ${BUTTER};border-radius:0 8px 8px 0;">
                <tr>
                  <td style="padding:14px 16px;font-family:${SANS};font-size:14px;line-height:1.55;color:${INK};font-weight:600;">${escape(input.callout)}</td>
                </tr>
              </table>
            </td>
          </tr>`
    : '';

  const referenceBlock = input.reference
    ? `
          <tr>
            <td style="padding:0 32px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CREAM};border:1px solid ${LINE};border-radius:10px;">
                <tr>
                  <td align="center" style="padding:18px 16px;">
                    <div style="font-family:${SANS};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${MUTED};">${escape(input.reference.label)}</div>
                    <div style="font-family:${SANS};font-size:26px;letter-spacing:.08em;font-weight:700;color:${INK};padding-top:6px;">${escape(input.reference.value)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
    : '';

  /* Botón "a prueba de balas": una tabla con fondo, no un `<a>` con padding.
     Outlook ignora el padding de un enlace y deja un texto suelto sin caja. */
  const actionBlock = input.action
    ? `
          <tr>
            <td style="padding:0 32px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="background-color:${PALM};border-radius:8px;">
                    <a href="${escape(input.action.url)}" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escape(input.action.label)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
    : '';

  const detailsBlock = detailRows
    ? `
          <tr>
            <td style="padding:0 32px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${detailRows}
              </table>
            </td>
          </tr>`
    : '';

  const noteBlock = input.note
    ? `
          <tr>
            <td style="padding:0 32px 28px;">
              <div style="font-family:${SANS};font-size:13px;line-height:1.5;color:${MUTED};">${escape(input.note)}</div>
            </td>
          </tr>`
    : '';

  const body = input.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:1.6;color:${INK};">${escape(p)}</p>`,
    )
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(input.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${CREAM};">
<!-- Texto de vista previa: se ve junto al asunto en la bandeja y no en el correo abierto. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CREAM};">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">

        <!-- Marca -->
        <tr>
          <td style="padding:0 0 18px;">
            <div style="font-family:${SERIF};font-size:20px;letter-spacing:.01em;color:${PALM_DEEP};">${escape(input.brand)}</div>
          </td>
        </tr>

        <!-- Tarjeta -->
        <tr>
          <td style="background-color:#ffffff;border:1px solid ${LINE};border-radius:14px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- Franja de estado: da el tono antes de leer una palabra -->
              <tr><td style="height:4px;background-color:${accent};border-radius:14px 14px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>

              <tr>
                <td style="padding:28px 32px 6px;">
                  <div style="font-family:${SANS};font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${MUTED};">${escape(input.eyebrow)}</div>
                  <h1 style="margin:8px 0 16px;font-family:${SERIF};font-size:26px;line-height:1.25;font-weight:400;color:${INK};">${escape(input.title)}</h1>
                </td>
              </tr>

              <tr><td style="padding:0 32px 20px;">${body}</td></tr>
${calloutBlock}${referenceBlock}${detailsBlock}${actionBlock}${noteBlock}
            </table>
          </td>
        </tr>

        <!-- Pie -->
        <tr>
          <td style="padding:20px 4px 0;">
${input.footer
  .map(
    (line) =>
      `            <div style="font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED};">${escape(line)}</div>`,
  )
  .join('\n')}
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
