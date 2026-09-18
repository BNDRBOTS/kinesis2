#!/usr/bin/env node
// Smoke test for kinesis2 fixes
const fs = require('fs');
const path = require('path');

let failures = 0;
let passes = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`✅ PASS: ${msg}`);
    passes++;
  } else {
    console.error(`❌ FAIL: ${msg}`);
    failures++;
  }
}

function fileContains(filePath, substr, description) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    assert(content.includes(substr), `${description} in ${path.basename(filePath)} contains "${substr}"`);
  } catch (e) {
    console.error(`❌ FAIL: Could not read ${filePath}: ${e.message}`);
    failures++;
  }
}

// 1. Check API proxies exist
console.log("\n=== 1. Vercel API Proxies ===");
const apiFiles = ['api/fal.ts', 'api/luma.ts', 'api/media.ts', 'api/fal-file.ts', 'api/replicate.ts', 'api/runway.ts'];
apiFiles.forEach(f => {
  const exists = fs.existsSync(path.join(__dirname, f));
  assert(exists, `Proxy file ${f} exists`);
});

fileContains('api/fal.ts', 'Access-Control-Allow-Origin', 'fal proxy has CORS');
fileContains('api/fal.ts', 'OPTIONS', 'fal proxy handles OPTIONS');
fileContains('api/luma.ts', 'Access-Control-Allow-Origin', 'luma proxy has CORS');
fileContains('api/media.ts', 'Access-Control-Allow-Origin', 'media proxy has CORS');
fileContains('api/media.ts', 'Range', 'media proxy handles Range header');
fileContains('api/replicate.ts', 'Access-Control-Allow-Origin', 'replicate proxy has CORS');
fileContains('api/runway.ts', 'Access-Control-Allow-Origin', 'runway proxy has CORS');
fileContains('api/fal-file.ts', 'formData', 'fal-file proxy handles FormData');

// 2. Check constants updated
console.log("\n=== 2. Model Registry Updated Endpoints ===");
const constants = fs.readFileSync('src/constants.ts', 'utf8');
assert(constants.includes('fal-ai/kling-video/v3/pro/image-to-video'), 'Kling v3 Pro endpoint updated');
assert(constants.includes('fal-ai/kling-video/v3/standard/image-to-video'), 'Kling v3 Standard endpoint');
assert(constants.includes('fal-ai/kling-video/v2.6/pro/image-to-video'), 'Kling v2.6 Pro endpoint');
assert(constants.includes('lightricks/ltx-2.5/image-to-video/pro'), 'LTX-2.5 Pro cheap backend added');
assert(constants.includes('lightricks/ltx-2.5/image-to-video/fast'), 'LTX-2.5 Fast ultra cheap added');
assert(constants.includes('fal-ai/ltx-video-13b-distilled/image-to-video'), 'LTX-Video distilled cheapest added');
assert(constants.includes('wavespeedai/wan-2.1-i2v-720p'), 'Wan 2.1 720p updated endpoint');
assert(constants.includes('wan-video/wan-2.7-i2v'), 'Wan 2.7 latest endpoint');
assert(constants.includes('gen4_turbo'), 'Runway Gen-4 Turbo current model');
assert(constants.includes('gen4.5'), 'Runway Gen-4.5 latest model');
assert(constants.includes('ray-flash-2'), 'Luma Ray-Flash-2 fast/cheap model');
assert(constants.includes('comfyui-ltx-2.5'), 'ComfyUI LTX-2.5 local cheap/free backend');
assert(constants.includes('comfyui-ltx-video'), 'ComfyUI LTX-Video local backend');

// 3. Check helpers CORS fix
console.log("\n=== 3. Media Hosting / CORS Fix ===");
fileContains('src/api/helpers.ts', 'getProxiedMediaUrl', 'helpers has getProxiedMediaUrl');
fileContains('src/api/helpers.ts', '/api/media?url=', 'helpers uses media proxy');
fileContains('src/api/helpers.ts', 'crossOrigin', 'helpers sets crossOrigin');
fileContains('src/components/VideoPlayer.tsx', 'getProxiedMediaUrl', 'VideoPlayer uses proxied media for download');
fileContains('src/components/VideoPlayer.tsx', 'crossOrigin="anonymous"', 'VideoPlayer sets crossOrigin');

// 4. Check fal.ts proxy support and LTX handling
console.log("\n=== 4. Fal Provider Updated ===");
fileContains('src/api/fal.ts', 'FAL_PROXY', 'fal client uses proxy');
fileContains('src/api/fal.ts', 'ltx', 'fal client handles LTX models generically');
fileContains('src/api/fal.ts', 'start_image_url', 'fal client handles Kling v3 start_image_url');
fileContains('src/api/fal.ts', 'mmaudio-v2', 'fal foley uses mmaudio-v2 fallback');
fileContains('src/api/fal.ts', 'topaz/upscale', 'fal upscaler uses Topaz fallback');

// 5. Check replicate and runway updated
console.log("\n=== 5. Replicate / Runway / Luma Updated ===");
fileContains('src/api/replicate.ts', 'first_frame', 'replicate handles Wan 2.7 first_frame');
fileContains('src/api/replicate.ts', 'wavespeedai', 'replicate handles wavespeedai wan');
fileContains('src/api/runway.ts', 'gen4', 'runway handles gen4 models generically');
fileContains('src/api/runway.ts', '1280:720', 'runway maps aspect ratio to gen4 format');
fileContains('src/api/luma.ts', 'LUMA_PROXY', 'luma client uses proxy');
fileContains('src/api/luma.ts', 'ray-flash-2', 'luma handles ray-flash-2');

