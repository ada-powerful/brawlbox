import { startApp } from './render/app.ts';

const mount = document.getElementById('app');
if (!mount) throw new Error('mount #app missing');
void startApp(mount);
