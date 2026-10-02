import {useEffect,useState} from 'react';
import bundledRelease from '../../public/downloads/android-release.json';
import {latestAndroidRelease} from '../lib/android-release.js';

export function useAndroidRelease(){
 const[release,setRelease]=useState(bundledRelease);
 useEffect(()=>{
  let active=true;
  latestAndroidRelease(bundledRelease).then(value=>{if(active)setRelease(value);});
  return()=>{active=false;};
 },[]);
 return release;
}
