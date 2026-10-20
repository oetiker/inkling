#!/usr/bin/env node
// Upload a zip to the Chrome Web Store and submit it for review, through the
// Chrome Web Store API v2 with a service account.
//
//   node scripts/publish-chrome.mjs inkling-chrome.zip [--upload-only]
//
// Environment:
//   CWS_SERVICE_ACCOUNT_KEY  the service account's JSON key (the content, not a path)
//   CWS_PUBLISHER_ID         the publisher ID from the developer dashboard
//   CWS_EXTENSION_ID         the ID of the item
import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const API = 'https://chromewebstore.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
/** Wait this long for an upload that the store processes in the background. */
const UPLOAD_TIMEOUT_MS = 5 * 60_000;

const [zipPath, ...flags] = process.argv.slice(2);
if (zipPath == null) {
	fail('usage: publish-chrome.mjs <zip> [--upload-only]');
}
const uploadOnly = flags.includes('--upload-only');
const key = JSON.parse(requireEnv('CWS_SERVICE_ACCOUNT_KEY'));
const item = `publishers/${requireEnv('CWS_PUBLISHER_ID')}/items/${requireEnv('CWS_EXTENSION_ID')}`;

const token = await accessToken(key);
const headers = { Authorization: `Bearer ${token}` };

const upload = await call(`${API}/upload/v2/${item}:upload`, {
	method: 'POST',
	headers: { ...headers, 'Content-Type': 'application/zip' },
	body: await readFile(zipPath),
});
let state = upload.uploadState;
const deadline = Date.now() + UPLOAD_TIMEOUT_MS;
while (state === 'IN_PROGRESS' && Date.now() < deadline) {
	await new Promise((resolve) => setTimeout(resolve, 5000));
	state = (await call(`${API}/v2/${item}:fetchStatus`, { headers })).lastAsyncUploadState;
}
if (state !== 'SUCCEEDED') {
	fail(`upload ended in state ${state}: ${JSON.stringify(upload)}`);
}
console.log(`Uploaded version ${upload.crxVersion ?? '(processed in the background)'}.`);

if (uploadOnly) {
	console.log('Not submitted for review (--upload-only).');
} else {
	const published = await call(`${API}/v2/${item}:publish`, {
		method: 'POST',
		headers: { ...headers, 'Content-Type': 'application/json' },
		body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH' }),
	});
	console.log(`Submitted for review, state ${published.state}.`);
	for (const warning of published.warningInfo?.warnings ?? []) {
		console.log(`Warning ${warning.reason}: ${warning.description}`);
	}
}

/** Exchange a JWT signed with the service account's key for an access token. */
async function accessToken({ client_email, private_key, token_uri }) {
	const now = Math.floor(Date.now() / 1000);
	const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
	const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
		iss: client_email,
		scope: SCOPE,
		aud: token_uri,
		iat: now,
		exp: now + 600,
	})}`;
	const signature = createSign('RSA-SHA256').update(unsigned).sign(private_key, 'base64url');
	const answer = await call(token_uri, {
		method: 'POST',
		body: new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			assertion: `${unsigned}.${signature}`,
		}),
	});
	return answer.access_token;
}

async function call(url, init) {
	const response = await fetch(url, init);
	const text = await response.text();
	if (!response.ok) {
		fail(`${init?.method ?? 'GET'} ${url.replace(/\?.*/, '')} answered ${response.status}: ${text}`);
	}
	return JSON.parse(text);
}

function requireEnv(name) {
	const value = process.env[name];
	if (value == null || value.trim().length === 0) {
		fail(`${name} is not set`);
	}
	return value.trim();
}

function fail(message) {
	console.error(message);
	process.exit(1);
}
