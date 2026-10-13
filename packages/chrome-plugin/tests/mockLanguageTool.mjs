// A stand-in for a LanguageTool server: reports every "Tset" as a misspelling of "Test".
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 18082);

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
		const text = new URLSearchParams(body).get('text') ?? '';
		const matches = [];
		for (
			let offset = text.indexOf('Tset');
			offset !== -1;
			offset = text.indexOf('Tset', offset + 1)
		) {
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
