import test from 'node:test';import assert from 'node:assert/strict';
import {mcpCatalogPlatform,mcpTargetFromFiles,mcpTargetLabel} from '../src/lib/mcp-platform.js';
test('MCP target metadata maps phone, desktop and both into catalog platforms',()=>{
 assert.equal(mcpTargetFromFiles({}),'mobile');
 for(const [target,catalog,label] of [['mobile','mobile','Phone'],['desktop','desktop','Desktop'],['cross-platform','cross-play','Phone + desktop']]){assert.equal(mcpTargetFromFiles({'slop-platform.json':JSON.stringify({target_platform:target})}),target);assert.equal(mcpCatalogPlatform(target),catalog);assert.equal(mcpTargetLabel(target),label);}
 assert.throws(()=>mcpTargetFromFiles({'slop-platform.json':'{"target_platform":"console"}'}),/invalid platform/);
 assert.throws(()=>mcpTargetFromFiles({'slop-platform.json':'{"target_platform":"mobile","extra":true}'}),/invalid platform/);
 assert.throws(()=>mcpTargetFromFiles({'index.html':'<meta name="slop-target" content="mobile">','slop-platform.json':'{"target_platform":"desktop"}'}),/conflicting platform/);
});
