import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Envío de correo transaccional.
 *
 * El transporte se elige por variable de entorno, no por código: el día que
 * exista el dominio de Julius no se toca nada, se cambian `MAIL_TRANSPORT` y
 * las credenciales.
 *
 * | `MAIL_TRANSPORT` | Para qué |
 * |---|---|
 * | `ethereal` | Desarrollo. Casilla descartable creada al vuelo; cada correo deja una URL para verlo renderizado. Sin cuenta ni dominio. |
 * | `smtp`     | Mailpit local, o el proveedor real en producción. |
 * | `log`      | Sólo escribe en el log. El de emergencia. |
 *
 * **Enviar nunca puede tumbar una operación.** Si el correo falla, la reserva
 * ya existe y la contraseña ya se cambió; hacer fallar el pedido entero por eso
 * convertiría una molestia en una caída. Todos los errores se registran y se
 * tragan, y por eso `send` no devuelve éxito ni fracaso: quien la llama no
 * tiene nada que decidir con esa respuesta.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private mode = process.env.MAIL_TRANSPORT ?? 'ethereal';
  private from = process.env.MAIL_FROM ?? 'Daughters of Sun <reservas@example.test>';

  async onModuleInit(): Promise<void> {
    try {
      this.transporter = await this.buildTransport();
    } catch (error) {
      /* Que no se pueda armar el transporte no puede impedir que el servidor
         arranque: el hotel tiene que poder operar sin correo. */
      this.logger.error(
        `No se pudo iniciar el correo (${this.mode}). El sistema sigue sin enviar. ${String(error)}`,
      );
      this.mode = 'log';
    }
  }

  private async buildTransport(): Promise<Transporter | null> {
    if (this.mode === 'log') return null;

    if (this.mode === 'ethereal') {
      /* Ethereal crea una cuenta descartable en el momento. No hay que
         registrarse ni verificar un dominio, y cada mensaje queda accesible en
         una URL — que es la única forma honesta de revisar un correo: viéndolo
         como le llega al huésped, no leyendo el HTML en la consola. */
      const account = await nodemailer.createTestAccount();
      this.logger.log(
        `Correo en modo ethereal. Casilla de prueba: ${account.user}`,
      );
      return nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass },
      });
    }

    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
  }

  /**
   * Manda un correo. No lanza nunca.
   *
   * Se manda HTML **y** texto plano: hay clientes que no muestran HTML, filtros
   * que penalizan los mensajes que sólo lo traen, y una versión de texto que
   * dice lo mismo es la diferencia entre llegar a la bandeja y llegar a spam.
   */
  async send(message: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `[SIN ENVÍO] Para ${message.to} · ${message.subject}\n${message.text}`,
      );
      return;
    }

    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        ...message,
      });

      const preview = nodemailer.getTestMessageUrl(info);
      if (preview) {
        // La URL sólo existe en ethereal, y es lo único que hace útil el modo.
        this.logger.log(`Correo a ${message.to} — verlo en: ${preview}`);
      } else {
        this.logger.log(`Correo enviado a ${message.to}: ${message.subject}`);
      }
    } catch (error) {
      this.logger.error(
        `Falló el envío a ${message.to} ("${message.subject}"): ${String(error)}`,
      );
    }
  }
}
