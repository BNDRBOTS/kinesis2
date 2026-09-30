import { createApp } from './app.mjs';
if (process.env.NODE_ENV === 'production' && !process.env.APP_PASSWORD) throw new Error('Set APP_PASSWORD before exposing KINESIS in production.');
const port = Number(process.env.PORT || 3000);
const server = createApp().listen(port, '0.0.0.0', () => console.log(`KINESIS listening on ${port}`));
process.on('SIGTERM', () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10_000).unref(); });
