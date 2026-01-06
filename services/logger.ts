export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

type LoggerState = {
  debugEnabled: boolean;
};

const state: LoggerState = {
  debugEnabled: false,
};

export const setDebugLoggingEnabled = (enabled: boolean) => {
  state.debugEnabled = !!enabled;
};

export const isDebugLoggingEnabled = () => state.debugEnabled;

// Logger centralizado: por padrão só mostra warn/error.
// info/debug só aparecem quando debugEnabled=true (toggle "Debug do Dev").
export const logger = {
  error: (...args: any[]) => console.error(...args),
  warn: (...args: any[]) => console.warn(...args),
  info: (...args: any[]) => {
    if (state.debugEnabled) console.info(...args);
  },
  debug: (...args: any[]) => {
    if (state.debugEnabled) console.debug(...args);
  },
};


