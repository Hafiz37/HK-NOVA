import converter from 'openapi-to-postmanv2';
import fs from 'fs';

const openapiSpec = JSON.parse(fs.readFileSync('./openapi.json', 'utf8'));
converter.convert({ type: 'json', data: openapiSpec }, {}, (err, result) => {
  if (err) {
    console.error('Conversion failed:', err);
    process.exit(1);
  }
  if (!result.result) {
    console.error('Conversion failed:', result.reason);
    process.exit(1);
  }
  fs.writeFileSync('./postman-collection.json', JSON.stringify(result.output[0].data, null, 2));
  console.log('Postman collection generated successfully: postman-collection.json');
});
