import '../../app.css';
import { mount } from 'svelte';
import { setDocumentLanguage } from '../i18n';
import { setupTheme } from '../theme';
import App from './Popup.svelte';

setupTheme();
setDocumentLanguage();
const app = mount(App, {
	target: document.getElementById('app')!,
});

export default app;
