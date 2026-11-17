import dotenv from 'dotenv';
dotenv.config();
process.env.STS_ENV = process.argv[2] || 'prod';

const { getToken } = await import('./src/services/tokenService.js');
console.log(await getToken());
process.exit(0);
