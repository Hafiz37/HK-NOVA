import { NextResponse } from 'next/server';
import { createSwaggerSpec } from 'next-swagger-doc';

export async function GET() {
  try {
    const { generateOpenApiSchemas } = await import('@/lib/openapi/schemas');
    const generatedSchemas = generateOpenApiSchemas();

    const options = {
      definition: {
        openapi: '3.1.0',
        info: {
          title: 'HK-NOVA NOC Platform API',
          version: '1.0.0',
          description: 'Network Operations Center Platform API for ISP monitoring, automation, and intelligence',
          contact: {
            name: 'HK-NOVA Team',
            email: 'support@hk-nova.local',
          },
          license: {
            name: 'Private',
          },
        },
        servers: [
          {
            url: 'http://localhost:3000',
            description: 'Development server',
          },
          {
            url: 'https://api.hk-nova.local',
            description: 'Production server',
          },
        ],
        components: {
          securitySchemes: {
            BearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
            CookieAuth: {
              type: 'apiKey',
              in: 'cookie',
              name: 'hk_nova_session',
            },
          },
          schemas: generatedSchemas,
          responses: {
            ValidationError: {
              description: 'Validation error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', enum: [false] },
                      error: {
                        type: 'object',
                        properties: {
                          code: { type: 'string', example: 'VALIDATION_ERROR' },
                          message: { type: 'string', example: 'Validation failed' },
                          details: { type: 'object', example: { name: ['Device name is required'] } },
                          statusCode: { type: 'integer', example: 400 },
                          timestamp: { type: 'string', format: 'date-time' },
                          path: { type: 'string', example: '/api/devices' },
                        },
                      },
                    },
                  },
                },
              },
            },
            NotFoundError: {
              description: 'Resource not found',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', enum: [false] },
                      error: {
                        type: 'object',
                        properties: {
                          code: { type: 'string', enum: ['NOT_FOUND'] },
                          message: { type: 'string', example: 'Device with ID abc123 not found' },
                          statusCode: { type: 'integer', example: 404 },
                          timestamp: { type: 'string', format: 'date-time' },
                          path: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
            UnauthorizedError: {
              description: 'Unauthorized',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', enum: [false] },
                      error: {
                        type: 'object',
                        properties: {
                          code: { type: 'string', enum: ['UNAUTHORIZED'] },
                          message: { type: 'string', example: 'Unauthorized' },
                          statusCode: { type: 'integer', example: 401 },
                          timestamp: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
            ForbiddenError: {
              description: 'Forbidden',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', enum: [false] },
                      error: {
                        type: 'object',
                        properties: {
                          code: { type: 'string', enum: ['FORBIDDEN'] },
                          message: { type: 'string', example: 'Forbidden' },
                          statusCode: { type: 'integer', example: 403 },
                          timestamp: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
            RateLimitError: {
              description: 'Rate limit exceeded',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', enum: [false] },
                      error: {
                        type: 'object',
                        properties: {
                          code: { type: 'string', enum: ['RATE_LIMIT_EXCEEDED'] },
                          message: { type: 'string', example: 'Too many requests' },
                          details: {
                            type: 'object',
                            properties: {
                              retryAfter: { type: 'integer', example: 60 },
                            },
                          },
                          statusCode: { type: 'integer', example: 429 },
                          timestamp: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
            InternalError: {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', enum: [false] },
                      error: {
                        type: 'object',
                        properties: {
                          code: { type: 'string', enum: ['INTERNAL_ERROR'] },
                          message: { type: 'string', example: 'Internal server error' },
                          statusCode: { type: 'integer', example: 500 },
                          timestamp: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          parameters: {
            pageParam: {
              name: 'page',
              in: 'query',
              description: 'Page number (1-indexed)',
              required: false,
              schema: { type: 'integer', minimum: 1, default: 1 },
            },
            limitParam: {
              name: 'limit',
              in: 'query',
              description: 'Items per page (max 100)',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            },
            sortByParam: {
              name: 'sortBy',
              in: 'query',
              description: 'Sort field',
              required: false,
              schema: { type: 'string' },
            },
            sortOrderParam: {
              name: 'sortOrder',
              in: 'query',
              description: 'Sort order',
              required: false,
              schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
            },
            searchParam: {
              name: 'search',
              in: 'query',
              description: 'Search query',
              required: false,
              schema: { type: 'string', maxLength: 200 },
            },
          },
        },
        security: [
          { BearerAuth: [], CookieAuth: [] },
        ],
        tags: [
          { name: 'Devices', description: 'Network device management' },
          { name: 'Alerts', description: 'Alert lifecycle management' },
          { name: 'Users', description: 'User and RBAC management' },
          { name: 'Backups', description: 'Configuration backup management' },
          { name: 'Provisioning', description: 'OLT provisioning operations' },
          { name: 'Anomalies', description: 'ML anomaly detection' },
          { name: 'Maintenance Windows', description: 'Scheduled maintenance' },
          { name: 'Alert Rules', description: 'Threshold-based alert rules' },
          { name: 'Feature Flags', description: 'Feature toggle management' },
          { name: 'Settings', description: 'System settings' },
          { name: 'Dashboard', description: 'Dashboard statistics' },
          { name: 'Realtime', description: 'Real-time SSE subscriptions' },
          { name: 'Admin', description: 'Administrative operations' },
        ],
      },
      apiFolder: 'src/app/api',
      outputFilePath: 'public/swagger.json',
      disableWarnings: true,
    };

    const swaggerSpec = createSwaggerSpec(options);

    return NextResponse.json(swaggerSpec);
  } catch (error) {
    console.error('[API /api-docs] Error generating swagger spec:', error);
    return NextResponse.json({ error: 'Failed to generate swagger spec' }, { status: 500 });
  }
}