import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import './index.css';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

if (apiBaseUrl) {
  let apiOrigin: string;

  try {
    apiOrigin = new URL(apiBaseUrl).origin;
  } catch {
    throw new Error(
      'VITE_API_BASE_URL must be an absolute URL such as https://api.example.com',
    );
  }

  const browserFetch = window.fetch.bind(window);

  setBaseUrl(apiBaseUrl);

  // Include browser cookies for player sessions and Clerk requests.
  window.fetch = (input, init) => {
    const requestUrl =
      input instanceof Request ? input.url : String(input);

    const isApiRequest =
      new URL(requestUrl, window.location.href).origin === apiOrigin;

    return browserFetch(
      input,
      isApiRequest
        ? { ...init, credentials: init?.credentials ?? 'include' }
        : init,
    );
  };
}

createRoot(document.getElementById('root')!, {
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
