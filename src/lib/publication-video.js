import {assertPreviewClip,RECORDING_UNSUPPORTED} from './preview-recording.js';
// A blank, stalled or unsupported capture cannot reach publication or replace a preview.
export async function finishPublicationVideo(capture){
 if(!capture?.supported)throw new Error(RECORDING_UNSUPPORTED);
 return assertPreviewClip(await capture.finish());
}
