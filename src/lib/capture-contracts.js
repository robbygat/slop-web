export function captureDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 960 || height > 960) throw new Error('Captured frame exceeds the size limit.');
  // Stable canonical sizes keep the shared native/web receipt contract exact.
  // The source is letterboxed, never stretched or cropped, into its orientation.
  return width === height ? {width:640,height:640} : width > height ? {width:640,height:360} : {width:360,height:640};
}
export function validCaptureDimensions(width, height) {
  return width===360&&height===640||width===640&&(height===360||height===640);
}
