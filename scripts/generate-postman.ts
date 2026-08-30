import converter from 'openapi-to-postmanv2';
import fs from 'fs';

// Fetch OpenAPI spec from the API endpoint
async function fetchOpenApiSpec() {
  try {
    // Try to import directly from the lib
    const { generateOpenApiSchemas } = await import('../src/lib/openapi/schemas');
    return generateOpenApiSchemas();
  } catch (error) {
    console.error('Failed to generate OpenAPI spec:', error);
    process.exit(1);
  }
}

async function generatePostmanCollection() {
  const openapiSpec = await fetchOpenApiSpec();
  
  // Save OpenAPI spec to file for reference
  fs.writeFileSync('./openapi.json', JSON.stringify(openapiSpec, null, 2));
  console.log('✓ OpenAPI spec saved to openapi.json');
  
  converter.convert({ type: 'json', data: openapiSpec }, {}, (err, result) => {
    if (err || !result) {
      console.error('Conversion failed:', err || 'Unknown error');
      process.exit(1);
    }
    if (!result.result) {
      console.error('Conversion failed:', result.reason);
      process.exit(1);
    }
    if (!result.output || result.output.length === 0) {
      console.error('No output generated');
      process.exit(1);
    }
    fs.writeFileSync('./postman-collection.json', JSON.stringify(result.output[0].data, null, 2));
    console.log('✓ Postman collection generated successfully: postman-collection.json');
  });
}

generatePostmanCollection();
