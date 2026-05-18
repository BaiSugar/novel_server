/** HTTP 层可识别的业务错误。 */
export class HttpError extends Error {
  /** HTTP 状态码。 */
  readonly status: number;

  /** 前端错误码。 */
  readonly errorCode: string;

  /**
   * 构造 HTTP 业务错误。
   * @param message 错误信息。
   * @param status HTTP 状态码。
   * @param errorCode 前端错误码，默认根据状态码自动生成。
   */
  constructor(message: string, status = 400, errorCode?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.errorCode = errorCode ?? statusToErrorCode(status);
  }
}

/**
 * 判断是否为 HTTP 业务错误。
 * @param error 待判断错误。
 * @returns 是 HTTP 业务错误时返回 true。
 */
export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

/**
 * HTTP 状态码转前端错误码。
 * @param status HTTP 状态码。
 * @returns 前端错误码字符串。
 */
export function statusToErrorCode(status: number): string {
  switch (status) {
    case 400:
      return "INVALID_PARAMS";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 422:
      return "VALIDATION_ERROR";
    case 499:
      return "CLIENT_DISCONNECTED";
    case 503:
      return "MODEL_UNAVAILABLE";
    default:
      return "INTERNAL_ERROR";
  }
}
