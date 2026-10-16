// Packs build/ into package/<target>.zip for the browser stores.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { zipSync } from 'fflate';

const [, , target] = process.argv;
if (!target) {
	process.stderr.write('Specify a target filename as the first argument.\n');
	process.exit(1);
}

// Unix mode bits in the high 16 bits, as zip tools on Linux and macOS write them.
const DIR_ATTRS = ((0o40755 << 16) | 0x10) >>> 0;
const FILE_ATTRS = (0o100644 << 16) >>> 0;

const files = {};
for (const entry of readdirSync('build', { recursive: true, withFileTypes: true })) {
	const path = join(entry.parentPath, entry.name);
	const name = relative('build', path).split(sep).join('/');
	if (entry.isDirectory()) {
		files[`${name}/`] = [new Uint8Array(0), { level: 0, os: 3, attrs: DIR_ATTRS }];
	} else if (entry.isFile()) {
		files[name] = [readFileSync(path), { os: 3, attrs: FILE_ATTRS }];
	}
}

mkdirSync('package', { recursive: true });
writeFileSync(join('package', target), zipSync(files, { level: 9 }));
