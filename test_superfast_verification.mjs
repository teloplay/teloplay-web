import { searchYouTubeMusic } from './worker/search.js';
import { resolveStreamUrl } from './worker/stream.js';

async function testFastSearchAndStream() {
  console.log('=== 1. Testing Search for "safar" ===');
  const t0 = Date.now();
  const searchResults = await searchYouTubeMusic('safar', 10);
  console.log(`Found ${searchResults.length} tracks in ${Date.now() - t0}ms:`);

  for (let i = 0; i < Math.min(5, searchResults.length); i++) {
    const tr = searchResults[i];
    console.log(`  #${i + 1}: "${tr.title}" by "${tr.author}" (duration: ${tr.duration}s, thumbnail: ${tr.thumbnail})`);
  }

  console.log('\n=== 2. Testing Instant Stream Resolve for First 3 Tracks ===');
  for (let i = 0; i < Math.min(3, searchResults.length); i++) {
    const tr = searchResults[i];
    const tStart = Date.now();
    const query = `${tr.title} ${tr.author}`;
    const stream = await resolveStreamUrl(tr.videoId, query);
    const ms = Date.now() - tStart;
    console.log(`  Stream #${i + 1} (${tr.title}) resolved in ${ms}ms:`);
    console.log(`    Status: ${stream.ok ? 'OK' : 'FAIL'}`);
    console.log(`    Provider: ${stream.provider}`);
    console.log(`    URL: ${stream.url?.slice(0, 60)}...`);
  }
}

testFastSearchAndStream();
