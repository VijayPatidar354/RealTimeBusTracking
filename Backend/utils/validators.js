'use strict';

// ================================================================
//  CENTRALIZED INPUT VALIDATORS
//  utils/validators.js
//
//  Used by all controllers to validate request body fields before
//  any database query runs.  Keeps validation rules consistent
//  across Admin, Owner, Driver, and Passenger registration/login.
// ================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10,20}$/;           // 10–20 digits only

/**
 * Validate an email address format.
 * @returns {string|null} Error message, or null if valid.
 */
function validateEmail(email) {
    if (!email || typeof email !== 'string') return 'Email is required';
    if (email.trim().length === 0)           return 'Email cannot be empty';
    if (!EMAIL_REGEX.test(email.trim()))      return 'Invalid email format';
    if (email.length > 150)                   return 'Email must be under 150 characters';
    return null;
}

/**
 * Validate a phone number (digits only, 10–20 length).
 */
function validatePhone(phone) {
    if (!phone || typeof phone !== 'string') return 'Phone number is required';
    const cleaned = phone.trim().replace(/[+\-\s()]/g, '');
    if (!PHONE_REGEX.test(cleaned))          return 'Phone must be 10–20 digits';
    return null;
}

/**
 * Validate a password (min 6 characters).
 */
function validatePassword(password) {
    if (!password || typeof password !== 'string') return 'Password is required';
    if (password.length < 8)                        return 'Password must be at least 8 characters';
    if (password.length > 128)                      return 'Password must be under 128 characters';
    return null;
}

/**
 * Validate a human name (2–100 characters, no angle brackets).
 */
function validateName(name, fieldLabel = 'Name') {
    if (!name || typeof name !== 'string')  return `${fieldLabel} is required`;
    const trimmed = name.trim();
    if (trimmed.length < 2)                  return `${fieldLabel} must be at least 2 characters`;
    if (trimmed.length > 100)                return `${fieldLabel} must be under 100 characters`;
    if (/[<>]/.test(trimmed))                return `${fieldLabel} contains invalid characters`;
    return null;
}

/**
 * Validate GPS coordinates.
 * @returns {string|null} Error message, or null if valid.
 */
function validateCoordinates(lat, lon) {
    if (lat === undefined || lat === null || lon === undefined || lon === null) {
        return 'latitude and longitude are required';
    }
    const la = Number(lat);
    const lo = Number(lon);
    if (isNaN(la) || isNaN(lo))     return 'latitude and longitude must be numbers';
    if (la < -90  || la > 90)       return 'latitude must be between -90 and 90';
    if (lo < -180 || lo > 180)      return 'longitude must be between -180 and 180';
    return null;
}

/**
 * Validate that a value is a positive integer (for IDs).
 */
function validateId(value, fieldLabel = 'ID') {
    if (value === undefined || value === null) return `${fieldLabel} is required`;
    const num = Number(value);
    if (!Number.isInteger(num) || num < 1)    return `${fieldLabel} must be a positive integer`;
    return null;
}

/**
 * Return a safe, generic error message for 500 responses.
 * Always log the real error server-side for debugging.
 */
function safeErrorResponse(res, error, context = 'Server') {
    console.error(`[${context}] Error:`, error.message || error);
    return res.status(500).json({
        success: false,
        message: 'An internal error occurred. Please try again.'
    });
}
function validateLicenseNumber(licenseNumber) {
    if (!licenseNumber || typeof licenseNumber !== 'string') return 'License number is required';
    const trimmed = licenseNumber.trim();
    if (trimmed.length < 5)   return 'License number must be at least 5 characters';
    if (trimmed.length > 50)  return 'License number must be under 50 characters';
    if (!/^[A-Za-z0-9\-\/ ]+$/.test(trimmed)) return 'License number contains invalid characters';
    return null;
}

module.exports = {
    validateEmail,
    validatePhone,
    validatePassword,
    validateName,
    validateCoordinates,
    validateId,
    safeErrorResponse,
    validateLicenseNumber
};
