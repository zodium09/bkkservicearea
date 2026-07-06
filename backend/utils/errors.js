class AppError extends Error {
  constructor(status, code, message, detail = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function sendError(res, error) {
  const status = error.status || 500;
  res.status(status).json({
    error: true,
    code: error.code || 'INTERNAL_ERROR',
    message: error.message || 'Unexpected server error',
    detail: error.detail || undefined,
  });
}

module.exports = { AppError, sendError };
