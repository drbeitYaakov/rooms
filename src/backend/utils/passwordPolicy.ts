const PASSWORD_MIN_LENGTH = 12;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const validatePasswordStrength = (password: string): string | null => {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `הסיסמה חייבת להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים`;
  }

  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  if (!hasUppercase || !hasLowercase || !hasDigit || !hasSpecial) {
    return 'הסיסמה חייבת לכלול אות גדולה, אות קטנה, מספר ותו מיוחד';
  }

  return null;
};

export const getUserPasswordHash = (user: any): string | undefined => user.password ?? user.password_hash;
