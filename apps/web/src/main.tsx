import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { Toaster } from 'sonner';
import { router } from './router';
import { TooltipProvider } from './components/ui/Tooltip';
import { DataPreloader } from './components/shared';
import { getToastPosition, getToastDuration } from './routes/settings';
import './index.css';

// Initialize theme before React renders to prevent flash of wrong theme
function initializeTheme() {
  const stored = localStorage.getItem('settings.theme');
  const theme = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  if (resolvedTheme === 'dark') {
    document.documentElement.classList.add('dark', 'theme-dark');
    document.documentElement.classList.remove('theme-light');
  } else {
    document.documentElement.classList.add('theme-light');
    document.documentElement.classList.remove('dark', 'theme-dark');
  }
}

// Initialize theme immediately
initializeTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: true,
    },
  },
});

// Component that provides dynamic toast configuration
function DynamicToaster() {
  const [position, setPosition] = useState(getToastPosition());
  const [duration, setDuration] = useState(getToastDuration());

  // Listen for settings changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'settings.notifications') {
        setPosition(getToastPosition());
        setDuration(getToastDuration());
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Also periodically check for changes from same tab
    const interval = setInterval(() => {
      const newPosition = getToastPosition();
      const newDuration = getToastDuration();
      if (newPosition !== position) setPosition(newPosition);
      if (newDuration !== duration) setDuration(newDuration);
    }, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [position, duration]);

  return (
    <Toaster
      position={position}
      duration={duration}
      richColors
      closeButton
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <DataPreloader>
          <RouterProvider router={router} />
          <DynamicToaster />
        </DataPreloader>
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>
);
