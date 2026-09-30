// A damped travelling wave. Faraway tiles and reduced-motion users stay still.
export function rippleAt(distance,age,strength=1){if(distance>300||age>1400)return 0;const envelope=Math.pow(Math.max(0,1-distance/300),1.5)*Math.exp(-age/430)*strength;return Math.sin(distance/35-age/100)*envelope;}
