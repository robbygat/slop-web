// Bound only this isolated renderer's raster density; CSS layout and native
// geometry remain unchanged while high-DPI phones avoid oversized GPU surfaces.
const originalDpr = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
const startingDpr = window.devicePixelRatio || 1;
try { Object.defineProperty(window, 'devicePixelRatio', {configurable:true,get:()=>Math.min(1.5, Number(originalDpr?.get?.call(window) || startingDpr))}); } catch {}
{{flutter_js}}
{{flutter_build_config}}
_flutter.loader.load({config:{canvasKitBaseUrl:'/native-character/canvaskit/',fontFallbackBaseUrl:'/native-character/fonts/',canvasKitVariant:'full'}});
