import { Innertube, UniversalCache } from 'youtubei.js';

async function testDecipher() {
  console.log('Creating Innertube session with local JS player player caching...');
  const yt = await Innertube.create({
    cache: new UniversalCache(false),
    generate_session_locally: true,
  });

  const songId = 'Dr50xWMk39Y';
  console.log('Fetching info for:', songId);
  const info = await yt.getInfo(songId);

  console.log('Title:', info.basic_info.title);
  console.log('Playability:', info.playability_status?.status);

  const formats = (info.streaming_data?.adaptive_formats || []).concat(info.streaming_data?.formats || []);
  console.log('Total formats:', formats.length);

  for (const f of formats) {
    if (f.has_audio) {
      console.log(`Format itag=${f.itag}, mime=${f.mime_type}, has_cipher=${f.has_cipher}, url=${!!f.url}`);
      try {
        const decipheredUrl = await f.decipher(yt.session.player);
        console.log(`   >>> DECIPHERED URL itag=${f.itag}: ${decipheredUrl.slice(0, 80)}...`);
      } catch(e) {
        console.log(`   Decipher failed: ${e.message}`);
      }
    }
  }
}

testDecipher().catch(console.error);
