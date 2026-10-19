export type DomainErrorStatus = 400 | 404 | 409;

export class DomainError extends Error {
  code: string;
  status: DomainErrorStatus;

  constructor(code: string, message: string, status: DomainErrorStatus) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
  }

  static validation(msg: string): DomainError {
    return new DomainError("VALIDATION", msg, 400);
  }

  static notFound(msg: string): DomainError {
    return new DomainError("NOT_FOUND", msg, 404);
  }

  static conflict(msg: string): DomainError {
    return new DomainError("CONFLICT", msg, 409);
  }
}

export function validation(msg: string): DomainError {
  return DomainError.validation(msg);
}

export function notFound(msg: string): DomainError {
  return DomainError.notFound(msg);
}

export function conflict(msg: string): DomainError {
  return DomainError.conflict(msg);
}
