/**
 * Environment name validation module.
 *
 * Environment names must be DNS-label safe:
 * - Lowercase letters, numbers, and hyphens only (a-z, 0-9, -)
 * - Must start with a letter
 * - Maximum 63 characters
 * - "production" is a reserved name for the production environment
 */

/**
 * Regex pattern for valid environment names.
 * - Starts with lowercase letter
 * - Contains only lowercase letters, numbers, hyphens
 * - 1-63 characters total
 */
const ENVIRONMENT_NAME_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;

/**
 * Validation result with helpful error messages.
 */
export interface EnvironmentValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates an environment name according to DNS label rules.
 *
 * Rules:
 * - Lowercase letters, numbers, and hyphens only (a-z, 0-9, -)
 * - Must start with a letter
 * - Maximum 63 characters (DNS label safe)
 *
 * @param name The environment name to validate
 * @returns Validation result with error message if invalid
 */
export function validateEnvironmentName(name: string): EnvironmentValidationResult {
  // Check for empty string
  if (!name) {
    return {
      valid: false,
      error: "Environment name cannot be empty.",
    };
  }

  // Check length
  if (name.length > 63) {
    return {
      valid: false,
      error: `Environment name is too long (${name.length} characters). Maximum is 63 characters.`,
    };
  }

  // Check if it starts with a letter
  if (!/^[a-z]/.test(name)) {
    if (/^[A-Z]/.test(name)) {
      return {
        valid: false,
        error: `Environment name "${name}" must be lowercase. Try "${name.toLowerCase()}" instead.`,
      };
    }
    if (/^[0-9]/.test(name)) {
      return {
        valid: false,
        error: `Environment name "${name}" must start with a letter, not a number.`,
      };
    }
    if (/^-/.test(name)) {
      return {
        valid: false,
        error: `Environment name "${name}" must start with a letter, not a hyphen.`,
      };
    }
    return {
      valid: false,
      error: `Environment name "${name}" must start with a lowercase letter (a-z).`,
    };
  }

  // Check for uppercase letters
  if (/[A-Z]/.test(name)) {
    return {
      valid: false,
      error: `Environment name "${name}" must be lowercase. Try "${name.toLowerCase()}" instead.`,
    };
  }

  // Check for invalid characters
  const invalidChars = name.match(/[^a-z0-9-]/g);
  if (invalidChars) {
    const uniqueInvalidChars = [...new Set(invalidChars)].join(", ");
    return {
      valid: false,
      error:
        `Environment name "${name}" contains invalid characters: ${uniqueInvalidChars}\n` +
        `Only lowercase letters (a-z), numbers (0-9), and hyphens (-) are allowed.`,
    };
  }

  // Final regex check (should pass if we got here)
  if (!ENVIRONMENT_NAME_PATTERN.test(name)) {
    return {
      valid: false,
      error:
        `Environment name "${name}" is invalid.\n` +
        `Must be lowercase, start with a letter, and contain only letters, numbers, and hyphens.`,
    };
  }

  return { valid: true };
}

/**
 * Validates an environment name and throws an error if invalid.
 *
 * @param name The environment name to validate
 * @throws Error with detailed message if the name is invalid
 */
export function validateEnvironmentNameOrThrow(name: string): void {
  const result = validateEnvironmentName(name);
  if (!result.valid) {
    throw new Error(
      `${result.error}\n\n` +
        "Environment name rules:\n" +
        "  - Lowercase letters, numbers, and hyphens only (a-z, 0-9, -)\n" +
        "  - Must start with a letter\n" +
        "  - Maximum 63 characters\n\n" +
        "Examples: production, staging, pr-42, feature-auth"
    );
  }
}

/**
 * Checks if an environment name is valid without throwing.
 *
 * @param name The environment name to check
 * @returns true if the name is valid, false otherwise
 */
export function isValidEnvironmentName(name: string): boolean {
  return validateEnvironmentName(name).valid;
}
