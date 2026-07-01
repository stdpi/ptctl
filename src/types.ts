export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

export type Result<T> =
  | {
      ok: true
      kind: string
      data: T
      meta?: Record<string, unknown>
      hints?: string[]
    }
  | {
      ok: false
      kind: "error"
      message: string
      status?: number
      errors?: unknown[]
      request?: RedactedRequest
      body?: unknown
      stack?: string
      hints?: string[]
    }

export type RedactedRequest = {
  method: string
  url: string
  headers: Record<string, string>
}

export type EnvConfig = {
  url: string
  clientKey: string
  sftp: boolean
  sftpKey?: string
  tenant?: string
}

export type Account = {
  id: number
  admin: boolean
  username: string
  email: string
  first_name: string
  last_name: string
  language: string
}

export type ServerSummary = {
  identifier: string
  name: string
  status?: string | null
  limits?: {
    memory?: number
    disk?: number
    cpu?: number
  }
  relationships?: {
    allocations?: {
      data?: Array<{ attributes?: { ip?: string; port?: number } }>
    }
  }
  sftp_details?: { ip?: string; port?: number }
  connection?: string | null
}

export type FileEntry = {
  name?: string
  mode?: string
  size?: number
  is_file?: boolean
  is_symlink?: boolean
  mimetype?: string
  created_at?: string
  modified_at?: string
}

export type Backup = {
  uuid: string
  name?: string
  is_successful?: boolean
  is_locked?: boolean
  bytes?: number
  created_at?: string
  completed_at?: string | null
}

export type SshKey = {
  name?: string
  fingerprint?: string
  public_key?: string
  created_at?: string
}
