const packageName = "fountainjs-editor";
const registry = "https://registry.npmjs.org";
const audience = "npm:registry.npmjs.org";

const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;

if (!requestUrl || !requestToken) {
  throw new Error(
    "GitHub Actions did not provide an OIDC identity. Check the id-token: write permission.",
  );
}

const identityUrl = new URL(requestUrl);
identityUrl.searchParams.set("audience", audience);

const identityResponse = await fetch(identityUrl, {
  headers: {
    Accept: "application/json",
    Authorization: `Bearer ${requestToken}`,
  },
});

if (!identityResponse.ok) {
  throw new Error(
    `GitHub OIDC identity request failed with HTTP ${identityResponse.status}.`,
  );
}

const identity = await identityResponse.json();
if (typeof identity.value !== "string" || !identity.value) {
  throw new Error("GitHub OIDC identity response did not contain a token.");
}

const exchangeResponse = await fetch(
  `${registry}/-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(packageName)}`,
  {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${identity.value}`,
    },
  },
);

if (!exchangeResponse.ok) {
  const result = await exchangeResponse.json().catch(() => ({}));
  const reason =
    typeof result.message === "string" ? `: ${result.message}` : "";
  throw new Error(
    `npm rejected the trusted-publisher identity with HTTP ${exchangeResponse.status}${reason}`,
  );
}

const credential = await exchangeResponse.json();
if (typeof credential.token !== "string" || !credential.token) {
  throw new Error(
    "npm accepted the identity but did not issue a short-lived credential.",
  );
}

// Prevent accidental disclosure if a later runner diagnostic contains the value.
console.log(`::add-mask::${credential.token}`);
console.log(
  `Trusted publisher verified for ${packageName}; no package was staged or published.`,
);
