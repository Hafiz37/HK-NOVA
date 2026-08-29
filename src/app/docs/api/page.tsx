'use client';

import { useEffect, useRef, useState } from 'react';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

function convertToOpenAPI30(spec: any): any {
  if (!spec) return spec;
  const converted = { ...spec };
  // OpenAPI 3.1 -> 3.0.3
  converted.openapi = '3.0.3';
  // Remove 3.1 specific fields if any
  if (converted.webhooks) {
    delete converted.webhooks;
  }
  // Convert components/schemas that use 3.1 features
  if (converted.components?.schemas) {
    for (const [key, schema] of Object.entries(converted.components.schemas)) {
      const s = schema as any;
      // Convert exclusiveMinimum/exclusiveMaximum from boolean to number
      if (s.properties) {
        for (const [propKey, propSchema] of Object.entries(s.properties)) {
          const ps = propSchema as any;
          if (ps.exclusiveMinimum === true) ps.exclusiveMinimum = ps.minimum ?? 0;
          if (ps.exclusiveMaximum === true) ps.exclusiveMaximum = ps.maximum ?? 0;
          // Remove unsupported 3.1 keywords
          delete ps.const;
          delete ps.contentMediaType;
          delete ps.contentEncoding;
          delete ps.$schema;
        }
      }
      // Handle items in arrays
      if (s.items) {
        const is = s.items as any;
        if (is.exclusiveMinimum === true) is.exclusiveMinimum = is.minimum ?? 0;
        if (is.exclusiveMaximum === true) is.exclusiveMaximum = is.maximum ?? 0;
        delete is.const;
        delete is.contentMediaType;
        delete is.contentEncoding;
      }
      // Handle additionalProperties
      if (s.additionalProperties && typeof s.additionalProperties === 'object') {
        const ap = s.additionalProperties as any;
        if (ap.exclusiveMinimum === true) ap.exclusiveMinimum = ap.minimum ?? 0;
        if (ap.exclusiveMaximum === true) ap.exclusiveMaximum = ap.maximum ?? 0;
      }
    }
  }
  return converted;
}

export default function SwaggerUIPage() {
  const ref = useRef<HTMLDivElement>(null);
  const [spec, setSpec] = useState<any>(null);

  useEffect(() => {
    fetch('/api-docs')
      .then(res => res.json())
      .then(data => setSpec(convertToOpenAPI30(data)))
      .catch(console.error);
  }, []);

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
        .swagger-ui .opblock-tag { pointer-events: auto !important; cursor: pointer !important; user-select: none; z-index: 1000; position: relative; }
        .swagger-ui .opblock-tag-section { pointer-events: auto !important; }
        .swagger-ui .opblock-tag small { pointer-events: none; }
        .swagger-ui .opblock-tag svg { pointer-events: none; }
        .swagger-ui .opblock { pointer-events: auto !important; }
        .swagger-ui .opblock-summary { pointer-events: auto !important; cursor: pointer !important; }
        .swagger-ui .opblock-tag:hover { background-color: rgba(59, 130, 246, 0.1); }
      `;
      document.head.appendChild(style);
      return () => {
        document.head.removeChild(style);
      };
    }
  }, []);

  if (!spec) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ 
          padding: '16px 24px', 
          background: '#1e293b', 
          color: '#f8fafc',
          borderBottom: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 100,
          position: 'relative'
        }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>
            HK-NOVA API Documentation
          </h1>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>v1.0.0</span>
            <a 
              href="/api-docs" 
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
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
          Memuat spesifikasi API...
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', pointerEvents: 'auto' }}>
      <div style={{ 
        padding: '16px 24px', 
        background: '#1e293b', 
        color: '#f8fafc',
        borderBottom: '1px solid #334155',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 100,
        position: 'relative'
      }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>
          HK-NOVA API Documentation
        </h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>v1.0.0</span>
          <a 
            href="/api-docs" 
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
        style={{ flex: 1, overflow: 'auto', pointerEvents: 'auto', position: 'relative', zIndex: 1 }}
      >
        <SwaggerUI 
          spec={spec}
          defaultModelsExpandDepth={-1}
          defaultModelExpandDepth={1}
          docExpansion="list"
        />
      </div>
    </div>
  );
}