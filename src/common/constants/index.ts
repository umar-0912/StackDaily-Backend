/**
 * Standard error messages used across the application.
 */
export const ERROR_MESSAGES = {
  // Generic
  INTERNAL_SERVER_ERROR: 'An unexpected error occurred. Please try again later.',
  BAD_REQUEST: 'The request could not be processed. Please check your input.',
  UNAUTHORIZED: 'Authentication is required to access this resource.',
  FORBIDDEN: 'You do not have permission to access this resource.',
  NOT_FOUND: 'The requested resource was not found.',
  CONFLICT: 'The request conflicts with the current state of the resource.',
  TOO_MANY_REQUESTS: 'Too many requests. Please slow down and try again later.',

  // Validation
  INVALID_OBJECT_ID: 'The provided ID is not a valid MongoDB ObjectId.',
  VALIDATION_FAILED: 'Validation failed. Please check the provided data.',

  // Auth
  INVALID_CREDENTIALS: 'Invalid email or password.',
  TOKEN_EXPIRED: 'Your session has expired. Please log in again.',
  REFRESH_TOKEN_INVALID: 'Invalid refresh token. Please log in again.',

  // User
  USER_NOT_FOUND: 'User not found.',
  EMAIL_ALREADY_EXISTS: 'An account with this email already exists.',

  // Topics
  TOPIC_NOT_FOUND: 'Topic not found.',

  // Questions
  QUESTION_NOT_FOUND: 'Question not found.',
  INVALID_TOPIC_IDS: 'One or more topic IDs are invalid or do not exist.',
  NO_QUESTIONS_AVAILABLE: 'No active questions available for this topic.',

  // Lessons
  LESSON_NOT_FOUND: 'Lesson not found.',
} as const;

/**
 * Pagination defaults used for list endpoints.
 */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

/**
 * HTTP header names used throughout the application.
 */
export const HEADERS = {
  CORRELATION_ID: 'x-correlation-id',
} as const;

/**
 * Application metadata.
 */
export const APP_META = {
  API_PREFIX: 'api/v1',
  APP_NAME: 'Micro Learner API',
  APP_VERSION: '1.0.0',
  APP_DESCRIPTION: 'A micro-learning platform powered by AI',
} as const;
