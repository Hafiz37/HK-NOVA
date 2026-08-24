'use client';

import { useEffect, useRef } from 'react';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

export default function SwaggerUIPage() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      const style = document.createElement('style');
      style.textContent = `
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info { margin: 20px 0; }
        .swagger-ui .info .title { color: #3b82f6; }
        .swagger-ui .scheme-container { background: #f8fafc; padding: 15px; border-radius: 8px; margin: 10px 0; }
        .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #3b82f6; }
        .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #22c55e; }
        .swagger-ui .opblock.opblock-put .opblock-summary-method { background: #f59e0b; }
        .swagger-ui .opblock.opblock-patch .opblock-summary-method { background: #8b5cf6; }
        .swagger-ui .opblock.opblock-delete .opblock-summary-method { background: #ef4444; }
        .swagger-ui .btn.authorize { background: #3b82f6; border-color: #3b82f6; }
        .swagger-ui .btn.authorize:hover { background: #2563eb; border-color: #2563eb; }
      `;
      document.head.appendChild(style);
      return () => {
        document.head.removeChild(style);
      };
    }
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ 
        padding: '16px 24px', 
        background: '#1e293b', 
        color: '#f8fafc',
        borderBottom: '1px solid #334155',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>
          HK-NOVA API Documentation
        </h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>v1.0.0</span>
          <a 
            href="/swagger.json" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{ 
              padding: '8px 16px', 
              background: '#3b82f6', 
              color: 'white', 
              borderRadius: '6px', 
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: 500
            }}
          >
            Download Spec
          </a>
        </div>
      </div>
      <div 
        ref={ref} 
        style={{ flex: 1, overflow: 'auto' }}
      />
    </div>
  );
}