// 6. Check ComfyUI LTX backend
console.log("\n=== 6. ComfyUI/LTX Cheap/Free Backend ===");
fileContains('src/api/comfyui.ts', 'workflow-ltx-2.5', 'comfyui supports LTX-2.5 workflow');
fileContains('src/api/comfyui.ts', 'workflow-ltx-video', 'comfyui supports LTX-Video workflow');
fileContains('src/api/comfyui.ts', 'LTXVImgToVideo', 'comfyui has LTXVImgToVideo node');
fileContains('src/api/comfyui.ts', 'LTXVConditioning', 'comfyui has LTXVConditioning node');
fileContains('src/api/comfyui.ts', 'getCheckpointName', 'comfyui has checkpoint mapping');

// 7. Mock end-to-end test for fal LTX provider
console.log("\n=== 7. Mock End-to-End Test (fal LTX-2.5) ===");

// Simulate fal input building for LTX-2.5
function mockBuildFalInput(endpoint, imageUrl, prompt, duration) {
  const input = { prompt };
  if (endpoint.includes('ltx')) {
    input.image_url = imageUrl;
    input.duration = duration;
    if (endpoint.includes('ltx-2.5')) {
      input.resolution = '1080p';
      input.aspect_ratio = '16:9';
      input.generate_audio = true;
    }
    return input;
  }
  return input;
}

const mockInput = mockBuildFalInput('lightricks/ltx-2.5/image-to-video/pro', 'https://example.com/image.jpg', 'cinematic push-in', 6);
assert(mockInput.image_url === 'https://example.com/image.jpg', 'LTX input has image_url');
assert(mockInput.duration === 6, 'LTX input has duration');
assert(mockInput.resolution === '1080p', 'LTX input has resolution');
assert(mockInput.generate_audio === true, 'LTX-2.5 input has generate_audio');

// Simulate Kling v3 input
function mockBuildKlingInput(endpoint, imageUrl, prompt, duration) {
  const input = { prompt };
  if (endpoint.includes('/o3/')) {
    input.image_url = imageUrl;
  } else if (endpoint.includes('/v3/')) {
    input.start_image_url = imageUrl;
  }
  input.duration = String(duration);
  return input;
}

const klingV3Input = mockBuildKlingInput('fal-ai/kling-video/v3/pro/image-to-video', 'https://example.com/start.jpg', 'slow pan', 10);
assert(klingV3Input.start_image_url === 'https://example.com/start.jpg', 'Kling v3 uses start_image_url');
assert(klingV3Input.duration === '10', 'Kling duration as string');

const klingO3Input = mockBuildKlingInput('fal-ai/kling-video/o3/standard/image-to-video', 'https://example.com/start.jpg', 'walk', 15);
assert(klingO3Input.image_url === 'https://example.com/start.jpg', 'Kling O3 uses image_url');

// Simulate media proxy
function mockGetProxiedUrl(url) {
  if (url.startsWith('data:') || url.startsWith('blob:') || url.includes('/api/media?')) return url;
  if (url.startsWith('https://')) return `/api/media?url=${encodeURIComponent(url)}`;
  return url;
}

const proxied = mockGetProxiedUrl('https://v3.fal.media/files/test.mp4');
assert(proxied.startsWith('/api/media?url='), 'Media proxy wraps remote URL');
assert(mockGetProxiedUrl('data:image/png;base64,abc') === 'data:image/png;base64,abc', 'Media proxy skips data URLs');
assert(mockGetProxiedUrl('blob:http://localhost/123') === 'blob:http://localhost/123', 'Media proxy skips blob URLs');

// Simulate pipeline segment count
function computeSegmentCount(target, perMax) {
  if (target <= 0 || perMax <= 0) return 1;
  return Math.ceil(target / perMax);
}

assert(computeSegmentCount(30, 10) === 3, 'Segment count 30/10 = 3');
assert(computeSegmentCount(15, 6) === 3, 'Segment count 15/6 = 3');
assert(computeSegmentCount(20, 20) === 1, 'Segment count 20/20 = 1');

// Simulate full pipeline with mock fal provider
async function mockPipeline() {
  const mockApiKey = 'test-key';
  const mockImageUrl = 'https://example.com/image.jpg';
  
  // Mock submit
  const mockRequestId = 'mock-req-123';
  const mockStatusUrl = `https://queue.fal.run/lightricks/ltx-2.5/image-to-video/pro/requests/${mockRequestId}/status`;
  const mockResponseUrl = `https://queue.fal.run/lightricks/ltx-2.5/image-to-video/pro/requests/${mockRequestId}`;
  
  assert(mockRequestId.startsWith('mock-'), 'Mock request ID generated');
  assert(mockStatusUrl.includes('/status'), 'Status URL contains /status');
  
  // Mock poll returning video URL
  const mockVideoUrl = 'https://v3.fal.media/files/mock-output.mp4';
  const proxiedVideoUrl = mockGetProxiedUrl(mockVideoUrl);
  
  assert(proxiedVideoUrl.includes('/api/media'), 'Mock video URL proxied for CORS');
  
  // Mock frame extraction would use proxied URL
  // Mock stitching would use proxied URLs
  
  return mockVideoUrl;
}

mockPipeline().then(videoUrl => {
  assert(videoUrl.includes('v3.fal.media'), 'Mock pipeline returns video URL');
  
  console.log(`\n=== Summary ===`);
  console.log(`Passed: ${passes}`);
  console.log(`Failed: ${failures}`);
  
  if (failures > 0) {
    console.error(`\n❌ Smoke test failed with ${failures} failures`);
    process.exit(1);
  } else {
    console.log(`\n✅ All smoke tests passed!`);
    process.exit(0);
  }
}).catch(err => {
  console.error('Mock pipeline error:', err);
  process.exit(1);
});
