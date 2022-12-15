SaltedKeys
==========

GPG/SSH public hosting on Cloudflare Workers.
Public keys are from your GitHub Account, and SaltedKeys will serve them in the form of plain text.

Demo
----

Site root: <https://keys.salted.fish>.

 - All ssh keys: <https://keys.salted.fish/ssh>.
    - Individual ssh public key with fingerprint: `https://keys.salted.fish/ssh/:fingerprint`.
      - e.g. <https://keys.salted.fish/ssh/DDCKnSqGrH0JijavtrZuQCfHbeusZBpw2x79kE9ndKY>.
 - Individual OpenPGP public keys: `https://keys.salted.fish/pgp/:ID`.
   - e.g. <https://keys.salted.fish/pgp/4CADAB1B>.

Usage
-----

 - `git clone https://github.com/RedL0tus/SaltedKeys.git`
 - `cd SaltedKeys && yarn install && yarn build`
 - Edit [wrangler.toml](./wrangler.toml), change the `USER` variable to your GitHub username, and update your Workers KV binding accordingly.
 - `yarn wrangler publish`
