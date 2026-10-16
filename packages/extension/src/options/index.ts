import '../../app.css';
import { mount } from 'svelte';
import { setDocumentLanguage, t } from '../i18n';
import { setupTheme } from '../theme';
import App from './Options.svelte';

setupTheme();
setDocumentLanguage();
document.title = t('optionsTitle');
const app = mount(App, {
	target: document.getElementById('app')!,
});

export default app;
