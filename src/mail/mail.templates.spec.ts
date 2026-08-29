import {
  bookingCancelled,
  bookingConfirmed,
  bookingRequested,
  passwordReset,
  type BookingMailData,
} from './mail.templates';

const data: BookingMailData = {
  guestName: 'Emma Clarke',
  reference: 'A3C3FEC0',
  propertyName: 'Daughters of Sun',
  unitTypeName: 'Standard Doble',
  checkIn: '2027-04-16',
  checkOut: '2027-04-18',
  nights: 2,
  totalMinor: 17600,
  currency: 'USD',
};

describe('mail templates', () => {
  describe('language', () => {
    it('writes in the guest language when it is known', () => {
      expect(bookingConfirmed(data, 'en').subject).toMatch(/confirmed/i);
      expect(bookingConfirmed(data, 'es').subject).toMatch(/confirmada/i);
    });

    it('falls back to Spanish — the hotel is in Panama', () => {
      expect(bookingConfirmed(data).subject).toMatch(/confirmada/i);
      expect(bookingRequested(data).subject).toMatch(/solicitud/i);
      expect(bookingCancelled(data).subject).toMatch(/cance/i);
    });
  });

  describe('the request email never promises a booking', () => {
    /* Es la regla más importante de este archivo. Sin pagos, lo que el huésped
       tiene es una solicitud que el hotel todavía puede rechazar; un correo que
       diga "confirmada" deja a alguien viajando a Chiriquí con una habitación
       que nadie le apartó. */
    it('says explicitly that it is not confirmed yet, in both languages', () => {
      const es = bookingRequested(data, 'es');
      expect(es.text).toMatch(/todavía no es una reserva confirmada/i);
      expect(es.html).toMatch(/Todavía no es una reserva confirmada/i);

      const en = bookingRequested(data, 'en');
      expect(en.text).toMatch(/not a confirmed booking yet/i);
      expect(en.html).toMatch(/not a confirmed booking yet/i);
    });

    it('does not use the word "confirmed" as a claim in the subject', () => {
      expect(bookingRequested(data, 'en').subject).not.toMatch(/confirmed/i);
      expect(bookingRequested(data, 'es').subject).not.toMatch(/confirmada/i);
    });
  });

  describe('every message carries both HTML and plain text', () => {
    /* Hay clientes que no muestran HTML y filtros que penalizan los mensajes
       que sólo lo traen. El texto plano no es un resumen: dice lo mismo. */
    const all = [
      passwordReset('https://example.test/reset?token=abc'),
      bookingRequested(data),
      bookingConfirmed(data),
      bookingCancelled(data),
    ];

    it.each(all.map((m, i) => [i, m]))('message %i', (_i, mail) => {
      const m = mail as { subject: string; text: string; html: string };
      expect(m.subject.length).toBeGreaterThan(0);
      expect(m.text.trim().length).toBeGreaterThan(0);
      expect(m.html).toContain('<');
    });

    it('repeats the reference in both bodies, which is what the guest quotes', () => {
      const mail = bookingConfirmed(data);
      expect(mail.text).toContain(data.reference);
      expect(mail.html).toContain(data.reference);
      expect(mail.subject).toContain(data.reference);
    });
  });

  describe('money', () => {
    it('writes "$" and not the currency code', () => {
      // "USD 176" en un hotel panameño se lee como un error del sistema.
      const mail = bookingConfirmed(data);
      expect(mail.text).toContain('$176');
      expect(mail.text).not.toContain('USD');
    });
  });

  describe('password reset', () => {
    it('includes the link and nothing else that identifies the account', () => {
      const link = 'https://admin.example.test/es/admin?reset=SECRETO';
      const mail = passwordReset(link);
      expect(mail.text).toContain(link);
      expect(mail.html).toContain(link);
    });

    it('says the link expires — so an old email is not tried forever', () => {
      expect(passwordReset('x', 'es').text).toMatch(/vence|una vez/i);
      expect(passwordReset('x', 'en').text).toMatch(/expires|once/i);
    });
  });
});
