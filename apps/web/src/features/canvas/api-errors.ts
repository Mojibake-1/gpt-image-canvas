import { localizedApiErrorMessage, type Locale } from "../../shared/i18n";

type ErrorResponseBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export type ErrorFallbackTranslator = (key: "errorFallback", params: { status: number }) => string;

export class UnauthorizedSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedSessionError";
  }
}

export async function createApiError(
  response: Response,
  locale: Locale,
  t: ErrorFallbackTranslator
): Promise<Error> {
  let code: string | undefined;
  let fallbackMessage: string | undefined;

  try {
    const body = (await response.json()) as ErrorResponseBody;
    code = body.error?.code;
    fallbackMessage = body.error?.message;
  } catch {
    code = undefined;
    fallbackMessage = undefined;
  }

  const message = localizedApiErrorMessage({
    code,
    fallbackMessage,
    fallbackText: t("errorFallback", { status: response.status }),
    locale,
    status: response.status
  });

  return isUnauthorizedApiError(response.status, code) ? new UnauthorizedSessionError(message) : new Error(message);
}

export function isUnauthorizedApiError(status: number, code?: string): boolean {
  return status === 401 || code === "unauthorized";
}
