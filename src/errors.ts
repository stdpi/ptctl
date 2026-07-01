import type { RedactedRequest } from "./types"

export class CliError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CliError"
  }
}

export class ApiError extends Error {
  status: number
  body: unknown
  request: RedactedRequest

  constructor(message: string, status: number, body: unknown, request: RedactedRequest) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.body = body
    this.request = request
  }
}
