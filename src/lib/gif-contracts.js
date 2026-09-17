export function animatedGifInfo(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<20||String.fromCharCode(...bytes.slice(0,6))!=='GIF89a')throw new Error('The gameplay preview is not a valid animated GIF.');
 let p=6;const packed=bytes[p+4];p+=7;if(packed&128)p+=3*(1<<((packed&7)+1));let frames=0,delays=[];
 const blocks=()=>{while(true){if(p>=bytes.length)throw new Error('The gameplay GIF is incomplete.');const size=bytes[p++];if(!size)return;p+=size;if(p>bytes.length)throw new Error('The gameplay GIF is incomplete.');}};
 while(p<bytes.length){const marker=bytes[p++];if(marker===0x3b)break;if(marker===0x21){const label=bytes[p++];if(label===0xf9){if(bytes[p++]!==4||p+4>bytes.length)throw new Error('The gameplay GIF is incomplete.');delays.push(bytes[p+1]|bytes[p+2]<<8);p+=4;if(bytes[p++]!==0)throw new Error('The gameplay GIF is incomplete.');}else blocks();continue;}if(marker===0x2c){if(p+9>bytes.length)throw new Error('The gameplay GIF is incomplete.');const local=bytes[p+8];p+=9;if(local&128)p+=3*(1<<((local&7)+1));if(p>=bytes.length)throw new Error('The gameplay GIF is incomplete.');p++;blocks();frames++;continue;}throw new Error('The gameplay GIF is malformed.');}
 if(frames<3||delays.length<frames||delays.slice(0,frames).some(delay=>delay<2))throw new Error('Record a moving gameplay GIF with at least three timed frames.');
 return {frames,delays:delays.slice(0,frames)};
}
export function requireAnimatedGif(bytes,expectedFrames){const info=animatedGifInfo(bytes);if(Number.isInteger(expectedFrames)&&info.frames!==expectedFrames)throw new Error('The recorded gameplay GIF lost frames. Record it again.');return info;}
