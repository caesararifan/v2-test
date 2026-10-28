'use strict';

const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3000;
const server = createApp().listen(PORT, () => {
  console.log(`Subscriber Usage API listening on http://localhost:${PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
