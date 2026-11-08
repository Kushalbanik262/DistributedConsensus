export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface Logger {
    debug(message: string, error?: unknown): void;
    info(message: string, error?: unknown): void;
    warn(message: string, error?: unknown): void;
    error(message: string, error?: unknown): void;
}

function formatMessage(message: string, error?: unknown): string {
    const errorMessage = error instanceof Error ? error.message : error === undefined ? "" : String(error);
    return [message, errorMessage]
        .filter(Boolean)
        .join("; error=")
        .replace(/[\r\n]+/g, " ")
        .replace(/\|/g, "/");
}

function write(level: LogLevel, service: string, message: string, error?: unknown): void {
    // Keep the output machine-parseable: LEVEL|TIME|SERVICE|MESSAGE.
    const line = `${level}|${new Date().toISOString()}|${service}|${formatMessage(message, error)}`;
    if (level === "ERROR") console.error(line);
    else if (level === "WARN") console.warn(line);
    else console.log(line);
}

export function createLogger(service: string): Logger {
    const normalizedService = service.replace(/[\r\n|]+/g, "_");
    return {
        debug: (message, error) => write("DEBUG", normalizedService, message, error),
        info: (message, error) => write("INFO", normalizedService, message, error),
        warn: (message, error) => write("WARN", normalizedService, message, error),
        error: (message, error) => write("ERROR", normalizedService, message, error),
    };
}
