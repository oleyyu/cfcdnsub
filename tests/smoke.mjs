import assert from 'node:assert/strict';
import {
  decryptPayload,
  encryptPayload,
  expandNodes,
  parseNodeLinks,
  parsePreferredEndpoints,
  renderClashSubscription,
  renderRawSubscription,
  renderSurgeSubscription,
} from '../src/core.js';

const vmess = 'vmess://ewogICJ2IjogIjIiLAogICJwcyI6ICJkZW1vLXdzLXRscyIsCiAgImFkZCI6ICJlZGdlLmV4YW1wbGUuY29tIiwKICAicG9ydCI6ICI0NDMiLAogICJpZCI6ICIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLAogICJzY3kiOiAiYXV0byIsCiAgIm5ldCI6ICJ3cyIsCiAgInRscyI6ICJ0bHMiLAogICJwYXRoIjogIi93cyIsCiAgImhvc3QiOiAiZWRnZS5leGFtcGxlLmNvbSIsCiAgInNuaSI6ICJlZGdlLmV4YW1wbGUuY29tIiwKICAiZnAiOiAiY2hyb21lIiwKICAiYWxwbiI6ICJoMixodHRwLzEuMSIKfQ==';

const { nodes } = parseNodeLinks(vmess);
assert.equal(nodes.length, 1);
assert.equal(nodes[0].type, 'vmess');
assert.equal(nodes[0].server, 'edge.example.com');

const { endpoints } = parsePreferredEndpoints('104.16.1.2#HK\n104.17.2.3:2053#US');
assert.equal(endpoints.length, 2);

const expanded = expandNodes(nodes, endpoints, { keepOriginalHost: true, namePrefix: 'CF' });
assert.equal(expanded.nodes.length, 2);
assert.equal(expanded.nodes[0].server, '104.16.1.2');
assert.equal(expanded.nodes[0].hostHeader, 'edge.example.com');
assert.equal(expanded.nodes[1].port, 2053);
assert.equal(expanded.nodes[0].name, 'demo-ws-tls | CF | HK');

const raw = renderRawSubscription(expanded.nodes);
assert.ok(raw.length > 10);

const clash = renderClashSubscription(expanded.nodes);
assert.match(clash, /proxies:/);
assert.match(clash, /edge\.example\.com/);

const duplicateNameClash = renderClashSubscription([
  { ...expanded.nodes[0], name: 'ShadowEscaper-Test | US | 电信', endpointSource: '104.16.1.2:443' },
  { ...expanded.nodes[0], name: 'ShadowEscaper-Test | US | 电信', server: '104.17.2.3', endpointSource: '104.17.2.3:443' },
]);
assert.match(duplicateNameClash, /name: "ShadowEscaper-Test \| US \| 电信"/);
assert.match(duplicateNameClash, /name: "ShadowEscaper-Test \| US \| 电信 \| 104\.17\.2\.3:443"/);

const vlessReality = 'vless://00000000-0000-4000-8000-000000000002@origin.example.com:443?encryption=none&security=reality&sni=www.cloudflare.com&fp=chrome&pbk=PUBLIC_KEY_SAMPLE&sid=abcd1234&type=tcp&flow=xtls-rprx-vision#reality-demo';
const parsedReality = parseNodeLinks(vlessReality);
const expandedReality = expandNodes(parsedReality.nodes, endpoints.slice(0, 1), { keepOriginalHost: true, namePrefix: 'CF' });
const clashReality = renderClashSubscription(expandedReality.nodes);
assert.match(clashReality, /type: vless/);
assert.match(clashReality, /reality-opts:/);
assert.match(clashReality, /public-key: "PUBLIC_KEY_SAMPLE"/);
assert.match(clashReality, /short-id: "abcd1234"/);

const surge = renderSurgeSubscription(expanded.nodes, 'https://sub.example.com/sub/demo?target=surge');
assert.match(surge, /\[Proxy]/);
assert.match(surge, /vmess/);

const secret = 'this-is-a-very-secret-key';
const token = await encryptPayload({ nodes: expanded.nodes }, secret);
const payload = await decryptPayload(token, secret);
assert.equal(payload.nodes.length, 2);

console.log('smoke test passed');
