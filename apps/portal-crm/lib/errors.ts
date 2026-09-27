/**
 * Erros de domínio tipados — traduzidos em status HTTP pelo BaseController.
 * Espelha o padrão do portal-suporte (AuthorizationError, ValidationError, etc.).
 */

export class AppError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = new.target.name
  }
}

export class ValidationError extends AppError {
  constructor(message = "Dados inválidos") {
    super(message, 400)
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Não autenticado") {
    super(message, 401)
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Sem permissão") {
    super(message, 403)
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Não encontrado") {
    super(message, 404)
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflito") {
    super(message, 409)
  }
}
