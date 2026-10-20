// A stand-in for a LanguageTool server: reports every "Tset" as a misspelling of "Test".
// Like the real server, it skips the markup of annotated `data` and counts offsets in the
// original string, markup included.
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 18082);

/** A part of the list a real server sends from /v2/languages. */
const LANGUAGES = [
	{ name: 'German', code: 'de', longCode: 'de' },
	{ name: 'German (Germany)', code: 'de', longCode: 'de-DE' },
	{ name: 'German (Austria)', code: 'de', longCode: 'de-AT' },
	{ name: 'German (Swiss)', code: 'de', longCode: 'de-CH' },
	{ name: 'English', code: 'en', longCode: 'en' },
	{ name: 'English (US)', code: 'en', longCode: 'en-US' },
	{ name: 'English (GB)', code: 'en', longCode: 'en-GB' },
	{ name: 'French', code: 'fr', longCode: 'fr' },
];

/** The parameters of the latest check per text. Tests run in parallel, so each uses its own text. */
const checks = new Map();

createServer((req, res) => {
	res.setHeader('Access-Control-Allow-Origin', '*');

	if (req.method === 'OPTIONS') {
		res.writeHead(204, {
			'Access-Control-Allow-Methods': 'POST',
			'Access-Control-Allow-Headers': '*',
		});
		res.end();
		return;
	}

	if (req.method === 'GET' && req.url === '/v2/languages') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(LANGUAGES));
		return;
	}

	// The parameters of the latest check of a text, for tests of what the extension sends.
	if (req.method === 'GET' && req.url?.startsWith('/last-check?')) {
		const text = new URL(req.url, 'http://mock').searchParams.get('text');
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(checks.get(text) ?? null));
		return;
	}

	if (req.method === 'GET') {
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end('mock LanguageTool');
		return;
	}

	let body = '';
	req.on('data', (chunk) => {
		body += chunk;
	});
	req.on('end', () => {
		const params = new URLSearchParams(body);
		const data = params.get('data');
		const parts = data != null ? JSON.parse(data).annotation : [{ text: params.get('text') ?? '' }];
		const text = parts.map((part) => part.text ?? part.markup).join('');
		checks.set(text, Object.fromEntries(params));
		const offsets = [];
		let start = 0;
		for (const part of parts) {
			if (part.text != null) {
				for (let i = part.text.indexOf('Tset'); i !== -1; i = part.text.indexOf('Tset', i + 1)) {
					offsets.push(start + i);
				}
			}
			start += (part.text ?? part.markup).length;
		}
		const matches = [];
		for (const offset of offsets) {
			matches.push({
				message: 'Möglicher Tippfehler gefunden.',
				offset,
				length: 4,
				replacements: [{ value: 'Test' }],
				context: { text: text.slice(Math.max(0, offset - 20), offset + 24) },
				rule: {
					id: 'GERMAN_SPELLER_RULE',
					issueType: 'misspelling',
					category: { id: 'TYPOS', name: 'Mögliche Tippfehler' },
				},
			});
		}

		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(
			JSON.stringify({
				software: { name: 'mock LanguageTool', version: '0.0' },
				language: { code: 'de-DE', detectedLanguage: { code: 'de-DE' } },
				matches,
			}),
		);
	});
}).listen(port, '127.0.0.1');
