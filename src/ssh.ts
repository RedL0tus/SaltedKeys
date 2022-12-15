import { RouteContext } from "@worker-tools/router";
import { Endpoints } from "@octokit/types";
import { toByteArray, fromByteArray } from "base64-js";

import { FETCH_PARAMETERS, EXPIRE_TIME, ok, generate_response } from "./index";

const KV_INDEX = "SSH_KEYS";

interface SSHKey {
    type: string,
    id: string,
    publicKey: string,
}

type SSHKeysResponse = Endpoints["GET /users/{username}/keys"]["response"]["data"];
type SSHKeys = Array<SSHKey>;

class GitHubSSHKey implements SSHKey {
    type: string;
    id: string;
    publicKey: string;

    constructor(id: string, publicKey: string) {
        this.id = id;
        this.publicKey = publicKey;
        this.type = publicKey.split(" ")[0];
    }
}

class SSHKeysWithDate {
    keys: SSHKeys;
    time: number;

    constructor(keys: SSHKeys, time: number) {
        this.keys = keys;
        this.time = time;
    }

    expired(): boolean {
        return (Date.now() - this.time) > EXPIRE_TIME;
    }

    getMatch(id: string): SSHKey | null {
        for (const key of this.keys) {
            console.log(`checking: ${key.id} matched: ${key.id.endsWith(id)}`);
            if (key.id.endsWith(id)) {
                console.log(`found match: ${key.id}`);
                return key;
            }
        }
        console.log(`No match found for: ${id}`);
        return null;
    }
}

export async function calculateFingerprint(key: string): Promise<string | null> {
    try {
        const keyBuf = toByteArray(key);
        const digest = await crypto.subtle.digest({name: "SHA-256"}, keyBuf);
        const outBuffer = new Uint8Array(digest);
        const out = fromByteArray(outBuffer);
        return out.slice(0, out.length - 1);
    } catch {
        return null;
    }
}

export async function fetchSSHKeys(user: string): Promise<SSHKeysWithDate | null> {
    console.log(`Fetching SSH keys for user ${user}...`);
    const res = await fetch(`https://api.github.com/users/${user}/keys`, FETCH_PARAMETERS);
    const ret: SSHKeys = [];
    if (res.status != 200) {
        return null;
    }
    const body: SSHKeysResponse = await res.json();
    for (const key of body) {
        const rawKey = key.key;
        if (rawKey != undefined) {
            const keyBody = rawKey.split(" ")[1];
            const fp = await calculateFingerprint(keyBody);
            if (fp == null) {
                continue;
            }
            const k = new GitHubSSHKey(fp, rawKey);
            ret.push(k);
        }
    }
    return new SSHKeysWithDate(ret, Date.now());
}

export async function sshGetKey(_req: Request, ctx: RouteContext): Promise<Response> {
    const id = ctx.match.pathname.groups["id"];
    console.log(`Finding match for ID: ${id}`);
    if (id == null) {
        return generate_response(`Error: Invalid ID`, 403);
    }
    const kv = ctx.env.KV_KEYS;

    // Check cache
    const cached: SSHKeysWithDate | null = await kv.get(KV_INDEX, { type: "json" });
    let keys: SSHKeysWithDate;
    if (cached == null) {
        const new_result = await fetchSSHKeys(ctx.env.USER);
        if (new_result == null) {
            return generate_response(`Error: failed to fetch keys`, 403);
        }
        await kv.put(KV_INDEX, JSON.stringify(new_result));
        keys = new_result;
    } else {
        keys = new SSHKeysWithDate(cached.keys, cached.time);
    }

    // Get key
    const key = keys.getMatch(id);
    if ((key == null) && (! keys.expired())) {
        return generate_response(`Error: no matching key found`, 403);
    } else if (key == null) {
        const new_result = await fetchSSHKeys(ctx.env.USER);
        if (new_result == null) {
            return generate_response(`Error: failed to fetch keys`, 403);
        }
        await kv.put(KV_INDEX, JSON.stringify(new_result));
        const res = new_result.getMatch(id);
        if (res == null) {
            return generate_response(`Error: no matching key found`, 403);
        }
        return ok(res.publicKey);
    }
    return ok(key.publicKey);
}

export async function listSSHKeys(_req: Request, ctx: RouteContext): Promise<Response> {
    const kv = ctx.env.KV_KEYS;

    // Check cache
    const cached: SSHKeysWithDate | null = await kv.get(KV_INDEX, { type: "json" });
    let keys: SSHKeysWithDate;
    if (cached == null) {
        const new_result = await fetchSSHKeys(ctx.env.USER);
        if (new_result == null) {
            return generate_response(`Error: failed to fetch keys`, 403);
        }
        await kv.put(KV_INDEX, JSON.stringify(new_result));
        keys = new_result;
    } else {
        keys = new SSHKeysWithDate(cached.keys, cached.time);
    }

    let ret = "";
    for (const key of keys.keys) {
        ret += `# SHA256:${key.id} (${key.type})\n${key.publicKey}\n`;
    }
    return ok(ret);
}
