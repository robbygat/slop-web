// Index counts real catalog games, regardless of interleaved cards or batches.
export const feedPromoAfter=index=>Number.isSafeInteger(index)&&index>=0&&(index+1)%10===0;
