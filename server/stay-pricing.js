// Pure contracted-rate allocation shared by Night Audit and checkout.
const DAY_MS = 24 * 60 * 60 * 1000;

const parseDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  return Date.parse(`${value}T00:00:00.000Z`);
};

export function contractedNightlyRate(reservation, businessDate) {
  if (typeof reservation?.totalAmount !== 'number' || !Number.isFinite(reservation.totalAmount)
    || reservation.totalAmount < 0 || !Number.isInteger(reservation.nights) || reservation.nights <= 0) {
    throw new RangeError('Invalid contracted stay amount or night count');
  }
  const start = parseDate(reservation.checkIn);
  const date = parseDate(businessDate);
  const nightIndex = (date - start) / DAY_MS;
  if (!Number.isInteger(nightIndex) || nightIndex < 0 || nightIndex >= reservation.nights) {
    throw new RangeError('Business date is outside the contracted stay');
  }
  const totalCents = Math.round(reservation.totalAmount * 100);
  const baseCents = Math.floor(totalCents / reservation.nights);
  const remainderCents = totalCents % reservation.nights;
  return (baseCents + (nightIndex < remainderCents ? 1 : 0)) / 100;
}
