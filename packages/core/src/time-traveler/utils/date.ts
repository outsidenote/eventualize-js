export function ensureDate(value: Date | string | number | undefined | null, fieldName = 'date'): Date {
  if (value === undefined || value === null) {
    throw new Error(`Missing ${fieldName}`);
  }

  if (value instanceof Date) {
    if (!isNaN(value.getTime())) {
      return value;
    }
  }

  if (typeof value === 'number') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return d;
    }
  }

  if (typeof value === 'string') {
    const numericValue = Number(value);
    if (!isNaN(numericValue) && value.trim() !== '') {
      const d = new Date(numericValue);
      if (!isNaN(d.getTime())) {
        return d;
      }
    }
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return d;
    }
  }

  throw new Error(`Invalid ${fieldName}: ${String(value)}`);
}
