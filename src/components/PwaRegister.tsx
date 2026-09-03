'use client';

import { useEffect } from 'react';

export const PwaRegister = () => {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => {
            console.log('Go Choww PWA Service Worker registered:', reg.scope);
          })
          .catch((err) => {
            console.warn('Go Choww Service Worker registration failed:', err);
          });
      });
    }
  }, []);

  return null;
};
