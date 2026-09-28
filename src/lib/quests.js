import {asOwner, result} from './supabase.js';
import {createQuestService} from './quest-contracts.js';
const service = createQuestService({runAsOwner: asOwner, readResult: result});
export const loadQuests = service.load;
export const claimQuest = service.claim;
