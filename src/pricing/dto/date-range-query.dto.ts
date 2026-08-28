import { Matches } from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class QuoteQueryDto {
  @Matches(DATE_PATTERN, { message: 'checkIn debe ser una fecha "YYYY-MM-DD"' })
  checkIn: string;

  @Matches(DATE_PATTERN, {
    message: 'checkOut debe ser una fecha "YYYY-MM-DD"',
  })
  checkOut: string;
}

export class RateCalendarQueryDto {
  @Matches(DATE_PATTERN, { message: 'from debe ser una fecha "YYYY-MM-DD"' })
  from: string;

  /** Inclusivo: se devuelve el precio de esta noche también. */
  @Matches(DATE_PATTERN, { message: 'to debe ser una fecha "YYYY-MM-DD"' })
  to: string;
}
