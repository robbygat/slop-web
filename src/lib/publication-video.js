// A new publication must have a recorded MP4 before it reaches review.
export async function finishPublicationVideo(capture){
 if(!capture?.supported)throw new Error('Video recording is unavailable in this browser. Publish through your connected coding app to include a video preview.');
 const clip=await capture.finish();
 if(!clip?.video?.byteLength||!clip?.poster?.byteLength||!Number.isFinite(clip.durationMs)||clip.durationMs<3000)throw new Error('Play a little longer, then try again. A video preview is required to publish.');
 return clip;
}
