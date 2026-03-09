import { env } from './config/env';
import app from './app';

const PORT = env.port;

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
