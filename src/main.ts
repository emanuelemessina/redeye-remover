import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { locale, t } from './lib/i18n';

document.documentElement.lang = locale;
document.title = t.appName;

const app = mount(App, { target: document.getElementById('app')! });
export default app;
