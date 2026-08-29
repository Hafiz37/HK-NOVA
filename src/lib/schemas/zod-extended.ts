import { z } from 'zod';
import { extendZodWithOpenApi, zodToOpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z as any);

export { z };