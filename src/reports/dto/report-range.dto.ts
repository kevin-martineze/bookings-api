import { Matches } from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ReportRangeQueryDto {
  @Matches(DATE_PATTERN, { message: 'from debe ser una fecha "YYYY-MM-DD"' })
  from: string;

  /** Exclusivo, igual que un check-out: la noche del `to` no entra. */
  @Matches(DATE_PATTERN, { message: 'to debe ser una fecha "YYYY-MM-DD"' })
  to: string;
}
