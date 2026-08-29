import { Matches } from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class AvailabilityQueryDto {
  @Matches(DATE_PATTERN, { message: 'checkIn debe ser una fecha "YYYY-MM-DD"' })
  checkIn: string;

  @Matches(DATE_PATTERN, {
    message: 'checkOut debe ser una fecha "YYYY-MM-DD"',
  })
  checkOut: string;
}
