import {useState} from 'react';
import {readBrowsePreferences,writeBrowsePreferences} from '../lib/browse-preferences.js';

export function useBrowsePreferences(){
 const [preferences,setPreferences]=useState(readBrowsePreferences);
 const update=patch=>setPreferences(writeBrowsePreferences(patch));
 return {...preferences,setPlatform:platform=>update({platform}),setOrder:order=>update({order})};
}
