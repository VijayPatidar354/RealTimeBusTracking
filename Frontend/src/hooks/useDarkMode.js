import { useEffect, useState } from 'react';

function getInitialDarkMode() {
  if (typeof window === 'undefined') {
    return false;
  }

  const storedTheme = window.localStorage.getItem('theme');
  if (storedTheme) {
    return storedTheme === 'dark';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useDarkMode() {
  const [darkMode, setDarkMode] = useState(getInitialDarkMode);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    window.localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  return [darkMode, setDarkMode];
}
