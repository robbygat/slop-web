import test from 'node:test';
import assert from 'node:assert/strict';
import {discoveryBoundary} from '../src/lib/catalog-cursor.js';

const cursor = {created_at:'2026-09-08T07:06:17.841763+00:00',slug:'night-drift',plays:42};
test('discovery continuation retains all six timestamp digits for both ranked and chronological ties',()=>{
  for(const order of ['popular','newest']){
    const boundary=discoveryBoundary(cursor,order);
    assert.ok(boundary.includes(`created_at.eq.${cursor.created_at},slug.lt.${cursor.slug}`));
    assert.ok(boundary.includes(`created_at.lt.${cursor.created_at}`));
    assert.ok(!boundary.includes('.841Z'));
  }
});
test('discovery cursor rejects timestamps and slugs that can alter PostgREST filter grammar',()=>{
  for(const created_at of ['Sep 8 2026','2026-09-08','2026-09-08T07:06:17.8417631Z','2026-09-08T07:06:17Z),status.eq.draft','2026-99-08T07:06:17Z',null,42]) {
    assert.throws(()=>discoveryBoundary({...cursor,created_at}),/page has expired/);
  }
  assert.throws(()=>discoveryBoundary({...cursor,slug:'game),status.eq.draft'}),/page has expired/);
  assert.throws(()=>discoveryBoundary({...cursor,plays:NaN}),/page has expired/);
});
test('discovery cursor accepts original UTC and offset timestamp encodings',()=>{
  for(const created_at of ['2026-09-08T07:06:17Z','2026-09-08T07:06:17.8-04:00','2026-09-08T07:06:17.841+09:00']) {
    assert.ok(discoveryBoundary({...cursor,created_at}).includes(`created_at.eq.${created_at}`));
  }
});
