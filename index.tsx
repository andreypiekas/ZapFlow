import React, { ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Filtra logs do console que contêm dados base64 longos (imagens) para não poluir o console
if (typeof console !== 'undefined') {
    const originalError = console.error;
    const originalLog = console.log;
    const originalWarn = console.warn;
    
    const shouldFilter = (args: any[]): boolean => {
        return args.some(arg => {
            if (typeof arg === 'string') {
                // Filtra strings muito longas que parecem base64 (imagens)
                return (arg.length > 1000 && (arg.includes('iVBORw0KGgo') || arg.includes('data:image') || arg.includes('/9j/'))) ||
                       arg.includes(':5173/') && arg.length > 500;
            }
            return false;
        });
    };
    
    console.error = (...args: any[]) => {
        if (!shouldFilter(args)) {
            originalError.apply(console, args);
        }
    };
    
    console.log = (...args: any[]) => {
        if (!shouldFilter(args)) {
            originalLog.apply(console, args);
        }
    };
    
    console.warn = (...args: any[]) => {
        if (!shouldFilter(args)) {
            originalWarn.apply(console, args);
        }
    };
}

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // Explicitly declare props to satisfy TypeScript
  declare props: Readonly<ErrorBoundaryProps>;

  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-lg border border-red-200 max-w-lg w-full">
            <h2 className="text-xl font-bold text-red-600 mb-2">Ops! Algo deu errado.</h2>
            <p className="text-slate-600 mb-4">Ocorreu um erro crítico na aplicação.</p>
            <div className="bg-slate-900 text-slate-200 p-4 rounded text-xs font-mono overflow-auto max-h-48">
              {this.state.error?.toString()}
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors w-full"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);