import { RouteContext } from "@worker-tools/router";
import { Endpoints } from "@octokit/types";

import { FETCH_PARAMETERS, EXPIRE_TIME, ok, generate_response } from "./index";

const KV_INDEX = "PGP_KEYS";

interface PGPKey {
    id: string,
    rawPublicKey: string,
}

type PGPKeysResponse = Endpoints["GET /users/{username}/gpg_keys"]["response"]["data"];
type PGPKeys = Array<PGPKey>;

class GitHubPGPKey implements PGPKey {
    id: string;
    rawPublicKey: string;

    constructor(id: string, rawPublicKey: string) {
        this.id = id;
        this.rawPublicKey = rawPublicKey;
    }
}

class PGPKeysWithDate {
    keys: PGPKeys;
    time: number;

    constructor(keys: PGPKeys, time: number) {
        this.keys = keys;
        this.time = time;
    }

    expired(): boolean {
        return (Date.now() - this.time) > EXPIRE_TIME;
    }

    getMatch(id: string): PGPKey | null {
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

export async function fetchPGPKeys(user: string): Promise<PGPKeysWithDate | null> {
    console.log(`Fetching keys for user ${user}...`);
    const res = await fetch(`https://api.github.com/users/${user}/gpg_keys`, FETCH_PARAMETERS);
    const ret: PGPKeys = [];
    if (res.status != 200) {
        return null;
    }
    const body: PGPKeysResponse = await res.json();
    body.forEach((key) => {
        const id = key.key_id;
        const rawKey = key.raw_key;
        if (rawKey != undefined) {
            console.log(`found id: ${id}`);
            const k = new GitHubPGPKey(id, rawKey);
            ret.push(k);
        }
    });
    return new PGPKeysWithDate(ret, Date.now());
}

export async function pgpGetKey(_req: Request, ctx: RouteContext): Promise<Response> {
    const id = ctx.match.pathname.groups["id"];
    console.log(`Finding match for ID: ${id}`);
    if ((id == null) || ((id.length != 8) && (id.length != 16))) {
        return generate_response(`Error: Invalid ID`, 403);
    }
    const kv = ctx.env.KV_KEYS;

    // Check cache
    const cached: PGPKeysWithDate | null = await kv.get(KV_INDEX, { type: "json" });
    let keys: PGPKeysWithDate;
    if (cached == null) {
        const new_result = await fetchPGPKeys(ctx.env.USER);
        if (new_result == null) {
            return generate_response(`Error: failed to fetch keys`, 403);
        }
        await kv.put(KV_INDEX, JSON.stringify(new_result));
        keys = new_result;
    } else {
        keys = new PGPKeysWithDate(cached.keys, cached.time);
    }

    // Get key
    const key = keys.getMatch(id);
    if ((key == null) && (! keys.expired())) {
        return generate_response(`Error: no matching key found`, 403);
    } else if (key == null) {
        const new_result = await fetchPGPKeys(ctx.env.USER);
        if (new_result == null) {
            return generate_response(`Error: failed to fetch keys`, 403);
        }
        await kv.put(KV_INDEX, JSON.stringify(new_result));
        const res = new_result.getMatch(id);
        if (res == null) {
            return generate_response(`Error: no matching key found`, 403);
        }
        return ok(res.rawPublicKey);
    }
    return ok(key.rawPublicKey);
}
