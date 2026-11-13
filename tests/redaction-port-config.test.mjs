import test from 'node:test';
import assert from 'node:assert/strict';
import {redactSensitiveText,isSensitiveUrlKey} from '../scripts/lib/redaction.mjs';

test('numeric port assignments retain an agent namespace containing PASS',()=>{
  for(const text of ['YES_PASS_PORT=3081','MOOD_PASS_PORT = "3082"','{"ECHO_PASS_PORT": "3083"}','PASS_PORT=65535']){
    assert.equal(redactSensitiveText(text),text);
  }
});

test('a port suffix does not exempt credential values, credential names or URL parameters',()=>{
  for(const text of ['YES_PASS_PORT=not-a-port','YES_PASS_PORT=65536','PASSWORD_PORT=3081','API_KEY_PORT=3081','PASS=3081','YES_PASS_PORT="3081 token=private-value"']){
    assert.notEqual(redactSensitiveText(text),text,text);
  }
  assert.equal(isSensitiveUrlKey('YES_PASS_PORT'),true);
  assert.notEqual(redactSensitiveText('https://example.com/?YES_PASS_PORT=3081'),'https://example.com/?YES_PASS_PORT=3081');
});
