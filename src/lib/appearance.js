import {asOwner,result} from './supabase.js';
import {createAppearanceService} from './appearance-contracts.js';
export const appearance=createAppearanceService({asOwner,result});
