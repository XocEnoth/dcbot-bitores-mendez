const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

const getTimestamp = () => {
  return new Date().toLocaleString('en-US', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatMessage = (level, color, message) => {
  const timestamp = `${COLORS.gray}${getTimestamp()}${COLORS.reset}`;
  const tag = `${color}[${level}]${COLORS.reset}`;
  return `${timestamp} ${tag} ${message}`;
};

const logger = {
  info: (message) => {
    console.log(formatMessage('INFO', COLORS.blue, message));
  },

  success: (message) => {
    console.log(formatMessage('OK', COLORS.green, message));
  },

  warn: (message) => {
    console.warn(formatMessage('WARN', COLORS.yellow, message));
  },

  error: (message, error = null) => {
    console.error(formatMessage('ERROR', COLORS.red, message));
    if (error?.stack) {
      console.error(`${COLORS.gray}${error.stack}${COLORS.reset}`);
    }
  },
};

export default logger;
