export function speechRecognitionFor(scope=globalThis){return scope.SpeechRecognition||scope.webkitSpeechRecognition||null;}
const errors={
 'not-allowed':'Microphone access was denied. Allow it in your browser or type your idea.',
 'service-not-allowed':'Dictation is unavailable in this browser. You can type your idea.',
 'audio-capture':'No microphone was found. Connect one or type your idea.',
 'network':'Dictation could not connect. Try again or type your idea.',
 'no-speech':'No speech was heard. Try again when you’re ready.',
};
export function createDictation({Recognition,onText,onListening,onError,maxLength=10000,language='en-US'}){
 let current=null,disposed=false;
 const stop=()=>{try{current?.stop();}catch{}};
 return {
  start(prefix=''){
   if(disposed||current||!Recognition)return false;
   let recognition;
   try{recognition=new Recognition();}catch{onError('Dictation is unavailable in this browser. You can type your idea.');return false;}
   current=recognition;recognition.lang=language;recognition.continuous=true;recognition.interimResults=true;
   const active=()=>!disposed&&current===recognition;
   recognition.onstart=()=>{if(active())onListening(true);};
   recognition.onresult=event=>{
    if(!active())return;
    const transcript=Array.from(event.results,result=>result[0]?.transcript||'').join(' ').trim();
    const text=[prefix.trimEnd(),transcript].filter(Boolean).join(' ').slice(0,maxLength);
    onText(text);if(text.length===maxLength)stop();
   };
   recognition.onerror=event=>{if(active()&&event.error!=='aborted')onError(errors[event.error]||'Dictation stopped. Try again or type your idea.');};
   recognition.onend=()=>{if(active()){current=null;onListening(false);}};
   try{recognition.start();return true;}catch{current=null;onListening(false);onError('Dictation could not start. Try again or type your idea.');return false;}
  },stop,
  dispose(){disposed=true;const recognition=current;current=null;if(recognition){recognition.onstart=recognition.onresult=recognition.onerror=recognition.onend=null;try{recognition.abort();}catch{}}},
 };
}
