// The website's own capture modules, bundled for the recorder's host page.
import {encodeCapture} from '../../src/lib/capture.js';
import {animatedGifInfo} from '../../src/lib/gif-contracts.js';
import {clipWindow,createClipRing} from '../../src/lib/clip-ring.js';
window.SlopRecorder={encodeCapture,animatedGifInfo,clipWindow,createClipRing};
