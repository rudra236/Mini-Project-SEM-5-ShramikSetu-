const fs = require('fs');
const content = fs.readFileSync('src/types/database.types.ts', 'utf8');
const regex = /"([a-z0-9_]+)":\s*\{\s*Row:/g;
let match;
const tables = [];
while ((match = regex.exec(content)) !== null) {
  tables.push(match[1]);
}
console.log('Total tables in database.types.ts:', tables.length);
console.log(tables.join(', '));
