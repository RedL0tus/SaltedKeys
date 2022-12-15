import { WorkerRouter } from "@worker-tools/router";
import { KVNamespace } from "@cloudflare/workers-types";

import { pgpGetKey } from "./gpg";
import { sshGetKey, listSSHKeys } from "./ssh";

export const EXPIRE_TIME = 600000;

export const HELP = `
SaltedKeys
==========

/ssh                   - All SSH keys
/ssh/:fingerprint      - Get SSH key with the matching fingerprint
/pgp/:short_or_long-id - Get OpenPGP keys with the matching ID
`;

export const FETCH_PARAMETERS = {
	headers: {
		'Accept': 'application/vnd.github+json',
		'User-Agent': 'SaltedKeys',
	},
};

export interface Env {
	// Username
	USER: string,
	// Binding to KV.
	KV_KEYS: KVNamespace;
}

export function generate_response(body: string, status: number): Response {
	return new Response(body, {
		status: status,
		headers: {
			"Content-Type": "text/plain;charset=UTF-8",
			"Server": "SaltedKeys",
			"Cache-Control": "s-maxage=86400",
		},
	});
}

export function ok(body: string): Response {
	return generate_response(body, 200);
}

const router = new WorkerRouter()
	.get("/", () => ok(HELP))
	.get("/pgp/:id", pgpGetKey)
	.get("/ssh", listSSHKeys)
	.get("/ssh/:id", sshGetKey);

export default router;
