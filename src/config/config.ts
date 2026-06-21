export interface AppConfig {
  port: number;
  nodeEnv: string;
  db: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessExpiresIn: string;
    refreshExpiresIn: string;
  };
  bcrypt: {
    rounds: number;
  };
  pagination: {
    defaultPageSize: number;
  };
}

/**
 * Reads all required environment variables and returns a typed AppConfig.
 * Throws a descriptive startup error if any required variable is absent or invalid.
 */
export function loadConfig(): AppConfig {
  const missing: string[] = [];

  function required(name: string): string {
    const value = process.env[name];
    if (value === undefined || value.trim() === '') {
      missing.push(name);
      return '';
    }
    return value;
  }

  function requiredInt(name: string, min?: number): number {
    const raw = required(name);
    if (raw === '') return 0; // will be caught by missing[] check below
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed)) {
      throw new Error(`[Config] Environment variable "${name}" must be an integer, got: "${raw}"`);
    }
    if (min !== undefined && parsed < min) {
      throw new Error(
        `[Config] Environment variable "${name}" must be >= ${min}, got: ${parsed}`,
      );
    }
    return parsed;
  }

  const nodeEnv           = required('NODE_ENV');
  const portRaw           = required('PORT');
  const dbHost            = required('DB_HOST');
  const dbPortRaw         = required('DB_PORT');
  const dbName            = required('DB_NAME');
  const dbUser            = required('DB_USER');
  const dbPassword        = required('DB_PASSWORD');
  const jwtAccessSecret   = required('JWT_ACCESS_SECRET');
  const jwtRefreshSecret  = required('JWT_REFRESH_SECRET');
  const jwtAccessExpires  = required('JWT_ACCESS_EXPIRES_IN');
  const jwtRefreshExpires = required('JWT_REFRESH_EXPIRES_IN');
  const bcryptRoundsRaw   = required('BCRYPT_ROUNDS');
  const defaultPageSizeRaw = required('DEFAULT_PAGE_SIZE');

  if (missing.length > 0) {
    throw new Error(
      `[Config] Missing required environment variable(s): ${missing.join(', ')}. ` +
      `Check your .env file against .env.example.`,
    );
  }

  const port = parseInt(portRaw, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`[Config] PORT must be a valid port number (1–65535), got: "${portRaw}"`);
  }

  const dbPort = parseInt(dbPortRaw, 10);
  if (isNaN(dbPort) || dbPort < 1 || dbPort > 65535) {
    throw new Error(`[Config] DB_PORT must be a valid port number (1–65535), got: "${dbPortRaw}"`);
  }

  const bcryptRounds = parseInt(bcryptRoundsRaw, 10);
  if (isNaN(bcryptRounds) || bcryptRounds < 1) {
    throw new Error(`[Config] BCRYPT_ROUNDS must be a positive integer, got: "${bcryptRoundsRaw}"`);
  }

  const defaultPageSize = parseInt(defaultPageSizeRaw, 10);
  if (isNaN(defaultPageSize) || defaultPageSize < 1) {
    throw new Error(
      `[Config] DEFAULT_PAGE_SIZE must be a positive integer, got: "${defaultPageSizeRaw}"`,
    );
  }

  return {
    port,
    nodeEnv,
    db: {
      host: dbHost,
      port: dbPort,
      name: dbName,
      user: dbUser,
      password: dbPassword,
    },
    jwt: {
      accessSecret:    jwtAccessSecret,
      refreshSecret:   jwtRefreshSecret,
      accessExpiresIn: jwtAccessExpires,
      refreshExpiresIn: jwtRefreshExpires,
    },
    bcrypt: {
      rounds: bcryptRounds,
    },
    pagination: {
      defaultPageSize,
    },
  };
}
